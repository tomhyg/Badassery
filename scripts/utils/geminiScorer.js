/**
 * Gemini Scorer — shared scoring logic
 *
 * Extracted from parallel_scoring_v2.js so it can be reused by
 * weekly_pipeline.js without importing the full scoring script.
 *
 * Exports:
 *   BADASSERY_NICHES          — 31 niche labels
 *   BADASSERY_TOPICS          — 59 topic labels
 *   initKeyPool(opts)         — call once with API key(s) + rate limit
 *   categorizeSinglePodcast() — Gemini categorization with retry
 *   calculateEngagementLevel()
 *   calculateAudienceSize()
 *   calculateContentQuality()
 *   calculateMonetizationPotential()
 *   calculatePowerScore()
 *   calculatePercentiles()    — assigns category + global percentile to a batch
 *   applyBadasseryScores()    — applies the 40/30/30 formula to a scored batch
 */

'use strict';

const { GeminiKeyPool }      = require('./rateLimiter');
const { retryWithBackoff }   = require('./retryWithBackoff');

// ============================================================================
// CONSTANTS
// ============================================================================

const BADASSERY_NICHES = [
  'Female Founders & Women in Business',
  'Tech Leadership & Engineering',
  'Startup Founders & Entrepreneurs',
  'Executive Coaches & Leadership Consultants',
  'Wellness Coaches & Health Experts',
  'Expat Life & International Living',
  'Community Builders & Event Organizers',
  'SaaS & Product Leaders',
  'AI & Machine Learning Experts',
  'Marketing & Brand Strategists',
  'Venture Capital & Investors',
  'Social Impact & Non-Profit Leaders',
  'Sales & Revenue Strategists',
  'Organizational Change Consultants',
  'Personal Development Coaches',
  'Spiritual Intelligence & Mindfulness',
  'Career Transition Coaches',
  'Content Creators & Storytellers',
  'Pricing & Monetization Experts',
  'Data & Analytics Leaders',
  'HR & People Operations',
  'Finance & Investing Experts',
  'Parenting & Family',
  'Health & Fitness Professionals',
  'Mental Health & Therapy',
  'Creative & Design Leaders',
  'Education & Learning',
  'Sustainability & ESG',
  'Food & Nutrition',
  'Travel & Lifestyle',
  'General Business & Lifestyle',
];

const BADASSERY_TOPICS = [
  'Leadership', 'Entrepreneurship', 'Marketing', 'AI & Technology',
  'Health & Wellness', 'Business Strategy', 'Personal Growth',
  'Career Development', 'Startups', 'Innovation', 'Emotional Intelligence',
  'Change Management', 'Product Development', 'Venture Capital',
  'Women in Business', 'Scaling & Growth', 'Storytelling',
  'Community Building', 'Pricing Strategy', 'Data & Analytics',
  'Social Impact', 'Mental Health', 'Spirituality & Purpose',
  'Finance & Investing', 'Organizational Culture', 'Sales & Revenue',
  'Behavior Change', 'Content Strategy', 'SaaS & Software', 'Parenting',
  'Nutrition & Diet', 'Fitness & Exercise', 'Sustainability', 'Education',
  'Travel & Expat Life', 'Creativity & Design', 'Relationships',
  'Work-Life Balance', 'Remote Work', 'Diversity & Inclusion',
  'Public Speaking', 'Networking', 'Negotiation', 'Productivity',
  'Mindfulness', 'Consulting', 'Transformation', 'Resilience',
  'Self-Improvement', 'Digital Marketing', 'Brand Building',
  'Customer Success', 'Operations', 'Fundraising', 'Team Building',
  'Personal Branding', 'Coaching', 'Podcasting', 'Writing & Publishing',
  'Industry Insights',
];

// ============================================================================
// KEY POOL (lazy singleton — call initKeyPool() before first use)
// ============================================================================

let _keyPool = null;

/**
 * Initialise the Gemini key pool. Must be called once before
 * categorizeSinglePodcast() is used.
 *
 * @param {object} opts
 * @param {string[]} [opts.apiKeys]       Defaults to GEMINI_API_KEYS env / GEMINI_API_KEY env
 * @param {number}   [opts.ratePerSecond] Tokens per second per key (default 10)
 */
function initKeyPool(opts = {}) {
  const keys = opts.apiKeys || [
    ...((process.env.GEMINI_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean)),
    ...(process.env.GEMINI_API_KEY ? [process.env.GEMINI_API_KEY] : []),
  ].filter((k, i, arr) => k && arr.indexOf(k) === i);

  if (keys.length === 0) {
    throw new Error(
      '[geminiScorer] No Gemini API key found. ' +
      'Set GEMINI_API_KEY or GEMINI_API_KEYS in .env'
    );
  }

  _keyPool = new GeminiKeyPool(keys, opts.ratePerSecond || 10);
  return _keyPool;
}

function _getKeyPool() {
  if (!_keyPool) throw new Error('[geminiScorer] Call initKeyPool() before scoring.');
  return _keyPool;
}

// ============================================================================
// UTILITY HELPERS
// ============================================================================

function safeGet(obj, path, defaultValue = null) {
  return path.split('.').reduce((acc, part) => acc?.[part], obj) ?? defaultValue;
}

function safeInt(value) {
  const num = parseInt(value);
  return isNaN(num) ? 0 : num;
}

function safeLog(value) {
  if (!value || value <= 0) return 0.0;
  return Math.log10(value + 1);
}

function getDaysSince(podcast) {
  const fields = [
    'lastUpdate', 'latest_episode_date', 'newestItemPubdate',
    'lastBuildDate', 'rss_last_update',
  ];
  for (const field of fields) {
    const val = safeGet(podcast, field);
    if (val) {
      try {
        const d = new Date(typeof val === 'number' ? val * 1000 : val);
        if (!isNaN(d.getTime())) {
          return Math.floor((Date.now() - d) / 86400000);
        }
      } catch (_) { /* try next */ }
    }
  }
  return null;
}

function getRecentYouTubeViews(podcast) {
  const views = [];
  for (let i = 1; i <= 10; i++) {
    const v = safeInt(safeGet(podcast, `recent_${i}_views`));
    if (v > 0) views.push(v);
  }
  return views;
}

// ============================================================================
// SCORING FUNCTIONS (identical logic to parallel_scoring_v2.js)
// ============================================================================

function calculateEngagementLevel(podcast) {
  const WEIGHTS = { apple: 3.0, youtube: 3.0, freshness: 2.0, social: 1.0 };
  const scores = [];
  let totalWeight = 0;

  const appleRating  = parseFloat(safeGet(podcast, 'apple_rating')) || 0;
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  if (appleRating > 0 && appleReviews >= 5) {
    let s = appleRating * 2;
    if (appleReviews >= 100) s += 1;
    if (appleReviews >= 500) s += 1;
    scores.push({ val: Math.min(10.0, s), weight: WEIGHTS.apple });
    totalWeight += WEIGHTS.apple;
  }

  const ytSubs      = safeInt(safeGet(podcast, 'yt_subscribers'));
  const recentViews = getRecentYouTubeViews(podcast);
  if (ytSubs > 0 && recentViews.length >= 3) {
    const avgViews = recentViews.reduce((a, b) => a + b, 0) / recentViews.length;
    const ratio    = avgViews / ytSubs;
    let ytScore    = 1.0;
    if      (ratio >= 0.15) ytScore = 10.0;
    else if (ratio >= 0.10) ytScore =  8.0;
    else if (ratio >= 0.05) ytScore =  6.0;
    else if (ratio >= 0.02) ytScore =  4.0;
    else                    ytScore =  2.0;
    if (ytSubs >= 10000) {
      if      (avgViews >= ytSubs * 0.10) ytScore = Math.min(10.0, ytScore + 1);
      else if (avgViews >= ytSubs * 0.05) ytScore = Math.min(10.0, ytScore + 0.5);
    }
    scores.push({ val: Math.min(10.0, ytScore), weight: WEIGHTS.youtube });
    totalWeight += WEIGHTS.youtube;
  }

  const daysSince = getDaysSince(podcast);
  if (daysSince !== null) {
    let f = 1.0;
    if      (daysSince <=  7) f = 10.0;
    else if (daysSince <= 14) f =  9.0;
    else if (daysSince <= 30) f =  7.5;
    else if (daysSince <= 60) f =  5.0;
    else if (daysSince <= 90) f =  3.0;
    else                      f =  1.5;
    scores.push({ val: f, weight: WEIGHTS.freshness });
    totalWeight += WEIGHTS.freshness;
  }

  const totalSocial =
    safeInt(safeGet(podcast, 'instagram_followers')) +
    safeInt(safeGet(podcast, 'twitter_followers'))   +
    safeInt(safeGet(podcast, 'linkedin_followers'));
  if (totalSocial > 0) {
    const s = Math.min(10.0, Math.max(1.0, safeLog(totalSocial) * 1.5));
    scores.push({ val: s, weight: WEIGHTS.social });
    totalWeight += WEIGHTS.social;
  }

  if (scores.length === 0) return 1.0;
  const weighted = scores.reduce((sum, s) => sum + s.val * s.weight, 0);
  return Math.round((weighted / totalWeight) * 10) / 10;
}

function calculateAudienceSize(podcast) {
  const ytSubs      = safeInt(safeGet(podcast, 'yt_subscribers'));
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  const episodes    = safeInt(safeGet(podcast, 'episodeCount'));
  const recentViews = getRecentYouTubeViews(podcast);
  const avgViews    = recentViews.length > 0
    ? recentViews.reduce((a, b) => a + b, 0) / recentViews.length : 0;

  const T = {
    yt   : { vl: 100000, l: 25000, m: 5000  },
    apple: { vl: 500,    l: 100,   m: 25    },
    eps  : { vl: 200,    l: 100,   m: 50    },
    views: { vl: 50000,  l: 10000, m: 2000  },
  };
  let vl = 0, l = 0, m = 0, s = 0;
  const vote = (val, t) => {
    if      (val >= t.vl) vl++;
    else if (val >= t.l)  l++;
    else if (val >= t.m)  m++;
    else if (val > 0)     s++;
  };
  vote(ytSubs,      T.yt);
  vote(appleReviews, T.apple);
  vote(episodes,    T.eps);
  vote(avgViews,    T.views);

  if (vl >= 2) return 'Very Large';
  if (l  >= 2) return 'Large';
  if (m  >= 2) return 'Medium';
  if (s  >= 2) return 'Small';
  if (vl >= 1) return 'Very Large';
  if (l  >= 1) return 'Large';
  if (m  >= 1) return 'Medium';
  return 'Small';
}

function calculateContentQuality(podcast) {
  const rating  = parseFloat(safeGet(podcast, 'apple_rating')) || 0;
  const reviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  if (rating === 0) return 5.0;
  let q = rating * 2;
  if      (reviews >= 100) q += 1.0;
  else if (reviews >= 50)  q += 0.5;
  return Math.min(10.0, Math.round(q * 10) / 10);
}

function calculateMonetizationPotential(podcast, engagementLevel, audienceSize) {
  const sizeMap = { Small: 2.5, Medium: 5.0, Large: 7.5, 'Very Large': 10.0, Unknown: 3.0 };
  return Math.round(((sizeMap[audienceSize] || 3.0) * 0.6 + engagementLevel * 0.4) * 10) / 10;
}

function calculatePowerScore(podcast) {
  const ytSubs      = safeInt(safeGet(podcast, 'yt_subscribers'));
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  const episodes    = safeInt(safeGet(podcast, 'episodeCount'));
  const appleRating  = parseFloat(safeGet(podcast, 'apple_rating')) || 0;
  const base = safeLog(ytSubs) * 10 + safeLog(appleReviews) * 15 + safeLog(episodes) * 5;
  return (appleRating >= 4.5 && appleReviews >= 20) ? base * 1.1 : base;
}

// ============================================================================
// GEMINI CATEGORIZATION
// ============================================================================

/**
 * Call Gemini to categorize a single podcast.
 *
 * @param {object} podcast  Must have: title, description, genres[], episodeCount,
 *                          recentEpisodeTitles[]
 * @param {number} [maxRetries=3]
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function categorizeSinglePodcast(podcast, maxRetries = 3) {
  const prompt = `You are a podcast categorization expert for "Badassery PR", a podcast booking agency.

Analyze this podcast and categorize it into ONE of these 31 niches:
${BADASSERY_NICHES.map((n, i) => `${i + 1}. ${n}`).join('\n')}

Podcast data:
- Title: ${podcast.title || 'N/A'}
- Description: ${(podcast.description || '').substring(0, 500)}
- Genres: ${(podcast.genres || []).join(', ')}
- Episodes: ${podcast.episodeCount || 0}
- Sample episode titles: ${(podcast.recentEpisodeTitles || []).slice(0, 3).join('; ')}

Choose the MOST SPECIFIC niche that fits. Use "General Business & Lifestyle" only if nothing else fits.

Also identify:
- 3-5 topics from this list: ${BADASSERY_TOPICS.slice(0, 20).join(', ')}...
- Target audience (brief description)
- Podcast style (Interview/Solo Commentary/Panel Discussion/Storytelling/Educational/Other)
- Business relevance score (1-10, where 10 = highly relevant to business professionals)
- guest_friendly: true ONLY if the description or episode titles clearly indicate recurring interviews with different external guests. Return false for: solo shows, daily news briefs, monologues, audio dramas, fiction, scripture readings, meditation guides, or any format without named external guests.
- A unique 2-3 sentence summary

Return ONLY valid JSON (no markdown):
{
  "niche": "exact niche name from list above",
  "secondary_categories": ["niche2", "niche3"],
  "topics": ["topic1", "topic2", "topic3"],
  "target_audience": "brief description",
  "podcast_style": "Interview|Solo Commentary|Panel Discussion|Storytelling|Educational|Other",
  "business_relevance": 1-10,
  "guest_friendly": true|false,
  "summary": "2-3 sentence unique summary"
}`;

  let text = '';

  try {
    await retryWithBackoff(
      async () => {
        const model  = await _getKeyPool().acquire();
        const result = await model.generateContent(prompt);
        text         = result.response.text().trim();

        // Clean JSON
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const start = text.indexOf('{');
        if (start > 0) text = text.substring(start);
        const end = text.lastIndexOf('}');
        if (end >= 0) text = text.substring(0, end + 1);

        text = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        text = text.replace(/\\n/g, '__NL__').replace(/\\"/g, '__QT__').replace(/\\\\/g, '__BS__');
        text = text.replace(/[\x00-\x1F\x7F]/g, ' ');
        text = text.replace(/__NL__/g, '\\n').replace(/__QT__/g, '\\"').replace(/__BS__/g, '\\\\');
        text = text.replace(/,\s*([}\]])/g, '$1');
        text = text.replace(/\s+/g, ' ');

        JSON.parse(text); // throws → triggers retry
      },
      {
        maxRetries,
        baseDelayMs: 1000,
        maxDelayMs : 120000,
        onRetry    : (err, attempt, delayMs) => {
          process.stdout.write(
            `\n  ⚠️  Gemini retry ${attempt}/${maxRetries} in ${delayMs}ms: ${err.message.substring(0, 80)}\n`
          );
        },
      }
    );

    return { success: true, data: JSON.parse(text) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PERCENTILE CALCULATION (batch)
// ============================================================================

/**
 * Given an array of scored podcast objects (each must have itunesId,
 * ai_primary_category, and a _original field for power score calculation),
 * assigns category + global percentile fields in-place and returns the array.
 *
 * @param {object[]} scoredPodcasts
 * @returns {object[]}  same array, mutated
 */
function calculatePercentiles(scoredPodcasts) {
  // Global ranking
  const withScore = scoredPodcasts.map(p => ({
    p,
    score: calculatePowerScore(p._original || p),
  }));
  withScore.sort((a, b) => b.score - a.score);

  const globalMap = {};
  withScore.forEach(({ p }, idx) => {
    const rank = idx + 1;
    const pct  = (rank / withScore.length) * 100;
    globalMap[p.itunesId] = {
      global_percentile: _pctLabel(pct),
      global_rank : rank,
      global_total: withScore.length,
    };
  });

  // Category ranking
  const byCategory = {};
  scoredPodcasts.forEach(p => {
    const cat = p.ai_primary_category || 'Unknown';
    (byCategory[cat] = byCategory[cat] || []).push(p);
  });

  const catMap = {};
  Object.entries(byCategory).forEach(([, members]) => {
    if (members.length < 10) {
      members.forEach(p => {
        catMap[p.itunesId] = {
          category_percentile: globalMap[p.itunesId].global_percentile,
          category_rank : null,
          category_total: members.length,
          used_global   : true,
        };
      });
      return;
    }
    const ranked = members
      .map(p => ({ p, score: calculatePowerScore(p._original || p) }))
      .sort((a, b) => b.score - a.score);

    ranked.forEach(({ p }, idx) => {
      const rank = idx + 1;
      catMap[p.itunesId] = {
        category_percentile: _pctLabel((rank / ranked.length) * 100),
        category_rank : rank,
        category_total: ranked.length,
        used_global   : false,
      };
    });
  });

  // Mutate in-place
  scoredPodcasts.forEach(p => {
    const g = globalMap[p.itunesId];
    const c = catMap[p.itunesId];
    Object.assign(p, {
      ai_global_percentile    : g.global_percentile,
      ai_global_rank          : g.global_rank,
      ai_global_total         : g.global_total,
      ai_category_percentile  : c.category_percentile,
      ai_category_rank        : c.category_rank,
      ai_category_total       : c.category_total,
      ai_percentile_used_global: c.used_global,
    });
  });

  return scoredPodcasts;
}

function _pctLabel(pct) {
  if (pct <= 1)  return 'Top 1%';
  if (pct <= 5)  return 'Top 5%';
  if (pct <= 10) return 'Top 10%';
  if (pct <= 25) return 'Top 25%';
  if (pct <= 50) return 'Top 50%';
  return 'Standard';
}

// ============================================================================
// BADASSERY SCORE (40/30/30 formula)
// ============================================================================

/**
 * Applies the Badassery Score formula to each podcast in-place.
 * Requires calculatePercentiles() to have been called first.
 *
 * @param {object[]} scoredPodcasts
 * @returns {object[]}
 */
function applyBadasseryScores(scoredPodcasts) {
  const sizeMap = { Small: 25, Medium: 50, Large: 75, 'Very Large': 100, Unknown: 30 };
  const pctMap  = {
    'Top 1%': 100, 'Top 5%': 90, 'Top 10%': 80,
    'Top 25%': 65, 'Top 50%': 50, Standard: 35, Unknown: 40,
  };

  scoredPodcasts.forEach(p => {
    const engagement  = p.ai_engagement_level || 1;
    const sizeScore   = sizeMap[p.ai_audience_size] ?? 30;
    const pctScore    = pctMap[p.ai_category_percentile] ?? 40;

    p.ai_badassery_score = Math.round(
      ((engagement / 10) * 40 + (sizeScore / 100) * 30 + (pctScore / 100) * 30) * 10
    ) / 10;
  });

  return scoredPodcasts;
}

// ============================================================================
// PHASE 5 — FULL SCORING (rebuild_database.js pipeline)
// ============================================================================

const PHASE5_CATEGORIES = [
  'Business', 'Technology', 'Marketing & Sales', 'Entrepreneurship', 'Leadership',
  'Health & Wellness', 'Finance & Investing', 'Science', 'Education', 'Arts & Culture',
  'Society & Politics', 'Sports & Fitness', 'True Crime', 'Comedy', 'News & Media',
  'Religion & Spirituality', 'Personal Development', 'Parenting & Family',
  'Food & Lifestyle', 'Travel & Adventure', 'Music', 'Film & TV', 'Gaming',
  'Career & Work', 'Relationships', 'Environment', 'History', 'Psychology',
  'Design & Creativity', 'Real Estate', 'Other',
];

function _buildScoringPrompt(feed) {
  const N = (feed.episodes || []).length;

  const episodeContext = (feed.episodes || []).map((ep, i) => {
    let s = `Episode ${i + 1}: "${ep.title}"`;
    if (ep.description) s += `\nAbout: ${ep.description}`;
    return s;
  }).join('\n\n');

  const audienceLines = [
    feed.apple_rating        ? `Apple rating: ${feed.apple_rating}/5 (${feed.apple_rating_count} reviews)` : null,
    feed.spotify_rating      ? `Spotify rating: ${feed.spotify_rating}/5 (${feed.spotify_review_count} reviews)` : null,
    feed.yt_subscribers      ? `YouTube subscribers: ${feed.yt_subscribers.toLocaleString()}` : null,
    feed.yt_avg_views_per_video ? `YouTube avg views/video: ${feed.yt_avg_views_per_video.toLocaleString()}` : null,
    feed.instagram_followers ? `Instagram followers: ${feed.instagram_followers.toLocaleString()}` : null,
    feed.apple_chart_rank    ? `Apple Podcasts chart rank: #${feed.apple_chart_rank} in ${feed.apple_chart_genre}` : null,
    feed.spotify_chart_rank  ? `Spotify chart rank: #${feed.spotify_chart_rank} in ${feed.spotify_chart_genre}` : null,
  ].filter(Boolean);
  const audienceContext = audienceLines.length > 0
    ? audienceLines.join('\n')
    : 'No audience data available';

  const cats = [feed.category1, feed.category2, feed.category3].filter(Boolean).join(', ');

  return `You are analyzing a podcast for a talent booking agency.
Evaluate this podcast across multiple dimensions.

PODCAST:
Title: ${feed.title}
Description: ${feed.description || ''}
Episode count: ${feed.episodeCount}
Average episode length: ${feed.avg_episode_length_min ?? 'unknown'} minutes
Host/Author: ${feed.author || ''}
Categories: ${cats || 'none'}

AUDIENCE DATA:
${audienceContext}

GUEST INTELLIGENCE (from Phase 3b):
Guest-friendly: ${feed.gemini_guest_friendly}
Guest ratio (last 10 episodes): ${feed.gemini_guest_ratio ?? 'unknown'}
Guest types seen: ${(feed.gemini_guest_types || []).join(', ') || 'none'}
Guest industries: ${(feed.gemini_guest_industries || []).join(', ') || 'none'}
Typical guest profile: ${feed.gemini_typical_guest_profile || 'unknown'}
Recent guests:
${(feed.gemini_recent_guests || []).length > 0
  ? (feed.gemini_recent_guests).map(g =>
      `  Ep${g.episode_index}: ${g.guest_name || 'unnamed'} — ${g.guest_role} (${g.guest_industry})`
    ).join('\n')
  : '  (none identified)'}

LAST ${N} EPISODES:
${episodeContext}

Return ONLY valid JSON, no explanation, no markdown backticks:
{
  "primary_category": "one value from the category list below",
  "secondary_categories": ["category2", "category3"],
  "topics": ["topic1", "topic2", "topic3"],
  "target_audience": "brief description of who listens",
  "podcast_style": "Interview" or "Solo Commentary" or "Panel Discussion" or "Storytelling" or "Educational" or "Other",
  "business_relevance": integer 1-10,
  "content_quality": integer 1-10,
  "audience_size_estimate": "Micro" or "Small" or "Medium" or "Large" or "Mega",
  "engagement_level": "Low" or "Medium" or "High" or "Very High",
  "monetization_potential": integer 1-10,
  "summary": "2-3 sentence description of the podcast and its value for guest appearances"
}

CATEGORY LIST (pick the single best match for primary_category):
${PHASE5_CATEGORIES.join(', ')}

SCORING GUIDELINES:
business_relevance (1-10): How relevant is this podcast for B2B guest appearances?
  10 = C-suite audience, business leaders, investors
  5  = mixed professional/general audience
  1  = purely entertainment, no business angle

content_quality (1-10): Overall production and content quality signal.
  Use: ratings, review count, episode consistency, description quality, chapter/transcript availability
  10 = highly produced, strong reviews, consistent schedule
  1  = low effort, few reviews, irregular

audience_size_estimate:
  Mega   = 500K+ subscribers/followers or Top 50 chart
  Large  = 100K-500K
  Medium = 10K-100K
  Small  = 1K-10K
  Micro  = <1K or no data

engagement_level:
  Very High = rating >= 4.5 AND review count >= 500
  High      = rating >= 4.0 AND review count >= 100
  Medium    = rating >= 3.5 OR review count >= 20
  Low       = below the above thresholds or no data`;
}

/**
 * Run a full Gemini scoring pass on a single enriched feed.
 * Mutates `feed` in place. Never throws.
 *
 * @param {object} feed  Enriched feed from Phase 4
 * @returns {Promise<void>}
 */
async function scorePodcastFull(feed) {
  const _t0    = Date.now();
  const prompt = _buildScoringPrompt(feed);
  feed._p5_prompt = prompt;
  let text = '';

  try {
    await retryWithBackoff(
      async () => {
        const model  = await _getKeyPool().acquire();
        const result = await model.generateContent(prompt);
        text         = (result.response.text() || '').trim();

        // Clean JSON — same pipeline as categorizeSinglePodcast
        text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
        const start = text.indexOf('{');
        if (start > 0) text = text.substring(start);
        const end = text.lastIndexOf('}');
        if (end >= 0) text = text.substring(0, end + 1);
        text = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        text = text.replace(/\\n/g, '__NL__').replace(/\\"/g, '__QT__').replace(/\\\\/g, '__BS__');
        text = text.replace(/[\x00-\x1F\x7F]/g, ' ');
        text = text.replace(/__NL__/g, '\\n').replace(/__QT__/g, '\\"').replace(/__BS__/g, '\\\\');
        text = text.replace(/,\s*([}\]])/g, '$1');
        text = text.replace(/\s+/g, ' ');

        JSON.parse(text); // throws → triggers retry
      },
      {
        maxRetries : 1,   // 1 retry = 2 total attempts
        baseDelayMs: 2000,
        maxDelayMs : 30000,
        onRetry    : (err, attempt) => {
          process.stdout.write(
            `\n  [P5] retry for "${(feed.title || '').slice(0, 30)}": ${err.message.slice(0, 60)}\n`
          );
        },
      }
    );

    const r = JSON.parse(text);

    feed.ai_primary_category       = r.primary_category          ?? null;
    feed.ai_secondary_categories   = Array.isArray(r.secondary_categories) ? r.secondary_categories : [];
    feed.ai_topics                 = Array.isArray(r.topics)      ? r.topics : [];
    feed.ai_target_audience        = r.target_audience            ?? null;
    feed.ai_podcast_style          = r.podcast_style              ?? null;
    feed.ai_business_relevance     = Number.isInteger(r.business_relevance)     ? r.business_relevance     : null;
    feed.ai_content_quality        = Number.isInteger(r.content_quality)        ? r.content_quality        : null;
    feed.ai_audience_size          = r.audience_size_estimate     ?? null;
    feed.ai_engagement_level       = r.engagement_level           ?? null;
    feed.ai_monetization_potential = Number.isInteger(r.monetization_potential) ? r.monetization_potential : null;
    feed.ai_summary                = r.summary                    ?? null;
    feed.aiCategorizationStatus    = 'completed';
    feed.aiCategorizedAt           = Date.now();
    feed._p5_raw_response          = text;
    feed._p5_latency_ms            = Date.now() - _t0;

  } catch (err) {
    feed.ai_primary_category       = null;
    feed.ai_secondary_categories   = [];
    feed.ai_topics                 = [];
    feed.ai_target_audience        = null;
    feed.ai_podcast_style          = null;
    feed.ai_business_relevance     = null;
    feed.ai_content_quality        = null;
    feed.ai_audience_size          = null;
    feed.ai_engagement_level       = null;
    feed.ai_monetization_potential = null;
    feed.ai_summary                = null;
    feed.aiCategorizationStatus    = 'failed';
    feed.aiCategorizationError     = err.message;
    feed._p5_raw_response          = text || '';
    feed._p5_latency_ms            = Date.now() - _t0;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  BADASSERY_NICHES,
  BADASSERY_TOPICS,
  initKeyPool,
  categorizeSinglePodcast,
  scorePodcastFull,
  calculateEngagementLevel,
  calculateAudienceSize,
  calculateContentQuality,
  calculateMonetizationPotential,
  calculatePowerScore,
  calculatePercentiles,
  applyBadasseryScores,
};
