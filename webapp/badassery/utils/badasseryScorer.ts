/**
 * badasseryScorer.ts — Client-side port of badasseryFormula.js
 * Used for immediate rescoring after manual data edits.
 * Uses FIXED_NORMS (same anchors as the server-side formula).
 */

import { PodcastDocument } from '../services/podcastService';

const FIXED_NORMS = {
  maxReviews:   50000,
  maxViews:     500000,
  maxFollowers: 2000000,
  maxRatio:     50,
};

const ROLE_AUTHORITY: Record<string, number> = {
  CEO: 1.00, founder: 0.95, investor: 0.90, author: 0.85,
  academic: 0.80, journalist: 0.75, entrepreneur: 0.75, doctor: 0.75,
  politician: 0.70, YouTuber: 0.65, artist: 0.55, activist: 0.55, other: 0.40,
};

function logNorm(value: number | null | undefined, maxValue: number): number | null {
  if (!value || value <= 0) return null;
  const denom = Math.log10(maxValue + 1);
  if (denom === 0) return null;
  return Math.min(1, Math.log10(value + 1) / denom);
}

function r2(n: number): number {
  return Math.round(n * 100) / 100;
}

interface Signal { value: number | null; weight: number; }

function componentScore(signals: Signal[]): number {
  const valid = signals.filter(s => s.value !== null && s.value !== undefined && !isNaN(s.value as number));
  if (valid.length === 0) return 0.5;
  const totalW = valid.reduce((s, x) => s + x.weight, 0);
  return valid.reduce((s, x) => s + (x.value as number) * x.weight, 0) / totalW;
}

export interface BadasseryScores {
  ai_badassery_score: number;
  score_guest_compatibility: number;
  score_audience_power: number;
  score_podcast_authority: number;
  score_activity_consistency: number;
  score_engagement: number;
  score_contactability: number;
  score_missing_signals: string[];
}

export function recalcBadasseryScore(p: PodcastDocument): BadasseryScores {
  const n = FIXED_NORMS;
  const missing: string[] = [];

  // Guest Compatibility (20%)
  const gR = p.gemini_guest_ratio ?? null;
  const eLv = p.avg_episode_length_min;
  const eL = eLv == null || eLv <= 0 ? null
    : eLv >= 30 && eLv <= 90 ? 1.0
    : eLv < 30 ? eLv / 30
    : Math.max(0, 1 - (eLv - 90) / 90);
  let gA: number | null = null;
  if (p.gemini_recent_guests && p.gemini_recent_guests.length > 0) {
    const scores = p.gemini_recent_guests.map((g: any) => ROLE_AUTHORITY[g.guest_role] ?? 0.40);
    gA = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;
  } else if (p.gemini_guest_authority) {
    const LEG: Record<string, number> = { none: 0.10, low: 0.25, medium: 0.50, high: 0.75, very_high: 0.875 };
    gA = LEG[(p.gemini_guest_authority || '').toLowerCase()] ?? null;
  }
  if (gR === null) missing.push('gemini_guest_ratio');
  if (eL === null) missing.push('avg_episode_length_min');
  if (gA === null) missing.push('gemini_guest_authority');
  const scoreGuest = componentScore([
    { value: gR, weight: 0.40 },
    { value: eL, weight: 0.30 },
    { value: gA, weight: 0.30 },
  ]);

  // Audience Power (25%)
  const totalReviews = (p.apple_rating_count ?? 0) + (p.spotify_review_count ?? 0);
  const rv = logNorm(totalReviews, n.maxReviews);
  const yt = logNorm(p.yt_avg_views_per_video, n.maxViews);
  const socialTotal = (p.instagram_followers ?? 0) + (p.twitter_followers ?? 0);
  const sf = socialTotal > 0 ? logNorm(socialTotal, n.maxFollowers) : null;
  const bestRank = Math.min(p.apple_chart_rank ?? Infinity, p.spotify_chart_rank ?? Infinity);
  const cr = bestRank < Infinity ? Math.max(0, 1 - bestRank / 200) : null;
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

  // Podcast Authority (15%)
  const ts = p.oldestItemPubdate;
  const pa = ts ? Math.min(Math.max((Date.now() / 1000 - ts) / (365.25 * 86400), 0) / 5, 1) : null;
  const cq = p.ai_content_quality != null ? (p.ai_content_quality - 1) / 9 : null;
  const br = p.ai_business_relevance != null ? (p.ai_business_relevance - 1) / 9 : null;
  if (pa === null) missing.push('oldestItemPubdate');
  if (cq === null) missing.push('ai_content_quality');
  if (br === null) missing.push('ai_business_relevance');
  const scoreAuthority = componentScore([
    { value: pa, weight: 0.35 },
    { value: cq, weight: 0.35 },
    { value: br, weight: 0.30 },
  ]);

  // Activity & Consistency (20%)
  const lastTs = (p.newestItemPubdate ?? p.lastUpdate) as number | null | undefined;
  const ac = lastTs ? Math.max(0, 1 - ((Date.now() / 1000 - lastTs) / 86400) / 60) : null;
  const pc = p.publish_consistency != null ? p.publish_consistency / 100 : null;
  if (ac === null) missing.push('lastUpdate/newestItemPubdate');
  if (pc === null) missing.push('publish_consistency');
  const scoreActivity = componentScore([
    { value: ac, weight: 0.60 },
    { value: pc, weight: 0.40 },
  ]);

  // Engagement (10%)
  const ratio = totalReviews > 0 ? totalReviews / Math.max(p.episodeCount || 1, 1) : 0;
  const rp = ratio > 0 ? logNorm(ratio, n.maxRatio) : null;
  const ratings = [p.apple_rating, p.spotify_rating].filter((r): r is number => r != null && r > 0);
  const ra = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length / 5 : null;
  if (rp === null) missing.push('reviews_per_episode');
  if (ra === null) missing.push('apple_rating/spotify_rating');
  const scoreEngagement = componentScore([
    { value: rp, weight: 0.40 },
    { value: ra, weight: 0.60 },
  ]);

  // Contactability (10%)
  const email = p.rss_owner_email || p.website_email || '';
  const GENERIC_05 = new Set(['contact','info','press','media','podcast','show','support','feedback','admin','general','inquiries','inquiry','booking','bookings','noreply','no-reply']);
  const GENERIC_07 = new Set(['hello','hi','hey','team','crew','studio','listen','pod','thepod','mail','email','ask','reach']);
  const local = email.split('@')[0].toLowerCase();
  const eq = !email ? 0 : GENERIC_05.has(local) ? 0.5 : GENERIC_07.has(local) ? 0.7 : 1.0;
  const socialCount = [p.website_instagram, p.website_twitter, p.website_linkedin, p.website_youtube, p.website_spotify, p.website_facebook].filter(Boolean).length;
  const rc = (Number(!!email) + socialCount * 0.15) / 1.9;
  if (!email) missing.push('email');
  const scoreContact = componentScore([
    { value: eq, weight: 0.60 },
    { value: rc, weight: 0.40 },
  ]);

  const raw = scoreGuest * 0.20 + scoreAudience * 0.25 + scoreAuthority * 0.15 + scoreActivity * 0.20 + scoreEngagement * 0.10 + scoreContact * 0.10;

  return {
    ai_badassery_score:          r2(raw * 100),
    score_guest_compatibility:   r2(scoreGuest * 100),
    score_audience_power:        r2(scoreAudience * 100),
    score_podcast_authority:     r2(scoreAuthority * 100),
    score_activity_consistency:  r2(scoreActivity * 100),
    score_engagement:            r2(scoreEngagement * 100),
    score_contactability:        r2(scoreContact * 100),
    score_missing_signals:       [...new Set(missing)],
  };
}
