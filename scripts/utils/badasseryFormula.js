'use strict';

/**
 * badasseryFormula.js — Badassery Score calculation
 *
 * Formula weights (validated by Danielle):
 *   Guest Compatibility   20%
 *   Audience Power        25%
 *   Podcast Authority     15%
 *   Activity/Consistency  20%
 *   Engagement            10%
 *   Contactability        10%
 *
 * Null handling: missing signals redistribute their weight proportionally
 * to the other signals in the same component. If ALL signals in a component
 * are null, the component returns 0.5 (neutral, not penalized).
 *
 * Exports:
 *   prepareBatchNorms(feeds)              — compute log-norm denominators
 *   calculateBadasseryScore(feed, norms)  — score one feed, mutates in place
 *   applyPercentiles(feeds)               — assign global + category percentiles
 */

const SCORE_VERSION = '1.0';

// ── Low-level helpers ─────────────────────────────────────────────────────────

/**
 * log10(value + 1) / log10(maxValue + 1), clamped to 0-1.
 * Returns null when either value is missing or denominator is 0.
 */
function logNorm(value, maxValue) {
  if (!value || value <= 0)       return null;
  if (!maxValue || maxValue <= 0) return null;
  const denom = Math.log10(maxValue + 1);
  if (denom === 0) return null;
  return Math.min(1, Math.log10(value + 1) / denom);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Weighted average with null redistribution.
 * Null signals donate their weight proportionally to present signals.
 * All-null → 0.5 (neutral).
 */
function componentScore(signals) {
  const valid = signals.filter(s => s.value !== null && s.value !== undefined && !isNaN(s.value));
  if (valid.length === 0) return 0.5;
  const totalW = valid.reduce((s, x) => s + x.weight, 0);
  return valid.reduce((s, x) => s + x.value * x.weight, 0) / totalW;
}

// ── Batch normalization ───────────────────────────────────────────────────────

/**
 * Compute max values across all feeds in this scoring run.
 * Must be called once on the full batch before calculateBadasseryScore().
 *
 * @param {object[]} feeds
 * @returns {{ maxReviews, maxViews, maxFollowers, maxRatio }}
 */
// Fixed anchor norms — calibrated against the broader podcast population.
// These replace batch-relative maximums so scores are comparable across runs.
// Update periodically by running: node scripts/utils/calibrateNorms.js
const FIXED_NORMS = {
  maxReviews   : 50000,   // ~top 0.1% of podcasts (Joe Rogan ~200K, most top shows 20-80K)
  maxViews     : 500000,  // avg views/ep for very large YouTube podcasts
  maxFollowers : 2000000, // combined social followers ceiling
  maxRatio     : 50,      // reviews per episode ceiling
};

function prepareBatchNorms(feeds) {
  // Use fixed anchors — makes scores comparable across different batches.
  // Batch-observed maximums are capped at fixed anchors so a small test batch
  // of 10 podcasts doesn't inflate scores relative to production.
  let batchReviews = 0, batchViews = 0, batchFollowers = 0, batchRatio = 0;

  for (const f of feeds) {
    const reviews   = (f.apple_rating_count || 0) + (f.spotify_review_count || 0);
    const views     = f.yt_avg_views_per_video || 0;
    const followers = (f.instagram_followers || 0) + (f.twitter_followers || 0);
    const ratio     = reviews / Math.max(f.episodeCount || 1, 1);

    if (reviews   > batchReviews)   batchReviews   = reviews;
    if (views     > batchViews)     batchViews     = views;
    if (followers > batchFollowers) batchFollowers = followers;
    if (ratio     > batchRatio)     batchRatio     = ratio;
  }

  return {
    maxReviews   : Math.max(batchReviews,   FIXED_NORMS.maxReviews),
    maxViews     : Math.max(batchViews,     FIXED_NORMS.maxViews),
    maxFollowers : Math.max(batchFollowers, FIXED_NORMS.maxFollowers),
    maxRatio     : Math.max(batchRatio,     FIXED_NORMS.maxRatio),
  };
}

// ── Per-signal calculators ────────────────────────────────────────────────────

// Guest authority by role — maps Phase 3b guest_role values to authority scores
const ROLE_AUTHORITY_SCORES = {
  CEO:          1.00,
  founder:      0.95,
  investor:     0.90,
  author:       0.85,
  academic:     0.80,
  journalist:   0.75,
  entrepreneur: 0.75,
  doctor:       0.75,
  politician:   0.70,
  YouTuber:     0.65,
  artist:       0.55,
  activist:     0.55,
  other:        0.40,
};

// Guest Compatibility
function sig_guestRatio(f) {
  return f.gemini_guest_ratio != null ? f.gemini_guest_ratio : null;
}

function sig_episodeLength(f) {
  const m = f.avg_episode_length_min;
  if (m == null || m <= 0) return null;
  if (m >= 30 && m <= 90)  return 1.0;
  if (m < 30)              return m / 30;
  return Math.max(0, 1 - (m - 90) / 90);   // linear decay from 90 → 180
}

function sig_guestAuthority(f) {
  // Primary: role-based score from gemini_recent_guests (Guest Intelligence, Phase 3b)
  // Cortex example: (5×0.40 + 2×0.65 + 2×0.75) / 9 = 4.80/9 = 0.533
  if (f.gemini_recent_guests && f.gemini_recent_guests.length > 0) {
    const scores = f.gemini_recent_guests.map(g => ROLE_AUTHORITY_SCORES[g.guest_role] ?? 0.40);
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  // Fallback: legacy string mapping (podcasts without recent_guests populated)
  const LEGACY = { none: 0.10, low: 0.25, medium: 0.50, high: 0.75, very_high: 0.875 };
  const v = (f.gemini_guest_authority || '').toLowerCase();
  return (v in LEGACY) ? LEGACY[v] : null;
}

// Audience Power
function sig_ratings(f, n) {
  const total = (f.apple_rating_count || 0) + (f.spotify_review_count || 0);
  return logNorm(total, n.maxReviews);
}

function sig_ytViews(f, n) {
  return logNorm(f.yt_avg_views_per_video, n.maxViews);
}

function sig_socialFollowers(f, n) {
  // Sum all available social follower counts (Instagram + Twitter + TikTok)
  const ig  = f.instagram_followers  || 0;
  const tw  = f.twitter_followers    || 0;
  const ttk = f.tiktok_followers     || 0;
  const total = ig + tw + ttk;
  return total > 0 ? logNorm(total, n.maxFollowers) : null;
}

function sig_chartRank(f) {
  const r1 = f.apple_chart_rank;
  const r2 = f.spotify_chart_rank;
  const best = (r1 && r2) ? Math.min(r1, r2) : (r1 || r2);
  if (!best) return null;
  return Math.max(0, 1 - best / 200);
}

// Podcast Authority
function sig_podcastAge(f) {
  const ts = f.oldestItemPubdate;
  if (!ts) return null;
  const years = (Date.now() / 1000 - ts) / (365.25 * 24 * 3600);
  return Math.min(Math.max(years, 0) / 5, 1);
}

function sig_contentQuality(f) {
  return f.ai_content_quality != null ? (f.ai_content_quality - 1) / 9 : null;
}

function sig_businessRelevance(f) {
  return f.ai_business_relevance != null ? (f.ai_business_relevance - 1) / 9 : null;
}

// Activity & Consistency
function sig_activity(f) {
  const ts = f.newestItemPubdate || f.lastUpdate;  // prefer last episode published, not last DB crawl
  if (!ts) return null;
  const daysSince = (Date.now() / 1000 - ts) / 86400;
  return Math.max(0, 1 - daysSince / 60);
}

function sig_publishConsistency(f) {
  return f.publish_consistency != null ? f.publish_consistency / 100 : null;
}

// Engagement
function sig_reviewsPerEpisode(f, n) {
  const total = (f.apple_rating_count || 0) + (f.spotify_review_count || 0);
  if (total === 0) return null;
  const ratio = total / Math.max(f.episodeCount || 1, 1);
  return logNorm(ratio, n.maxRatio);
}

function sig_rating(f) {
  const vals = [f.apple_rating, f.spotify_rating].filter(r => r != null && r > 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length / 5;
}

// Contactability
const GENERIC_05 = new Set([
  'contact', 'info', 'press', 'media', 'podcast', 'show', 'support',
  'feedback', 'admin', 'general', 'inquiries', 'inquiry', 'booking',
  'bookings', 'noreply', 'no-reply',
]);
const GENERIC_07 = new Set([
  'hello', 'hi', 'hey', 'team', 'crew', 'studio', 'listen',
  'pod', 'thepod', 'mail', 'email', 'ask', 'reach',
]);

function sig_emailQuality(f) {
  const email = f.rss_owner_email || f.website_email || '';
  if (!email) return 0;   // absent is informative → 0 (not null, so no weight redistribution)
  const local = email.split('@')[0].toLowerCase();
  if (GENERIC_05.has(local)) return 0.5;
  if (GENERIC_07.has(local)) return 0.7;
  return 1.0;
}

function sig_contactRichness(f) {
  const hasEmail    = !!(f.rss_owner_email || f.website_email);
  const socialCount = [
    f.website_instagram, f.website_twitter,  f.website_linkedin,
    f.website_youtube,   f.website_spotify,   f.website_facebook,
  ].filter(Boolean).length;
  return (Number(hasEmail) + socialCount * 0.15) / 1.9;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Calculate Badassery Score for a single enriched feed.
 * Mutates feed in place and returns it.
 *
 * @param {object} feed   Phase 4+5 enriched feed
 * @param {object} norms  From prepareBatchNorms()
 * @returns {object}
 */
function calculateBadasseryScore(feed, norms) {
  const missing = [];

  // ── Guest Compatibility (20%) ────────────────────────────────────────────
  const gR = sig_guestRatio(feed);
  const eL = sig_episodeLength(feed);
  const gA = sig_guestAuthority(feed);
  if (gR === null) missing.push('gemini_guest_ratio');
  if (eL === null) missing.push('avg_episode_length_min');
  if (gA === null) missing.push('gemini_guest_authority');
  const scoreGuest = componentScore([
    { value: gR, weight: 0.40 },
    { value: eL, weight: 0.30 },
    { value: gA, weight: 0.30 },
  ]);

  // ── Audience Power (25%) ─────────────────────────────────────────────────
  const rv = sig_ratings(feed, norms);
  const yt = sig_ytViews(feed, norms);
  const sf = sig_socialFollowers(feed, norms);
  const cr = sig_chartRank(feed);
  if (rv === null) missing.push('review_counts');
  if (yt === null) missing.push('yt_avg_views_per_video');
  if (sf === null) missing.push('instagram_followers');
  if (cr === null) missing.push('chart_rank');
  const scoreAudience = componentScore([
    { value: rv, weight: 0.35 },
    { value: yt, weight: 0.25 },
    { value: sf, weight: 0.20 },
    { value: cr, weight: 0.20 },
  ]);

  // ── Podcast Authority (15%) ──────────────────────────────────────────────
  const pa = sig_podcastAge(feed);
  const cq = sig_contentQuality(feed);
  const br = sig_businessRelevance(feed);
  if (pa === null) missing.push('oldestItemPubdate');
  if (cq === null) missing.push('ai_content_quality');
  if (br === null) missing.push('ai_business_relevance');
  const scoreAuthority = componentScore([
    { value: pa, weight: 0.35 },
    { value: cq, weight: 0.35 },
    { value: br, weight: 0.30 },
  ]);

  // ── Activity & Consistency (20%) ─────────────────────────────────────────
  const ac = sig_activity(feed);
  const pc = sig_publishConsistency(feed);
  if (ac === null) missing.push('lastUpdate/newestItemPubdate');
  if (pc === null) missing.push('publish_consistency');
  const scoreActivity = componentScore([
    { value: ac, weight: 0.60 },
    { value: pc, weight: 0.40 },
  ]);

  // ── Engagement (10%) ─────────────────────────────────────────────────────
  const rp = sig_reviewsPerEpisode(feed, norms);
  const ra = sig_rating(feed);
  if (rp === null) missing.push('reviews_per_episode');
  if (ra === null) missing.push('apple_rating/spotify_rating');
  const scoreEngagement = componentScore([
    { value: rp, weight: 0.40 },
    { value: ra, weight: 0.60 },
  ]);

  // ── Contactability (10%) ─────────────────────────────────────────────────
  const eq = sig_emailQuality(feed);     // 0 when absent — not null (deliberate)
  const rc = sig_contactRichness(feed);  // always computable
  if (!feed.rss_owner_email && !feed.website_email) missing.push('email');
  const scoreContact = componentScore([
    { value: eq, weight: 0.60 },
    { value: rc, weight: 0.40 },
  ]);

  // ── Final weighted sum ───────────────────────────────────────────────────
  const raw =
    scoreGuest       * 0.20 +
    scoreAudience    * 0.25 +
    scoreAuthority   * 0.15 +
    scoreActivity    * 0.20 +
    scoreEngagement  * 0.10 +
    scoreContact     * 0.10;

  // Store raw inputs + computed ratios for report generation (stripped before Firestore writes)
  feed._score_debug = {
    norms,
    guest:      { inputs: { gemini_guest_ratio: feed.gemini_guest_ratio, avg_episode_length_min: feed.avg_episode_length_min, gemini_guest_authority: feed.gemini_guest_authority, gemini_recent_guests: feed.gemini_recent_guests }, ratios: { gR, eL, gA }, score: round2(scoreGuest * 100) },
    audience:   { inputs: { apple_rating_count: feed.apple_rating_count, spotify_review_count: feed.spotify_review_count, yt_avg_views_per_video: feed.yt_avg_views_per_video, instagram_followers: feed.instagram_followers, apple_chart_rank: feed.apple_chart_rank, spotify_chart_rank: feed.spotify_chart_rank }, ratios: { rv, yt, sf, cr }, score: round2(scoreAudience * 100) },
    authority:  { inputs: { oldestItemPubdate: feed.oldestItemPubdate, ai_content_quality: feed.ai_content_quality, ai_business_relevance: feed.ai_business_relevance }, ratios: { pa, cq, br }, score: round2(scoreAuthority * 100) },
    activity:   { inputs: { lastUpdate: feed.lastUpdate, newestItemPubdate: feed.newestItemPubdate, publish_consistency: feed.publish_consistency }, ratios: { ac, pc }, score: round2(scoreActivity * 100) },
    engagement: { inputs: { apple_rating_count: feed.apple_rating_count, spotify_review_count: feed.spotify_review_count, episodeCount: feed.episodeCount, apple_rating: feed.apple_rating, spotify_rating: feed.spotify_rating }, ratios: { rp, ra }, score: round2(scoreEngagement * 100) },
    contact:    { inputs: { email: feed.rss_owner_email || feed.website_email || null, website_instagram: feed.website_instagram, website_twitter: feed.website_twitter, website_linkedin: feed.website_linkedin, website_youtube: feed.website_youtube, website_spotify: feed.website_spotify, website_facebook: feed.website_facebook }, ratios: { eq, rc }, score: round2(scoreContact * 100) },
  };

  feed.ai_badassery_score         = round2(raw * 100);
  feed.score_guest_compatibility  = round2(scoreGuest    * 100);
  feed.score_audience_power       = round2(scoreAudience * 100);
  feed.score_podcast_authority    = round2(scoreAuthority * 100);
  feed.score_activity_consistency = round2(scoreActivity * 100);
  feed.score_engagement           = round2(scoreEngagement * 100);
  feed.score_contactability       = round2(scoreContact   * 100);
  feed.score_missing_signals      = [...new Set(missing)];
  feed.score_version              = SCORE_VERSION;

  return feed;
}

// ── Percentiles ───────────────────────────────────────────────────────────────

function _calcPercentile(score, sortedAsc) {
  const total = sortedAsc.length;
  if (total === 0) return 50;
  let below = 0, equal = 0;
  for (const s of sortedAsc) {
    if (s < score) below++;
    else if (s === score) equal++;
  }
  return Math.round((below + equal * 0.5) / total * 100);
}

/**
 * Assign ai_global_percentile and ai_category_percentile to each feed.
 * Mutates in place. Falls back to global percentile for categories < 5 feeds.
 *
 * @param {object[]} feeds  All scored feeds (must have ai_badassery_score)
 * @returns {object[]}
 */
function applyPercentiles(feeds) {
  if (feeds.length === 0) return feeds;

  // Global
  const globalSorted = feeds.map(f => f.ai_badassery_score).sort((a, b) => a - b);
  for (const feed of feeds) {
    feed.ai_global_percentile = _calcPercentile(feed.ai_badassery_score, globalSorted);
  }

  // Per category
  const byCategory = {};
  for (const feed of feeds) {
    const cat = feed.ai_primary_category || 'Other';
    (byCategory[cat] = byCategory[cat] || []).push(feed);
  }

  for (const members of Object.values(byCategory)) {
    const catSorted = members.map(f => f.ai_badassery_score).sort((a, b) => a - b);
    for (const feed of members) {
      feed.ai_category_percentile = catSorted.length < 5
        ? feed.ai_global_percentile
        : _calcPercentile(feed.ai_badassery_score, catSorted);
    }
  }

  return feeds;
}

module.exports = { prepareBatchNorms, calculateBadasseryScore, applyPercentiles };
