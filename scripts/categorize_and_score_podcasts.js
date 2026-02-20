const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

// Configuration
const BATCH_SIZE = 10; // Process 10 podcasts at a time for Gemini
const PAUSE_BETWEEN_BATCHES = 2000; // 2 seconds between batches
const MAX_PODCASTS_TO_PROCESS = 100; // Limit for testing
const DRY_RUN = process.argv.includes('--dry-run'); // Dry-run mode (no Firestore writes)

// ============================================================================
// BADASSERY NICHES (31 niches autorisées)
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
  'General Business & Lifestyle'
];

// ============================================================================
// TOPICS AUTORISÉS
// ============================================================================
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
  'Industry Insights'
];

function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// SCORING CALCULATIONS (Based on your Python algorithm)
// ============================================================================

/**
 * Safe get with fallback
 */
function safeGet(obj, key, defaultVal = null) {
  const val = obj[key];
  if (val === null || val === undefined || val === '' || val === 'None' || val === 'nan') {
    return defaultVal;
  }
  return val;
}

/**
 * Safe float conversion
 */
function safeFloat(val, defaultVal = 0.0) {
  if (val === null || val === undefined || val === '' || val === 'None') {
    return defaultVal;
  }
  const num = parseFloat(val);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Safe int conversion
 */
function safeInt(val, defaultVal = 0) {
  if (val === null || val === undefined || val === '' || val === 'None') {
    return defaultVal;
  }
  const num = parseInt(val);
  return isNaN(num) ? defaultVal : num;
}

/**
 * Safe log10
 */
function safeLog(value) {
  if (!value || value <= 0) return 0.0;
  return Math.log10(value + 1);
}

/**
 * Get days since date
 * AMÉLIORATION: Try multiple date field names as fallback
 */
function getDaysSince(podcast) {
  // Try multiple possible field names for the last episode date
  const possibleFields = [
    'lastUpdate',
    'latest_episode_date',
    'newestItemPubdate',
    'lastBuildDate',
    'rss_last_update'
  ];

  for (const field of possibleFields) {
    const dateString = safeGet(podcast, field);
    if (dateString) {
      try {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
          const now = new Date();
          return Math.floor((now - date) / (1000 * 60 * 60 * 24));
        }
      } catch (e) {
        // Try next field
      }
    }
  }

  return null;
}

/**
 * Get recent YouTube views
 */
function getRecentYouTubeViews(podcast) {
  const views = [];
  for (let i = 1; i <= 10; i++) {
    const key = `yt_video_${i}_views`;
    const viewCount = safeInt(safeGet(podcast, key));
    if (viewCount > 0) {
      views.push(viewCount);
    }
  }
  return views;
}

/**
 * Calculate engagement level (1-10)
 * Based on: Apple reviews, YouTube engagement, freshness, social presence
 */
function calculateEngagementLevel(podcast) {
  const scores = [];
  let totalWeight = 0.0;

  const WEIGHTS = {
    apple_reviews: 3.0,
    youtube: 3.0,
    freshness: 2.0,
    social_presence: 1.0
  };

  // Signal 1: Apple Reviews
  const appleCount = safeInt(safeGet(podcast, 'apple_rating_count'));
  const appleRating = safeFloat(safeGet(podcast, 'apple_rating'));

  if (appleCount > 0) {
    let baseScore = Math.min(10.0, safeLog(appleCount) * 2.5);

    if (appleRating >= 4.5 && appleCount >= 20) {
      baseScore = Math.min(10.0, baseScore * 1.2);
    } else if (appleRating >= 4.0 && appleCount >= 50) {
      baseScore = Math.min(10.0, baseScore * 1.1);
    }

    scores.push({ val: baseScore, weight: WEIGHTS.apple_reviews });
    totalWeight += WEIGHTS.apple_reviews;
  }

  // Signal 2: YouTube Engagement
  const ytSubs = safeInt(safeGet(podcast, 'yt_subscribers'));
  const epCount = safeInt(safeGet(podcast, 'episodeCount'));

  if (ytSubs > 0) {
    let ytScore = 0.0;

    if (epCount > 0) {
      const ratio = ytSubs / epCount;
      ytScore = Math.min(10.0, safeLog(ratio) * 2.5);
    } else {
      ytScore = Math.min(10.0, safeLog(ytSubs) * 1.5);
    }

    const recentViews = getRecentYouTubeViews(podcast);
    if (recentViews.length >= 2) {
      const avgViews = recentViews.reduce((a, b) => a + b, 0) / recentViews.length;
      const viewRatio = avgViews / ytSubs;

      if (viewRatio > 0.10) {
        ytScore = Math.min(10.0, ytScore * 1.3);
      } else if (viewRatio > 0.05) {
        ytScore = Math.min(10.0, ytScore * 1.1);
      } else if (viewRatio < 0.01) {
        ytScore = ytScore * 0.8;
      }
    }

    scores.push({ val: Math.min(10.0, ytScore), weight: WEIGHTS.youtube });
    totalWeight += WEIGHTS.youtube;
  }

  // Signal 3: Freshness
  // AMÉLIORATION: getDaysSince now tries multiple date fields internally
  const daysSince = getDaysSince(podcast);

  if (daysSince !== null) {
    let freshScore = 1.0;

    if (daysSince <= 7) freshScore = 10.0;
    else if (daysSince <= 14) freshScore = 9.0;
    else if (daysSince <= 30) freshScore = 7.5;
    else if (daysSince <= 60) freshScore = 5.0;
    else if (daysSince <= 90) freshScore = 3.0;
    else if (daysSince <= 180) freshScore = 2.0;

    scores.push({ val: freshScore, weight: WEIGHTS.freshness });
    totalWeight += WEIGHTS.freshness;
  }

  // Signal 4: Social Media Presence
  const socialFields = [
    'website_facebook', 'website_instagram', 'website_twitter',
    'website_linkedin', 'website_tiktok', 'website_spotify'
  ];

  const socialCount = socialFields.filter(f => safeGet(podcast, f)).length;

  if (socialCount > 0) {
    const socialScore = Math.min(10.0, 2.0 + socialCount * 1.6);
    scores.push({ val: socialScore, weight: WEIGHTS.social_presence });
    totalWeight += WEIGHTS.social_presence;
  }

  // Calculate final score
  if (totalWeight === 0) return 1.0;

  let finalScore = scores.reduce((sum, s) => sum + (s.val * s.weight), 0) / totalWeight;

  // Penalty for insufficient data
  if (scores.length < 2) {
    finalScore *= 0.85;
  }

  return Math.round(Math.max(1.0, Math.min(10.0, finalScore)) * 10) / 10;
}

/**
 * Calculate audience size (Small/Medium/Large/Very Large)
 */
function calculateAudienceSize(podcast) {
  const THRESHOLDS = {
    yt_subscribers: { very_large: 100000, large: 25000, medium: 5000 },
    apple_reviews: { very_large: 500, large: 100, medium: 25 },
    episodes: { very_large: 500, large: 200, medium: 50 },
    yt_views: { very_large: 50000, large: 10000, medium: 2000 }
  };

  let points = 0.0;
  let signalsWeight = 0.0;

  // YouTube Subscribers (weight 1.5)
  const ytSubs = safeInt(safeGet(podcast, 'yt_subscribers'));
  if (ytSubs > 0) {
    const weight = 1.5;
    signalsWeight += weight;

    if (ytSubs >= THRESHOLDS.yt_subscribers.very_large) points += 4 * weight;
    else if (ytSubs >= THRESHOLDS.yt_subscribers.large) points += 3 * weight;
    else if (ytSubs >= THRESHOLDS.yt_subscribers.medium) points += 2 * weight;
    else points += 1 * weight;
  }

  // Apple Reviews (weight 1.0)
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  if (appleReviews > 0) {
    const weight = 1.0;
    signalsWeight += weight;

    if (appleReviews >= THRESHOLDS.apple_reviews.very_large) points += 4 * weight;
    else if (appleReviews >= THRESHOLDS.apple_reviews.large) points += 3 * weight;
    else if (appleReviews >= THRESHOLDS.apple_reviews.medium) points += 2 * weight;
    else points += 1 * weight;
  }

  // Episodes (weight 0.5)
  const episodes = safeInt(safeGet(podcast, 'episodeCount'));
  if (episodes > 0) {
    const weight = 0.5;
    signalsWeight += weight;

    if (episodes >= THRESHOLDS.episodes.very_large) points += 4 * weight;
    else if (episodes >= THRESHOLDS.episodes.large) points += 3 * weight;
    else if (episodes >= THRESHOLDS.episodes.medium) points += 2 * weight;
    else points += 1 * weight;
  }

  // YouTube Views (weight 1.0)
  const recentViews = getRecentYouTubeViews(podcast);
  if (recentViews.length > 0) {
    const avgViews = recentViews.reduce((a, b) => a + b, 0) / recentViews.length;
    const weight = 1.0;
    signalsWeight += weight;

    if (avgViews >= THRESHOLDS.yt_views.very_large) points += 4 * weight;
    else if (avgViews >= THRESHOLDS.yt_views.large) points += 3 * weight;
    else if (avgViews >= THRESHOLDS.yt_views.medium) points += 2 * weight;
    else points += 1 * weight;
  }

  if (signalsWeight === 0) return 'Unknown';

  const avgScore = points / signalsWeight;

  if (avgScore >= 3.5) return 'Very Large';
  if (avgScore >= 2.5) return 'Large';
  if (avgScore >= 1.5) return 'Medium';
  return 'Small';
}

/**
 * Calculate content quality (1-10)
 * Based on Apple rating and review count
 */
function calculateContentQuality(podcast) {
  const rating = safeFloat(safeGet(podcast, 'apple_rating'));
  const reviewCount = safeInt(safeGet(podcast, 'apple_rating_count'));

  if (rating === 0 && reviewCount === 0) return 5.0; // Default if no data

  let qualityScore = 5.0;

  // Base score from rating
  if (rating > 0) {
    qualityScore = rating * 2; // Scale 0-5 to 0-10
  }

  // Adjust based on review volume (more reviews = more confidence)
  if (reviewCount >= 100) {
    qualityScore = Math.min(10.0, qualityScore * 1.1);
  } else if (reviewCount >= 50) {
    qualityScore = Math.min(10.0, qualityScore * 1.05);
  } else if (reviewCount < 10 && reviewCount > 0) {
    qualityScore = qualityScore * 0.9; // Less confidence
  }

  return Math.round(Math.max(1.0, Math.min(10.0, qualityScore)) * 10) / 10;
}

/**
 * Calculate monetization potential (1-10)
 * Based on audience size and engagement
 */
function calculateMonetizationPotential(podcast, engagementLevel, audienceSize) {
  const sizeMap = { 'Small': 3, 'Medium': 5, 'Large': 8, 'Very Large': 10, 'Unknown': 4 };
  const sizeScore = sizeMap[audienceSize] || 4;

  // Weighted combination: 60% audience size, 40% engagement
  const monetScore = (sizeScore * 0.6) + (engagementLevel * 0.4);

  return Math.round(Math.max(1.0, Math.min(10.0, monetScore)) * 10) / 10;
}

// ============================================================================
// GEMINI AI CATEGORIZATION (Batch processing)
// ============================================================================

async function categorizeBatch(podcastsBatch) {
  const podcastsText = podcastsBatch.map((p, i) => `
---PODCAST ${i + 1}---
Show Name: ${p.title || 'N/A'}
Description: ${(p.description || '').substring(0, 500)}
Apple Genres: ${(p.apple_api_genres || []).join(', ') || 'N/A'}
Episode Titles: ${p.rss_ep1_title || ''}, ${p.rss_ep2_title || ''}, ${p.rss_ep3_title || ''}
`).join('\n');

  const prompt = `Tu es un expert en catégorisation de podcasts pour Badassery PR.

NICHES AUTORISÉES (choisis-en 1 seule):
${BADASSERY_NICHES.map((n, i) => `${i + 1}. ${n}`).join('\n')}

TOPICS AUTORISÉS (choisis-en 3 à 5):
${BADASSERY_TOPICS.join(', ')}

RÈGLES:
- Choisis UNIQUEMENT parmi les niches/topics listés ci-dessus
- Pour business_relevance: 1-10 (10 = très pertinent B2B, 1 = peu pertinent)
- Pour guest_friendly: true si le podcast invite régulièrement des invités
- Retourne UNIQUEMENT du JSON valide

Analyse ces ${podcastsBatch.length} podcasts:

${podcastsText}

Réponds avec un JSON array (exactement ${podcastsBatch.length} objets):
[
  {
    "show_name": "...",
    "niche": "...",
    "secondary_categories": ["...", "..."],
    "topics": ["...", "...", "..."],
    "target_audience": "brief description",
    "podcast_style": "Interview|Solo Commentary|Panel Discussion|Storytelling|Educational|Other",
    "business_relevance": 1-10,
    "guest_friendly": true|false,
    "summary": "2-3 sentence unique summary"
  }
]`;

  const MAX_RETRIES = 2;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      // AMÉLIORATION: Aggressive JSON cleaning with more edge cases
      // Remove markdown code blocks
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      // Remove any text before first [ or {
      const jsonStart = Math.min(
        text.indexOf('[') >= 0 ? text.indexOf('[') : Infinity,
        text.indexOf('{') >= 0 ? text.indexOf('{') : Infinity
      );
      if (jsonStart !== Infinity && jsonStart > 0) {
        text = text.substring(jsonStart);
      }

      // Remove any text after last ] or }
      const jsonEnd = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
      if (jsonEnd >= 0) {
        text = text.substring(0, jsonEnd + 1);
      }

      // Remove comments (// and /* */)
      text = text.replace(/\/\/.*$/gm, '');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');

      // Remove control characters (but keep newlines in strings)
      text = text.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, ' ');

      // Fix common JSON errors
      text = text.replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
      text = text.replace(/'\s*:/g, '":'); // Replace single quotes before colon
      text = text.replace(/:\s*'/g, ':"'); // Replace single quotes after colon
      text = text.replace(/'([^']*)'(?=\s*[,}\]])/g, '"$1"'); // Replace remaining single quotes

      // Handle newlines in string values (replace with space)
      text = text.replace(/"\s*\n\s*"/g, '" "');

      const results = JSON.parse(text);

      // Validate array length
      if (!Array.isArray(results) || results.length !== podcastsBatch.length) {
        throw new Error(`Expected ${podcastsBatch.length} results, got ${Array.isArray(results) ? results.length : 'non-array'}`);
      }

      return results;

    } catch (error) {
      if (attempt < MAX_RETRIES) {
        log(`   ⚠️  Gemini attempt ${attempt} failed: ${error.message}`);
        log(`   🔄 Retrying (${attempt + 1}/${MAX_RETRIES})...`);
        await sleep(1000); // Wait 1 second before retry
      } else {
        log(`   ❌ Gemini error after ${MAX_RETRIES} attempts: ${error.message}`);
        return null;
      }
    }
  }

  return null;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

async function processAndScorePodcast(podcast, aiCategorization) {
  try {
    // Skip if no valid itunesId
    if (!podcast.itunesId || podcast.itunesId === '' || podcast.itunesId === 'undefined') {
      log(`   ⏭️  Skipped: No valid itunesId`);
      return { success: false, error: 'No valid itunesId', skipped: true };
    }

    // Calculate all scores
    const engagementLevel = calculateEngagementLevel(podcast);
    const audienceSize = calculateAudienceSize(podcast);
    const contentQuality = calculateContentQuality(podcast);
    const monetizationPotential = calculateMonetizationPotential(
      podcast,
      engagementLevel,
      audienceSize
    );

    // Return scores (don't update Firestore yet - we'll do it after percentile calculation)
    return {
      success: true,
      data: {
        itunesId: podcast.itunesId,
        title: podcast.title,
        // AI Categorization (from Gemini)
        ai_primary_category: aiCategorization.niche || '',
        ai_secondary_categories: aiCategorization.secondary_categories || [],
        ai_topics: aiCategorization.topics || [],
        ai_target_audience: aiCategorization.target_audience || '',
        ai_podcast_style: aiCategorization.podcast_style || '',
        ai_business_relevance: aiCategorization.business_relevance || 5,
        ai_guest_friendly: aiCategorization.guest_friendly || false,
        ai_summary: aiCategorization.summary || '',
        // Calculated Scores
        ai_engagement_level: engagementLevel,
        ai_audience_size: audienceSize,
        ai_content_quality: contentQuality,
        ai_monetization_potential: monetizationPotential,
        // Keep original podcast data for percentile calculation
        _original: podcast
      }
    };
  } catch (error) {
    log(`   ❌ Error processing ${podcast.title}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PERCENTILE & BADASSERY SCORE CALCULATION
// ============================================================================

function calculatePowerScore(podcast) {
  /**
   * Calculate a "power score" for ranking podcasts
   * Uses logarithmic scaling to normalize huge differences
   */
  const ytSubs = safeInt(safeGet(podcast, 'yt_subscribers'));
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  const episodes = safeInt(safeGet(podcast, 'episodeCount'));
  const appleRating = parseFloat(safeGet(podcast, 'apple_rating')) || 0;

  const score = (
    safeLog(ytSubs) * 10 +
    safeLog(appleReviews) * 15 +
    safeLog(episodes) * 5
  );

  // Bonus for high quality
  if (appleRating >= 4.5 && appleReviews >= 20) {
    return score * 1.1;
  }

  return score;
}

// ============================================================================
// AMÉLIORATION: Calculate GLOBAL percentiles (all podcasts)
// ============================================================================

function calculateGlobalPercentiles(processedPodcasts) {
  /**
   * Calculate global percentiles across ALL podcasts
   * Returns map of itunesId -> { global_percentile, global_rank, global_total }
   */
  log('\n🌐 Calculating GLOBAL percentiles...');

  const globalMap = {};

  // Calculate power scores for all podcasts
  const scored = processedPodcasts.map(p => ({
    podcast: p,
    score: calculatePowerScore(p._original)
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Assign global percentiles
  scored.forEach((item, index) => {
    const rank = index + 1;
    const percentile = (rank / scored.length) * 100;

    let label;
    if (percentile <= 1) label = 'Top 1%';
    else if (percentile <= 5) label = 'Top 5%';
    else if (percentile <= 10) label = 'Top 10%';
    else if (percentile <= 25) label = 'Top 25%';
    else if (percentile <= 50) label = 'Top 50%';
    else label = 'Standard';

    globalMap[item.podcast.itunesId] = {
      global_percentile: label,
      global_rank: rank,
      global_total: scored.length
    };
  });

  log(`   ✅ Ranked ${scored.length} podcasts globally`);

  return globalMap;
}

// ============================================================================
// AMÉLIORATION: Calculate percentiles by category with global fallback
// ============================================================================

function calculatePercentiles(processedPodcasts, globalPercentileMap) {
  /**
   * Calculate percentiles by category
   * AMÉLIORATION: Use global percentile as fallback for small categories
   * Returns map of itunesId -> percentile data
   */
  log('\n📊 Calculating percentiles by category...');

  const percentileMap = {};

  // Group by category
  const byCategory = {};
  processedPodcasts.forEach(p => {
    const category = p.ai_primary_category || 'Unknown';
    if (!byCategory[category]) {
      byCategory[category] = [];
    }
    byCategory[category].push(p);
  });

  // Calculate percentile for each category
  Object.keys(byCategory).forEach(category => {
    const categoryPodcasts = byCategory[category];

    // AMÉLIORATION: Use global percentile as fallback for small categories (< 10 podcasts)
    if (categoryPodcasts.length < 10) {
      log(`   ⚠️  Category "${category}" has only ${categoryPodcasts.length} podcasts - using GLOBAL percentile as fallback`);

      categoryPodcasts.forEach(p => {
        const globalData = globalPercentileMap[p.itunesId] || {
          global_percentile: 'Unknown',
          global_rank: null,
          global_total: processedPodcasts.length
        };

        percentileMap[p.itunesId] = {
          category_percentile: globalData.global_percentile, // Use global as fallback
          category_rank: null,
          category_total: categoryPodcasts.length,
          used_global: true // Flag to indicate we used global percentile
        };
      });
      return;
    }

    // Calculate power scores and sort
    const scored = categoryPodcasts.map(p => ({
      podcast: p,
      score: calculatePowerScore(p._original)
    }));

    scored.sort((a, b) => b.score - a.score);

    // Assign percentiles
    scored.forEach((item, index) => {
      const rank = index + 1;
      const percentile = (rank / scored.length) * 100;

      let label;
      if (percentile <= 1) label = 'Top 1%';
      else if (percentile <= 5) label = 'Top 5%';
      else if (percentile <= 10) label = 'Top 10%';
      else if (percentile <= 25) label = 'Top 25%';
      else if (percentile <= 50) label = 'Top 50%';
      else label = 'Standard';

      percentileMap[item.podcast.itunesId] = {
        category_percentile: label,
        category_rank: rank,
        category_total: scored.length,
        used_global: false
      };
    });

    log(`   ✅ Category "${category}": ${categoryPodcasts.length} podcasts ranked`);
  });

  return percentileMap;
}

function calculateBadasseryScore(podcast, percentileData) {
  /**
   * Calculate the composite Badassery Score (0-100)
   * Formula: 40% Engagement + 30% Audience Size + 30% Percentile
   */

  // Component 1: Engagement (40%)
  const engagement = podcast.ai_engagement_level || 1;
  const engagementComponent = (engagement / 10) * 40;

  // Component 2: Audience Size (30%)
  const sizeMap = {
    'Small': 25,
    'Medium': 50,
    'Large': 75,
    'Very Large': 100,
    'Unknown': 30
  };
  const audienceSize = podcast.ai_audience_size || 'Unknown';
  const sizeComponent = (sizeMap[audienceSize] / 100) * 30;

  // Component 3: Percentile (30%)
  const percentileMap = {
    'Top 1%': 100,
    'Top 5%': 90,
    'Top 10%': 80,
    'Top 25%': 65,
    'Top 50%': 50,
    'Standard': 35,
    'Unknown': 40
  };
  const percentileLabel = percentileData?.category_percentile || 'Unknown';
  const percentileComponent = (percentileMap[percentileLabel] / 100) * 30;

  // Final score
  const finalScore = engagementComponent + sizeComponent + percentileComponent;

  return Math.round(finalScore * 10) / 10;
}

// ============================================================================
// AMÉLIORATION: Detailed Final Statistics
// ============================================================================

function printFinalStats(processedPodcasts) {
  /**
   * Print detailed distribution and top performers
   */

  if (processedPodcasts.length === 0) {
    log('\n⚠️  No podcasts to analyze');
    return;
  }

  // -------------------------------------------------------------------------
  // 1. Badassery Score Distribution
  // -------------------------------------------------------------------------
  console.log('\n📈 BADASSERY SCORE DISTRIBUTION:');
  console.log('   (Shows how podcasts are distributed across score ranges)\n');

  const scoreBuckets = {
    '0-20': 0,
    '20-40': 0,
    '40-60': 0,
    '60-80': 0,
    '80-100': 0
  };

  processedPodcasts.forEach(p => {
    const score = p.ai_badassery_score || 0;
    if (score < 20) scoreBuckets['0-20']++;
    else if (score < 40) scoreBuckets['20-40']++;
    else if (score < 60) scoreBuckets['40-60']++;
    else if (score < 80) scoreBuckets['60-80']++;
    else scoreBuckets['80-100']++;
  });

  Object.entries(scoreBuckets).forEach(([range, count]) => {
    const percentage = ((count / processedPodcasts.length) * 100).toFixed(1);
    const barLength = Math.round((count / processedPodcasts.length) * 50);
    const bar = '█'.repeat(barLength);
    console.log(`   ${range.padEnd(8)} ${bar.padEnd(52)} ${count.toString().padStart(4)} (${percentage}%)`);
  });

  // -------------------------------------------------------------------------
  // 2. Audience Size Distribution
  // -------------------------------------------------------------------------
  console.log('\n👥 AUDIENCE SIZE DISTRIBUTION:\n');

  const audienceBuckets = {
    'Very Large': 0,
    'Large': 0,
    'Medium': 0,
    'Small': 0,
    'Unknown': 0
  };

  processedPodcasts.forEach(p => {
    const size = p.ai_audience_size || 'Unknown';
    if (audienceBuckets.hasOwnProperty(size)) {
      audienceBuckets[size]++;
    } else {
      audienceBuckets['Unknown']++;
    }
  });

  Object.entries(audienceBuckets).forEach(([size, count]) => {
    if (count > 0) {
      const percentage = ((count / processedPodcasts.length) * 100).toFixed(1);
      const barLength = Math.round((count / processedPodcasts.length) * 50);
      const bar = '█'.repeat(barLength);
      console.log(`   ${size.padEnd(12)} ${bar.padEnd(52)} ${count.toString().padStart(4)} (${percentage}%)`);
    }
  });

  // -------------------------------------------------------------------------
  // 3. Top 10 Podcasts by Badassery Score
  // -------------------------------------------------------------------------
  console.log('\n🏆 TOP 10 PODCASTS (by Badassery Score):\n');

  const sorted = [...processedPodcasts].sort((a, b) =>
    (b.ai_badassery_score || 0) - (a.ai_badassery_score || 0)
  );

  sorted.slice(0, 10).forEach((p, i) => {
    const rank = i + 1;
    const title = p.title.substring(0, 50);
    const score = (p.ai_badassery_score || 0).toFixed(1);
    const globalPercentile = p.ai_global_percentile || 'Unknown';
    const audienceSize = p.ai_audience_size || 'Unknown';

    console.log(`   ${rank.toString().padStart(2)}. ${title.padEnd(52)} ${score.padStart(5)}/100`);
    console.log(`       Category: ${p.ai_primary_category || 'Unknown'}`);
    console.log(`       Global: ${globalPercentile}, Audience: ${audienceSize}, Engagement: ${p.ai_engagement_level}/10`);
    console.log('');
  });

  // -------------------------------------------------------------------------
  // 4. Category Distribution (Top 5)
  // -------------------------------------------------------------------------
  console.log('📊 TOP 5 CATEGORIES (by podcast count):\n');

  const categoryCount = {};
  processedPodcasts.forEach(p => {
    const category = p.ai_primary_category || 'Unknown';
    categoryCount[category] = (categoryCount[category] || 0) + 1;
  });

  const sortedCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  sortedCategories.forEach(([category, count], i) => {
    const percentage = ((count / processedPodcasts.length) * 100).toFixed(1);
    console.log(`   ${(i + 1).toString()}. ${category.padEnd(45)} ${count.toString().padStart(4)} (${percentage}%)`);
  });

  // -------------------------------------------------------------------------
  // 5. Global Percentile Distribution
  // -------------------------------------------------------------------------
  console.log('\n🌐 GLOBAL PERCENTILE DISTRIBUTION:\n');

  const globalPercentileBuckets = {
    'Top 1%': 0,
    'Top 5%': 0,
    'Top 10%': 0,
    'Top 25%': 0,
    'Top 50%': 0,
    'Standard': 0,
    'Unknown': 0
  };

  processedPodcasts.forEach(p => {
    const percentile = p.ai_global_percentile || 'Unknown';
    if (globalPercentileBuckets.hasOwnProperty(percentile)) {
      globalPercentileBuckets[percentile]++;
    }
  });

  Object.entries(globalPercentileBuckets).forEach(([percentile, count]) => {
    if (count > 0) {
      const percentage = ((count / processedPodcasts.length) * 100).toFixed(1);
      console.log(`   ${percentile.padEnd(12)} ${count.toString().padStart(4)} (${percentage}%)`);
    }
  });

  console.log('\n' + '─'.repeat(80));
}

async function main() {
  console.log('='.repeat(80));
  console.log('   🤖 PODCAST CATEGORIZATION & SCORING (UNIFIED)');
  console.log('='.repeat(80));
  console.log(`📊 Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️  Pause between batches: ${PAUSE_BETWEEN_BATCHES}ms`);
  console.log(`🎯 Max podcasts: ${MAX_PODCASTS_TO_PROCESS}`);
  console.log(`🏷️  Niches: ${BADASSERY_NICHES.length}`);
  console.log(`📝 Topics: ${BADASSERY_TOPICS.length}`);
  if (DRY_RUN) {
    console.log(`⚠️  DRY-RUN MODE: No Firestore writes will be performed`);
  }
  console.log('='.repeat(80));
  console.log('');

  try {
    // Fetch podcasts to process
    log('📂 Fetching podcasts from Firestore...');

    let query = db.collection('podcasts')
      .orderBy('updatedAt', 'desc')
      .limit(MAX_PODCASTS_TO_PROCESS);

    const snapshot = await query.get();
    const podcasts = snapshot.docs.map(doc => ({
      ...doc.data(),
      itunesId: doc.id  // Use document ID as itunesId (override any invalid field value)
    })).filter(p => p.aiCategorizationStatus !== 'completed');

    log(`✅ Found ${podcasts.length} podcasts to process\n`);

    if (podcasts.length === 0) {
      log('✅ No podcasts need processing!');
      process.exit(0);
    }

    const totalStats = {
      processed: 0,
      failed: 0,
      skipped: 0
    };

    // Array to store all processed podcasts (for percentile calculation)
    const processedPodcasts = [];

    // =========================================================================
    // PHASE 1 & 2: Gemini Categorization + Individual Scoring
    // =========================================================================
    log('\n🔄 PHASE 1-2: Categorization & Individual Scoring\n');

    for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
      const batch = podcasts.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(podcasts.length / BATCH_SIZE);

      log(`\n${'='.repeat(80)}`);
      log(`📦 Batch ${batchNumber}/${totalBatches} (${batch.length} podcasts)`);
      log(`${'='.repeat(80)}`);

      // Step 1: Gemini Categorization
      log(`🤖 Categorizing with Gemini...`);
      const aiResults = await categorizeBatch(batch);

      if (!aiResults || aiResults.length !== batch.length) {
        log(`❌ Gemini batch failed, skipping...`);
        totalStats.failed += batch.length;
        continue;
      }

      // Step 2: Calculate individual scores (engagement, audience, quality)
      log(`📊 Calculating individual scores...`);

      for (let j = 0; j < batch.length; j++) {
        const podcast = batch[j];
        const aiCat = aiResults[j];

        log(`\n   Processing: ${podcast.title}`);
        log(`   → Niche: ${aiCat.niche}`);
        log(`   → Topics: ${aiCat.topics?.join(', ')}`);
        log(`   → Business: ${aiCat.business_relevance}/10`);
        log(`   → Guest-Friendly: ${aiCat.guest_friendly ? 'Yes' : 'No'}`);

        const result = await processAndScorePodcast(podcast, aiCat);

        if (result.success) {
          totalStats.processed++;
          processedPodcasts.push(result.data);
          log(`   ✅ Success - Engagement: ${result.data.ai_engagement_level}/10, Audience: ${result.data.ai_audience_size}`);
        } else if (result.skipped) {
          totalStats.skipped++;
        } else {
          totalStats.failed++;
        }
      }

      log(`\n📊 Batch ${batchNumber} complete:`);
      log(`   ✅ Processed: ${totalStats.processed}`);
      log(`   ⏭️  Skipped: ${totalStats.skipped}`);
      log(`   ❌ Failed: ${totalStats.failed}`);

      // Pause between batches
      if (i + BATCH_SIZE < podcasts.length) {
        log(`\n⏸️  Pausing ${PAUSE_BETWEEN_BATCHES}ms...\n`);
        await sleep(PAUSE_BETWEEN_BATCHES);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('   ✅ PHASE 1-2 COMPLETE');
    console.log('='.repeat(80));
    console.log(`\n📊 Results:`);
    console.log(`   ✅ Processed: ${totalStats.processed}`);
    console.log(`   ⏭️  Skipped: ${totalStats.skipped}`);
    console.log(`   ❌ Failed: ${totalStats.failed}`);
    console.log('='.repeat(80));

    // =========================================================================
    // PHASE 3: Calculate Percentiles (Global + Category)
    // =========================================================================
    if (processedPodcasts.length === 0) {
      log('\n⚠️  No podcasts to process percentiles for');
      process.exit(0);
    }

    console.log('\n' + '='.repeat(80));
    console.log('   📊 PHASE 3: Percentile Calculation (Global + Category)');
    console.log('='.repeat(80));

    // AMÉLIORATION: Calculate GLOBAL percentiles first
    const globalPercentileMap = calculateGlobalPercentiles(processedPodcasts);

    // Then calculate category percentiles with global fallback
    const percentileMap = calculatePercentiles(processedPodcasts, globalPercentileMap);

    // =========================================================================
    // PHASE 4: Calculate Badassery Scores
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('   🎯 PHASE 4: Badassery Score Calculation');
    console.log('='.repeat(80));

    processedPodcasts.forEach(podcast => {
      const percentileData = percentileMap[podcast.itunesId];
      const globalData = globalPercentileMap[podcast.itunesId];
      const badasseryScore = calculateBadasseryScore(podcast, percentileData);

      // Add category percentile to podcast object
      podcast.ai_category_percentile = percentileData.category_percentile;
      podcast.ai_category_rank = percentileData.category_rank;
      podcast.ai_category_total = percentileData.category_total;
      podcast.ai_percentile_used_global = percentileData.used_global || false;

      // AMÉLIORATION: Add global percentile to podcast object
      podcast.ai_global_percentile = globalData.global_percentile;
      podcast.ai_global_rank = globalData.global_rank;
      podcast.ai_global_total = globalData.global_total;

      // Add Badassery Score
      podcast.ai_badassery_score = badasseryScore;

      log(`   ✅ ${podcast.title}: ${badasseryScore}/100 (Category: ${percentileData.category_percentile}, Global: ${globalData.global_percentile})`);
    });

    // =========================================================================
    // PHASE 5: Update Firestore with ALL fields
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    if (DRY_RUN) {
      console.log('   💾 PHASE 5: Dry-Run Mode (NO Firestore writes)');
    } else {
      console.log('   💾 PHASE 5: Updating Firestore');
    }
    console.log('='.repeat(80));

    let updateSuccess = 0;
    let updateFailed = 0;

    for (const podcast of processedPodcasts) {
      try {
        const updateData = {
          // AI Categorization (from Gemini)
          ai_primary_category: podcast.ai_primary_category,
          ai_secondary_categories: podcast.ai_secondary_categories,
          ai_topics: podcast.ai_topics,
          ai_target_audience: podcast.ai_target_audience,
          ai_podcast_style: podcast.ai_podcast_style,
          ai_business_relevance: podcast.ai_business_relevance,
          ai_guest_friendly: podcast.ai_guest_friendly,
          ai_summary: podcast.ai_summary,

          // Individual Scores
          ai_engagement_level: podcast.ai_engagement_level,
          ai_audience_size: podcast.ai_audience_size,
          ai_content_quality: podcast.ai_content_quality,
          ai_monetization_potential: podcast.ai_monetization_potential,

          // Category Percentile & Ranking
          ai_category_percentile: podcast.ai_category_percentile,
          ai_category_rank: podcast.ai_category_rank,
          ai_category_total: podcast.ai_category_total,
          ai_percentile_used_global: podcast.ai_percentile_used_global,

          // AMÉLIORATION: Global Percentile & Ranking
          ai_global_percentile: podcast.ai_global_percentile,
          ai_global_rank: podcast.ai_global_rank,
          ai_global_total: podcast.ai_global_total,

          // Badassery Score
          ai_badassery_score: podcast.ai_badassery_score,

          // Metadata
          aiCategorizationStatus: 'completed',
          aiCategorizedAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now()
        };

        // AMÉLIORATION: Dry-run mode
        if (DRY_RUN) {
          log(`   [DRY-RUN] Would update "${podcast.title}" (Score: ${podcast.ai_badassery_score}/100, Global: ${podcast.ai_global_percentile})`);
          updateSuccess++;
        } else {
          const docRef = db.collection('podcasts').doc(podcast.itunesId);
          await docRef.update(updateData);

          updateSuccess++;
          if (updateSuccess % 10 === 0) {
            log(`   ✅ Updated ${updateSuccess}/${processedPodcasts.length} podcasts...`);
          }
        }
      } catch (error) {
        log(`   ❌ Failed to update ${podcast.title}: ${error.message}`);
        updateFailed++;

        // Mark as failed in Firestore
        try {
          const docRef = db.collection('podcasts').doc(podcast.itunesId);
          await docRef.update({
            aiCategorizationStatus: 'failed',
            aiCategorizationError: error.message,
            updatedAt: admin.firestore.Timestamp.now()
          });
        } catch (e) {
          // Ignore
        }
      }

      if (!DRY_RUN) {
        await sleep(100); // Small pause to avoid Firestore rate limits
      }
    }

    // =========================================================================
    // AMÉLIORATION: PHASE 6 - Detailed Final Stats
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('   📊 PHASE 6: Detailed Statistics');
    console.log('='.repeat(80));

    printFinalStats(processedPodcasts);

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('   ✅ ALL PHASES COMPLETE');
    console.log('='.repeat(80));
    console.log(`\n📊 Quick Summary:`);
    console.log(`   Phase 1-2 (Categorization):`);
    console.log(`     ✅ Processed: ${totalStats.processed}`);
    console.log(`     ⏭️  Skipped: ${totalStats.skipped}`);
    console.log(`     ❌ Failed: ${totalStats.failed}`);
    console.log(`\n   Phase 5 (Firestore Update):`);
    console.log(`     ✅ Success: ${updateSuccess}`);
    console.log(`     ❌ Failed: ${updateFailed}`);
    if (DRY_RUN) {
      console.log(`\n   ⚠️  DRY-RUN MODE: No changes were written to Firestore`);
    }
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
