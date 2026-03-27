/**
 * PARALLEL PODCAST SCORING V2.0
 *
 * High-performance parallel processing script for 120K+ podcasts
 *
 * Features:
 * - Adaptive concurrency (20-50 parallel Gemini requests)
 * - Checkpointing every 1000 podcasts
 * - Circuit breaker (stops after 10 consecutive errors)
 * - Progress bar with ETA
 * - Memory monitoring
 * - Wave-based processing (--offset, --limit)
 * - Dry-run mode
 *
 * Usage:
 *   node scripts/parallel_scoring_v2.js                          # Process all
 *   node scripts/parallel_scoring_v2.js --limit=1000             # Test with 1000
 *   node scripts/parallel_scoring_v2.js --offset=0 --limit=30000 # Wave 1
 *   node scripts/parallel_scoring_v2.js --dry-run                # No Firestore writes
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIGS = {
  conservative: {
    geminiParallel: 10,
    firestoreParallel: 50,
    description: 'Conservative (for testing)'
  },
  safe: {
    geminiParallel: 20,
    firestoreParallel: 100,
    description: 'Safe (recommended start)'
  },
  aggressive: {
    geminiParallel: 20,
    firestoreParallel: 100,
    description: 'Aggressive (after testing)'
  }
};

// Parse CLI arguments
const args = process.argv.slice(2);
const getArg = (name, defaultVal) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : defaultVal;
};

const CONFIG_MODE = getArg('config', 'safe');
const CONFIG = CONFIGS[CONFIG_MODE] || CONFIGS.safe;
const DRY_RUN = args.includes('--dry-run');
const OFFSET = parseInt(getArg('offset', '0'));
const LIMIT = parseInt(getArg('limit', '999999'));
const CHECKPOINT_INTERVAL = 1000;
const CHECKPOINT_FILE = path.join(__dirname, '../.checkpoint.json');
const MAX_CONSECUTIVE_ERRORS = 10;
const MEMORY_CHECK_INTERVAL = 100; // Check memory every 100 podcasts

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
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// ============================================================================
// BADASSERY NICHES & TOPICS (Same as original)
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function log(msg, level = 'INFO') {
  const timestamp = new Date().toLocaleTimeString();
  const icon = {
    INFO: 'ℹ️',
    SUCCESS: '✅',
    ERROR: '❌',
    WARN: '⚠️',
    PROGRESS: '⏳'
  }[level] || 'ℹ️';
  console.log(`[${timestamp}] ${icon} ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getMemoryUsage() {
  const used = process.memoryUsage();
  return {
    rss: Math.round(used.rss / 1024 / 1024),
    heapTotal: Math.round(used.heapTotal / 1024 / 1024),
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024)
  };
}

function printProgressBar(current, total, startTime) {
  const percentage = Math.round((current / total) * 100);
  const elapsed = (Date.now() - startTime) / 1000; // seconds
  const rate = current / elapsed;
  const remaining = total - current;
  const eta = remaining / rate;

  const barLength = 40;
  const filledLength = Math.round((current / total) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

  const etaMin = Math.round(eta / 60);
  const etaHours = Math.floor(etaMin / 60);
  const etaMinRem = etaMin % 60;

  const etaStr = etaHours > 0
    ? `${etaHours}h ${etaMinRem}m`
    : `${etaMinRem}m`;

  process.stdout.write(`\r⏳ [${bar}] ${percentage}% | ${current}/${total} | ETA: ${etaStr} | Rate: ${rate.toFixed(1)}/s    `);
}

// ============================================================================
// CHECKPOINT MANAGEMENT
// ============================================================================

function saveCheckpoint(data) {
  try {
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(data, null, 2));
    log(`Checkpoint saved: ${data.processed} podcasts processed`, 'SUCCESS');
  } catch (error) {
    log(`Failed to save checkpoint: ${error.message}`, 'ERROR');
  }
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const data = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      log(`Checkpoint loaded: Resuming from ${data.processed} podcasts`, 'INFO');
      return data;
    }
  } catch (error) {
    log(`Failed to load checkpoint: ${error.message}`, 'WARN');
  }
  return null;
}

function clearCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      fs.unlinkSync(CHECKPOINT_FILE);
      log('Checkpoint cleared', 'INFO');
    }
  } catch (error) {
    log(`Failed to clear checkpoint: ${error.message}`, 'WARN');
  }
}

// ============================================================================
// SCORING FUNCTIONS (From original script)
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

function getRecentYouTubeViews(podcast) {
  const views = [];
  for (let i = 1; i <= 10; i++) {
    const viewCount = safeInt(safeGet(podcast, `recent_${i}_views`));
    if (viewCount > 0) {
      views.push(viewCount);
    }
  }
  return views;
}

function calculateEngagementLevel(podcast) {
  const WEIGHTS = {
    apple: 3.0,
    youtube: 3.0,
    freshness: 2.0,
    social: 1.0
  };

  const scores = [];
  let totalWeight = 0;

  // Signal 1: Apple Reviews
  const appleRating = parseFloat(safeGet(podcast, 'apple_rating')) || 0;
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));

  if (appleRating > 0 && appleReviews >= 5) {
    let appleScore = appleRating * 2;
    if (appleReviews >= 100) appleScore += 1;
    if (appleReviews >= 500) appleScore += 1;

    scores.push({ val: Math.min(10.0, appleScore), weight: WEIGHTS.apple });
    totalWeight += WEIGHTS.apple;
  }

  // Signal 2: YouTube Engagement
  const ytSubs = safeInt(safeGet(podcast, 'yt_subscribers'));
  const recentViews = getRecentYouTubeViews(podcast);

  if (ytSubs > 0 && recentViews.length >= 3) {
    const avgViews = recentViews.reduce((a, b) => a + b, 0) / recentViews.length;
    const viewToSubRatio = avgViews / ytSubs;

    let ytScore = 1.0;
    if (viewToSubRatio >= 0.15) ytScore = 10.0;
    else if (viewToSubRatio >= 0.10) ytScore = 8.0;
    else if (viewToSubRatio >= 0.05) ytScore = 6.0;
    else if (viewToSubRatio >= 0.02) ytScore = 4.0;
    else ytScore = 2.0;

    if (ytSubs >= 10000) {
      if (avgViews >= ytSubs * 0.10) ytScore = Math.min(10.0, ytScore + 1);
      else if (avgViews >= ytSubs * 0.05) ytScore = Math.min(10.0, ytScore + 0.5);
    }

    scores.push({ val: Math.min(10.0, ytScore), weight: WEIGHTS.youtube });
    totalWeight += WEIGHTS.youtube;
  }

  // Signal 3: Freshness
  const daysSince = getDaysSince(podcast);

  if (daysSince !== null) {
    let freshScore = 1.0;

    if (daysSince <= 7) freshScore = 10.0;
    else if (daysSince <= 14) freshScore = 9.0;
    else if (daysSince <= 30) freshScore = 7.5;
    else if (daysSince <= 60) freshScore = 5.0;
    else if (daysSince <= 90) freshScore = 3.0;
    else freshScore = 1.5;

    scores.push({ val: freshScore, weight: WEIGHTS.freshness });
    totalWeight += WEIGHTS.freshness;
  }

  // Signal 4: Social Media
  const instagramFollowers = safeInt(safeGet(podcast, 'instagram_followers'));
  const twitterFollowers = safeInt(safeGet(podcast, 'twitter_followers'));
  const linkedinFollowers = safeInt(safeGet(podcast, 'linkedin_followers'));

  const totalSocialFollowers = instagramFollowers + twitterFollowers + linkedinFollowers;

  if (totalSocialFollowers > 0) {
    let socialScore = safeLog(totalSocialFollowers) * 1.5;
    socialScore = Math.min(10.0, Math.max(1.0, socialScore));

    scores.push({ val: socialScore, weight: WEIGHTS.social });
    totalWeight += WEIGHTS.social;
  }

  if (scores.length === 0) return 1.0;

  const weightedSum = scores.reduce((sum, s) => sum + (s.val * s.weight), 0);
  const finalScore = weightedSum / totalWeight;

  return Math.round(finalScore * 10) / 10;
}

function calculateAudienceSize(podcast) {
  const ytSubs = safeInt(safeGet(podcast, 'yt_subscribers'));
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  const episodes = safeInt(safeGet(podcast, 'episodeCount'));
  const recentViews = getRecentYouTubeViews(podcast);
  const avgViews = recentViews.length > 0
    ? recentViews.reduce((a, b) => a + b, 0) / recentViews.length
    : 0;

  const THRESHOLDS = {
    yt_subscribers: { very_large: 100000, large: 25000, medium: 5000 },
    apple_reviews: { very_large: 500, large: 100, medium: 25 },
    episodes: { very_large: 200, large: 100, medium: 50 },
    avg_views: { very_large: 50000, large: 10000, medium: 2000 }
  };

  let voteVeryLarge = 0, voteLarge = 0, voteMedium = 0, voteSmall = 0;

  if (ytSubs >= THRESHOLDS.yt_subscribers.very_large) voteVeryLarge++;
  else if (ytSubs >= THRESHOLDS.yt_subscribers.large) voteLarge++;
  else if (ytSubs >= THRESHOLDS.yt_subscribers.medium) voteMedium++;
  else if (ytSubs > 0) voteSmall++;

  if (appleReviews >= THRESHOLDS.apple_reviews.very_large) voteVeryLarge++;
  else if (appleReviews >= THRESHOLDS.apple_reviews.large) voteLarge++;
  else if (appleReviews >= THRESHOLDS.apple_reviews.medium) voteMedium++;
  else if (appleReviews > 0) voteSmall++;

  if (episodes >= THRESHOLDS.episodes.very_large) voteVeryLarge++;
  else if (episodes >= THRESHOLDS.episodes.large) voteLarge++;
  else if (episodes >= THRESHOLDS.episodes.medium) voteMedium++;
  else if (episodes > 0) voteSmall++;

  if (avgViews >= THRESHOLDS.avg_views.very_large) voteVeryLarge++;
  else if (avgViews >= THRESHOLDS.avg_views.large) voteLarge++;
  else if (avgViews >= THRESHOLDS.avg_views.medium) voteMedium++;
  else if (avgViews > 0) voteSmall++;

  if (voteVeryLarge >= 2) return 'Very Large';
  if (voteLarge >= 2) return 'Large';
  if (voteMedium >= 2) return 'Medium';
  if (voteSmall >= 2) return 'Small';

  if (voteVeryLarge >= 1) return 'Very Large';
  if (voteLarge >= 1) return 'Large';
  if (voteMedium >= 1) return 'Medium';

  return 'Small';
}

function calculateContentQuality(podcast) {
  const appleRating = parseFloat(safeGet(podcast, 'apple_rating')) || 0;
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));

  if (appleRating === 0) return 5.0;

  let qualityScore = appleRating * 2;

  if (appleReviews >= 100) qualityScore += 1.0;
  else if (appleReviews >= 50) qualityScore += 0.5;

  return Math.min(10.0, Math.round(qualityScore * 10) / 10);
}

function calculateMonetizationPotential(podcast, engagementLevel, audienceSize) {
  const sizeMap = { 'Small': 2.5, 'Medium': 5.0, 'Large': 7.5, 'Very Large': 10.0, 'Unknown': 3.0 };
  const sizeScore = sizeMap[audienceSize] || 3.0;

  const monetizationScore = (sizeScore * 0.6) + (engagementLevel * 0.4);
  return Math.round(monetizationScore * 10) / 10;
}

function calculatePowerScore(podcast) {
  const ytSubs = safeInt(safeGet(podcast, 'yt_subscribers'));
  const appleReviews = safeInt(safeGet(podcast, 'apple_rating_count'));
  const episodes = safeInt(safeGet(podcast, 'episodeCount'));
  const appleRating = parseFloat(safeGet(podcast, 'apple_rating')) || 0;

  const score = (
    safeLog(ytSubs) * 10 +
    safeLog(appleReviews) * 15 +
    safeLog(episodes) * 5
  );

  if (appleRating >= 4.5 && appleReviews >= 20) {
    return score * 1.1;
  }

  return score;
}

// ============================================================================
// GEMINI CATEGORIZATION (Parallel)
// ============================================================================

async function categorizeSinglePodcast(podcast, retries = 2) {
  /**
   * Categorize a SINGLE podcast with Gemini (for parallel processing)
   */

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
- Is it guest-friendly? (true if they regularly have guests)
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

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text().trim();

      // Clean JSON - Enhanced cleaning for control characters and quotes
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();

      const jsonStart = Math.min(
        text.indexOf('{') >= 0 ? text.indexOf('{') : Infinity
      );
      if (jsonStart !== Infinity && jsonStart > 0) {
        text = text.substring(jsonStart);
      }

      const jsonEnd = text.lastIndexOf('}');
      if (jsonEnd >= 0) {
        text = text.substring(0, jsonEnd + 1);
      }

      // Remove comments
      text = text.replace(/\/\/.*$/gm, '');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');

      // ENHANCED: Replace control characters INCLUDING newlines within string values
      // First, protect escaped characters
      text = text.replace(/\\n/g, '__ESCAPED_NEWLINE__');
      text = text.replace(/\\"/g, '__ESCAPED_QUOTE__');
      text = text.replace(/\\\\/g, '__ESCAPED_BACKSLASH__');

      // Remove ALL control chars including \n, \r, \t
      text = text.replace(/[\x00-\x1F\x7F]/g, ' ');

      // Fix unescaped quotes inside string values (between ": and ")
      // This regex finds string values and escapes any unescaped quotes inside them
      text = text.replace(/":\s*"([^"]*(?:"[^"]*)*?)"/g, (match, content) => {
        // Restore escaped quotes temporarily
        let fixed = content.replace(/__ESCAPED_QUOTE__/g, '\\"');
        return '": "' + fixed + '"';
      });

      // Restore properly escaped characters
      text = text.replace(/__ESCAPED_NEWLINE__/g, '\\n');
      text = text.replace(/__ESCAPED_QUOTE__/g, '\\"');
      text = text.replace(/__ESCAPED_BACKSLASH__/g, '\\\\');

      // Fix common JSON issues
      text = text.replace(/,\s*([}\]])/g, '$1');
      text = text.replace(/'\s*:/g, '":');
      text = text.replace(/:\s*'/g, ':"');
      text = text.replace(/'([^']*)'(?=\s*[,}\]])/g, '"$1"');

      // Clean up multiple spaces
      text = text.replace(/\s+/g, ' ');

      const aiResult = JSON.parse(text);
      return { success: true, data: aiResult };

    } catch (error) {
      // Log the actual error for debugging
      console.log(`\n⚠️  Gemini error (attempt ${attempt}/${retries}):`, error.message);

      // DEBUG: Show first 500 chars of problematic JSON on last attempt
      if (attempt === retries && text) {
        console.log(`   Raw JSON (${text.length} chars): ${text.substring(0, 500)}...`);
        // Show the problematic area (around the error position if available)
        const errorMatch = error.message.match(/position (\d+)/);
        if (errorMatch) {
          const errorPos = parseInt(errorMatch[1]);
          const start = Math.max(0, errorPos - 50);
          const end = Math.min(text.length, errorPos + 50);
          console.log(`   Around error: ...${text.substring(start, end)}...`);
        }
      }

      if (attempt < retries) {
        await sleep(1000);
      } else {
        return { success: false, error: error.message };
      }
    }
  }

  return { success: false, error: 'Max retries exceeded' };
}

// ============================================================================
// PARALLEL PROCESSING ENGINE
// ============================================================================

async function processInParallel(items, processFn, concurrency, onProgress) {
  /**
   * Generic parallel processing with concurrency control
   */
  const results = [];
  const queue = [...items];
  let completed = 0;
  let consecutiveErrors = 0;

  const workers = Array(concurrency).fill(null).map(async (_, workerId) => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) break;

      try {
        const result = await processFn(item, workerId);
        results.push(result);

        if (result.success) {
          consecutiveErrors = 0; // Reset on success
        } else {
          consecutiveErrors++;
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            log(`Circuit breaker triggered: ${consecutiveErrors} consecutive errors`, 'ERROR');
            throw new Error('Too many consecutive errors - stopping');
          }
        }

        completed++;
        if (onProgress) {
          onProgress(completed, items.length);
        }

      } catch (error) {
        results.push({ success: false, error: error.message, item });
        consecutiveErrors++;

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          log(`Circuit breaker triggered: ${consecutiveErrors} consecutive errors`, 'ERROR');
          throw error;
        }

        completed++;
        if (onProgress) {
          onProgress(completed, items.length);
        }
      }
    }
  });

  await Promise.all(workers);
  return results;
}

// ============================================================================
// MAIN PROCESSING PIPELINE
// ============================================================================

async function main() {
  console.log('='.repeat(80));
  console.log('   🚀 PARALLEL PODCAST SCORING V2.0');
  console.log('='.repeat(80));
  console.log(`⚙️  Configuration: ${CONFIG_MODE} (${CONFIG.description})`);
  console.log(`   - Gemini parallel: ${CONFIG.geminiParallel}`);
  console.log(`   - Firestore parallel: ${CONFIG.firestoreParallel}`);
  console.log(`📊 Processing range: OFFSET=${OFFSET}, LIMIT=${LIMIT}`);
  console.log(`💾 Checkpointing: Every ${CHECKPOINT_INTERVAL} podcasts`);
  console.log(`🔧 Circuit breaker: ${MAX_CONSECUTIVE_ERRORS} consecutive errors`);
  if (DRY_RUN) {
    console.log(`⚠️  DRY-RUN MODE: No Firestore writes`);
  }
  console.log('='.repeat(80));
  console.log('');

  const startTime = Date.now();
  let processedCount = 0;

  try {
    // Check for checkpoint
    const checkpoint = loadCheckpoint();
    const resumeFromId = checkpoint?.lastProcessedId || null;

    // Fetch podcasts
    log('📂 Fetching podcasts from Firestore...');

    // Strategy: We need to find podcasts WITHOUT ai_badassery_score
    // Firestore limitation: Can't efficiently query for missing fields or null values
    // Solution: Load in batches and filter, until we have LIMIT uncategorized podcasts

    let podcasts = [];
    let lastDoc = null;
    const BATCH_SIZE = 1000; // Load 1000 at a time
    let totalFetched = 0;

    log(`Loading podcasts in batches (batch size: ${BATCH_SIZE})...`);
    log(`Strategy: Scan entire collection to find podcasts without ai_badassery_score`);
    log(`⚠️  Memory limit: Will stop loading at 10,000 uncategorized to avoid OOM`);

    const MAX_UNCATEGORIZED = 10000; // Prevent OOM by limiting array size

    while (podcasts.length < Math.min(LIMIT, MAX_UNCATEGORIZED) && totalFetched < 300000) { // Safety limit: max 300K
      // Use document ID for consistent ordering (no index needed)
      let batchQuery = db.collection('podcasts')
        .orderBy(admin.firestore.FieldPath.documentId());

      if (OFFSET > 0 && totalFetched === 0) {
        batchQuery = batchQuery.offset(OFFSET);
      }

      if (lastDoc) {
        batchQuery = batchQuery.startAfter(lastDoc);
      }

      batchQuery = batchQuery.limit(BATCH_SIZE);

      const snapshot = await batchQuery.get();

      if (snapshot.empty) {
        log('No more podcasts in database');
        break;
      }

      // Filter for podcasts without scores
      const uncategorizedInBatch = snapshot.docs
        .map(doc => ({
          ...doc.data(),
          itunesId: doc.id
        }))
        .filter(p => !p.ai_badassery_score);

      podcasts.push(...uncategorizedInBatch);
      totalFetched += snapshot.docs.length;
      lastDoc = snapshot.docs[snapshot.docs.length - 1];

      log(`Fetched ${totalFetched} total, found ${podcasts.length} uncategorized so far...`);

      // Stop if we have enough
      if (podcasts.length >= LIMIT) {
        podcasts = podcasts.slice(0, LIMIT);
        break;
      }
    }

    // Resume from checkpoint if exists
    if (resumeFromId) {
      const resumeIndex = podcasts.findIndex(p => p.itunesId === resumeFromId);
      if (resumeIndex >= 0) {
        podcasts = podcasts.slice(resumeIndex + 1);
        log(`Resuming from podcast #${resumeIndex + 1}`, 'INFO');
      }
    }

    log(`✅ Found ${podcasts.length} podcasts to process\n`, 'SUCCESS');

    if (podcasts.length === 0) {
      log('No podcasts to process!', 'INFO');
      clearCheckpoint();
      process.exit(0);
    }

    // =========================================================================
    // PHASE 1: PARALLEL GEMINI CATEGORIZATION
    // =========================================================================
    console.log('='.repeat(80));
    console.log('   🤖 PHASE 1: Parallel Gemini Categorization');
    console.log('='.repeat(80));
    console.log('');

    log(`Processing ${podcasts.length} podcasts with ${CONFIG.geminiParallel} parallel requests...`);

    const categorizedPodcasts = [];
    let phaseStartTime = Date.now();

    const categorizeResults = await processInParallel(
      podcasts,
      async (podcast) => {
        const aiResult = await categorizeSinglePodcast(podcast);

        if (aiResult.success) {
          const aiCat = aiResult.data;

          // Calculate scores
          const engagementLevel = calculateEngagementLevel(podcast);
          const audienceSize = calculateAudienceSize(podcast);
          const contentQuality = calculateContentQuality(podcast);
          const monetizationPotential = calculateMonetizationPotential(
            podcast,
            engagementLevel,
            audienceSize
          );

          return {
            success: true,
            data: {
              itunesId: podcast.itunesId,
              title: podcast.title,
              ai_primary_category: aiCat.niche || '',
              ai_secondary_categories: aiCat.secondary_categories || [],
              ai_topics: aiCat.topics || [],
              ai_target_audience: aiCat.target_audience || '',
              ai_podcast_style: aiCat.podcast_style || '',
              ai_business_relevance: aiCat.business_relevance || 5,
              ai_guest_friendly: aiCat.guest_friendly || false,
              ai_summary: aiCat.summary || '',
              ai_engagement_level: engagementLevel,
              ai_audience_size: audienceSize,
              ai_content_quality: contentQuality,
              ai_monetization_potential: monetizationPotential,
              _original: podcast
            }
          };
        }

        return { success: false, error: aiResult.error, itunesId: podcast.itunesId };
      },
      CONFIG.geminiParallel,
      (completed, total) => {
        printProgressBar(completed, total, phaseStartTime);

        // Memory check
        if (completed % MEMORY_CHECK_INTERVAL === 0) {
          const mem = getMemoryUsage();
          if (mem.heapUsed > 1500) { // Warning at 1.5GB
            log(`\n⚠️  High memory usage: ${mem.heapUsed}MB`, 'WARN');
          }
        }

        // Checkpoint
        if (completed % CHECKPOINT_INTERVAL === 0) {
          const lastProcessed = categorizeResults[categorizeResults.length - 1];
          if (lastProcessed?.data?.itunesId) {
            saveCheckpoint({
              lastProcessedId: lastProcessed.data.itunesId,
              processed: completed,
              timestamp: Date.now()
            });
          }
        }
      }
    );

    console.log(''); // New line after progress bar

    // Filter successful results
    const successfulCategorizations = categorizeResults.filter(r => r.success);
    categorizedPodcasts.push(...successfulCategorizations.map(r => r.data));

    log(`Phase 1 complete: ${successfulCategorizations.length}/${podcasts.length} successful`, 'SUCCESS');

    if (categorizedPodcasts.length === 0) {
      log('No podcasts were successfully categorized', 'ERROR');
      process.exit(1);
    }

    // =========================================================================
    // PHASE 2: CALCULATE PERCENTILES
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('   📊 PHASE 2: Calculate Percentiles');
    console.log('='.repeat(80));
    console.log('');

    log('Calculating global percentiles...');

    // Global percentiles
    const globalMap = {};
    const scored = categorizedPodcasts.map(p => ({
      podcast: p,
      score: calculatePowerScore(p._original)
    }));

    scored.sort((a, b) => b.score - a.score);

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

    log(`✅ Ranked ${scored.length} podcasts globally`, 'SUCCESS');

    // Category percentiles
    log('Calculating category percentiles...');

    const percentileMap = {};
    const byCategory = {};

    categorizedPodcasts.forEach(p => {
      const category = p.ai_primary_category || 'Unknown';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(p);
    });

    Object.keys(byCategory).forEach(category => {
      const categoryPodcasts = byCategory[category];

      if (categoryPodcasts.length < 10) {
        categoryPodcasts.forEach(p => {
          const globalData = globalMap[p.itunesId];
          percentileMap[p.itunesId] = {
            category_percentile: globalData.global_percentile,
            category_rank: null,
            category_total: categoryPodcasts.length,
            used_global: true
          };
        });
        return;
      }

      const catScored = categoryPodcasts.map(p => ({
        podcast: p,
        score: calculatePowerScore(p._original)
      }));

      catScored.sort((a, b) => b.score - a.score);

      catScored.forEach((item, index) => {
        const rank = index + 1;
        const percentile = (rank / catScored.length) * 100;

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
          category_total: catScored.length,
          used_global: false
        };
      });
    });

    log(`✅ Ranked podcasts across ${Object.keys(byCategory).length} categories`, 'SUCCESS');

    // =========================================================================
    // PHASE 3: CALCULATE BADASSERY SCORES
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    console.log('   🎯 PHASE 3: Calculate Badassery Scores');
    console.log('='.repeat(80));
    console.log('');

    categorizedPodcasts.forEach(podcast => {
      const percentileData = percentileMap[podcast.itunesId];
      const globalData = globalMap[podcast.itunesId];

      // Calculate Badassery Score
      const engagement = podcast.ai_engagement_level || 1;
      const sizeMap = { 'Small': 25, 'Medium': 50, 'Large': 75, 'Very Large': 100, 'Unknown': 30 };
      const audienceSize = podcast.ai_audience_size || 'Unknown';
      const percentileMapValues = {
        'Top 1%': 100, 'Top 5%': 90, 'Top 10%': 80,
        'Top 25%': 65, 'Top 50%': 50, 'Standard': 35, 'Unknown': 40
      };

      const engagementComponent = (engagement / 10) * 40;
      const sizeComponent = (sizeMap[audienceSize] / 100) * 30;
      const percentileComponent = (percentileMapValues[percentileData.category_percentile] / 100) * 30;
      const badasseryScore = Math.round((engagementComponent + sizeComponent + percentileComponent) * 10) / 10;

      // Add all percentile data
      podcast.ai_category_percentile = percentileData.category_percentile;
      podcast.ai_category_rank = percentileData.category_rank;
      podcast.ai_category_total = percentileData.category_total;
      podcast.ai_percentile_used_global = percentileData.used_global;
      podcast.ai_global_percentile = globalData.global_percentile;
      podcast.ai_global_rank = globalData.global_rank;
      podcast.ai_global_total = globalData.global_total;
      podcast.ai_badassery_score = badasseryScore;
    });

    log(`✅ Calculated Badassery Scores for ${categorizedPodcasts.length} podcasts`, 'SUCCESS');

    // =========================================================================
    // PHASE 4: PARALLEL FIRESTORE UPDATES
    // =========================================================================
    console.log('\n' + '='.repeat(80));
    if (DRY_RUN) {
      console.log('   💾 PHASE 4: Dry-Run (NO Firestore writes)');
    } else {
      console.log('   💾 PHASE 4: Parallel Firestore Updates');
    }
    console.log('='.repeat(80));
    console.log('');

    phaseStartTime = Date.now();

    const updateResults = await processInParallel(
      categorizedPodcasts,
      async (podcast) => {
        if (DRY_RUN) {
          await sleep(10); // Simulate write time
          return { success: true, itunesId: podcast.itunesId };
        }

        try {
          const updateData = {
            ai_primary_category: podcast.ai_primary_category,
            ai_secondary_categories: podcast.ai_secondary_categories,
            ai_topics: podcast.ai_topics,
            ai_target_audience: podcast.ai_target_audience,
            ai_podcast_style: podcast.ai_podcast_style,
            ai_business_relevance: podcast.ai_business_relevance,
            ai_guest_friendly: podcast.ai_guest_friendly,
            ai_summary: podcast.ai_summary,
            ai_engagement_level: podcast.ai_engagement_level,
            ai_audience_size: podcast.ai_audience_size,
            ai_content_quality: podcast.ai_content_quality,
            ai_monetization_potential: podcast.ai_monetization_potential,
            ai_category_percentile: podcast.ai_category_percentile,
            ai_category_rank: podcast.ai_category_rank,
            ai_category_total: podcast.ai_category_total,
            ai_percentile_used_global: podcast.ai_percentile_used_global,
            ai_global_percentile: podcast.ai_global_percentile,
            ai_global_rank: podcast.ai_global_rank,
            ai_global_total: podcast.ai_global_total,
            ai_badassery_score: podcast.ai_badassery_score,
            aiCategorizationStatus: 'completed',
            aiCategorizedAt: admin.firestore.Timestamp.now(),
            updatedAt: admin.firestore.Timestamp.now()
          };

          const docRef = db.collection('podcasts').doc(podcast.itunesId);
          await docRef.update(updateData);

          return { success: true, itunesId: podcast.itunesId };
        } catch (error) {
          return { success: false, error: error.message, itunesId: podcast.itunesId };
        }
      },
      DRY_RUN ? 999999 : CONFIG.firestoreParallel, // No limit in dry-run
      (completed, total) => {
        printProgressBar(completed, total, phaseStartTime);
      }
    );

    console.log(''); // New line after progress bar

    const successfulUpdates = updateResults.filter(r => r.success).length;
    const failedUpdates = updateResults.filter(r => !r.success).length;

    if (DRY_RUN) {
      log(`Dry-run complete: Would have updated ${successfulUpdates} podcasts`, 'SUCCESS');
    } else {
      log(`Updates complete: ${successfulUpdates} success, ${failedUpdates} failed`, 'SUCCESS');
    }

    // =========================================================================
    // FINAL SUMMARY
    // =========================================================================
    const totalTime = (Date.now() - startTime) / 1000;
    const rate = categorizedPodcasts.length / totalTime;

    console.log('\n' + '='.repeat(80));
    console.log('   ✅ ALL PHASES COMPLETE');
    console.log('='.repeat(80));
    console.log(`\n📊 Summary:`);
    console.log(`   Total processed: ${categorizedPodcasts.length}`);
    console.log(`   Successful: ${successfulUpdates}`);
    console.log(`   Failed: ${failedUpdates}`);
    console.log(`   Time elapsed: ${Math.round(totalTime / 60)} minutes`);
    console.log(`   Processing rate: ${rate.toFixed(1)} podcasts/second`);

    const mem = getMemoryUsage();
    console.log(`\n💾 Final memory usage:`);
    console.log(`   Heap used: ${mem.heapUsed}MB`);
    console.log(`   Total RSS: ${mem.rss}MB`);

    if (DRY_RUN) {
      console.log(`\n⚠️  DRY-RUN MODE: No changes written to Firestore`);
    }

    console.log('='.repeat(80));

    // Clear checkpoint on success
    clearCheckpoint();

    process.exit(0);

  } catch (error) {
    log(`Fatal error: ${error.message}`, 'ERROR');
    console.error(error.stack);
    process.exit(1);
  }
}

// ============================================================================
// START
// ============================================================================

main();
