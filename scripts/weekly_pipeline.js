/**
 * WEEKLY PIPELINE — Automated podcast ingestion
 *
 * Fetches podcasts added/updated in the last N days from PodcastIndex,
 * filters them, checks for guest-friendliness, scores them with Gemini,
 * writes new records to Firestore, and redeploys podcasts-lite.json.
 *
 * Usage:
 *   node scripts/weekly_pipeline.js                          # default 7-day lookback
 *   node scripts/weekly_pipeline.js --days=14                # custom lookback
 *   node scripts/weekly_pipeline.js --dry-run                # no writes, no deploy
 *   node scripts/weekly_pipeline.js --skip-deploy            # write to Firestore, skip deploy
 *   node scripts/weekly_pipeline.js --skip-health-check      # skip Phase 0
 *   node scripts/weekly_pipeline.js --health-check-limit=500 # check only N podcasts (incremental)
 *   node scripts/weekly_pipeline.js --skip-charts             # skip Apple Charts scrape (Phase 0b)
 *   node scripts/weekly_pipeline.js --skip-spotify-charts    # skip Spotify Charts scrape (Phase 0c)
 *   node scripts/weekly_pipeline.js --skip-spotify-rating    # skip Spotify Rating enrichment (Phase 0d)
 *   node scripts/weekly_pipeline.js --spotify-rating-batch=N # max podcasts to rate per run (default 50)
 *
 * Environment (read from .env):
 *   PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET
 *   GEMINI_API_KEY (or GEMINI_API_KEYS=key1,key2,...)
 *   GOOGLE_APPLICATION_CREDENTIALS (path to serviceAccountKey.json)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin    = require('firebase-admin');
const fs       = require('fs');
const path     = require('path');
const Database = require('better-sqlite3');
const { execSync, spawn } = require('child_process');

const { PodcastIndexClient } = require('./utils/podcastIndexClient');
const { ensureDatabase, DB_PATH } = require('./utils/sqliteDb');
const { scrapeAllAppleCharts }   = require('./utils/appleChartsScraper');
const { scrapeAllSpotifyCharts } = require('./utils/spotifyChartsScraper');
const { scrapeSpotifyRating }    = require('./utils/spotifyRating');
const {
  initKeyPool,
  categorizeSinglePodcast,
  calculateEngagementLevel,
  calculateAudienceSize,
  calculateContentQuality,
  calculateMonetizationPotential,
  calculatePercentiles,
  applyBadasseryScores,
} = require('./utils/geminiScorer');

// ============================================================================
// CONFIG
// ============================================================================

const args       = process.argv.slice(2);
const getArg     = (name, def) => { const a = args.find(a => a.startsWith(`--${name}=`)); return a ? a.split('=')[1] : def; };
const DRY_RUN    = args.includes('--dry-run');
const SKIP_DEPLOY = args.includes('--skip-deploy') || DRY_RUN;
const SKIP_HEALTH_CHECK  = args.includes('--skip-health-check');
const HEALTH_CHECK_LIMIT = parseInt(getArg('health-check-limit', '0')); // 0 = no limit
const SKIP_CHARTS           = args.includes('--skip-charts');
const SKIP_SPOTIFY_CHARTS   = args.includes('--skip-spotify-charts');
const SKIP_SPOTIFY_RATING   = args.includes('--skip-spotify-rating');
// Max podcasts to enrich with Spotify ratings per run (each page load ~10-15s)
const SPOTIFY_RATING_BATCH  = parseInt(getArg('spotify-rating-batch', '50'));
const MIN_EPISODES       = 50;
const MIN_GUEST_SIGNALS  = 3;     // out of 10 episode titles
const GEMINI_RATE        = parseInt(getArg('rate-limit', '10'));
const GEMINI_CONCURRENCY = parseInt(getArg('concurrency', '10'));
const CHECKPOINT_DIR  = path.join(__dirname, '../checkpoints');
const _today          = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const CHECKPOINT_FILE = path.join(CHECKPOINT_DIR, `weekly_${_today}.json`);

const GUEST_KEYWORDS = [
  'interview', ' with ', 'feat.', 'feat ', 'featuring',
  'guest', 'joined by', 'talks to', 'speaks with', "today's guest",
];

// ============================================================================
// FIREBASE INIT
// ============================================================================

const serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ============================================================================
// LOGGING
// ============================================================================

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️'}  ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================================
// CHECKPOINT
// ============================================================================

function saveCheckpoint(data) {
  try {
    if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ ...data, savedAt: Date.now() }, null, 2));
  } catch (e) { log(`Checkpoint save failed: ${e.message}`, 'WARN'); }
}

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const c = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      // Expire checkpoints older than 48 hours
      if (Date.now() - (c.savedAt || 0) < 48 * 3600 * 1000) {
        log(`Resuming from checkpoint: ${CHECKPOINT_FILE} (phase: ${c.phase})`);
        return c;
      }
      log('Checkpoint expired (>48h), starting fresh.', 'WARN');
    }
  } catch (_) {}
  return null;
}

function clearCheckpoint() {
  try { if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE); }
  catch (_) {}
}

// ============================================================================
// PHASE 0 — DATABASE HEALTH CHECK
// ============================================================================

/**
 * Iterates over all Firestore podcasts, looks up each one in the local SQLite
 * snapshot (data/podcastindex_feeds.db), and DELETES stale podcasts directly
 * from Firestore when newestItemPubdate is older than 60 days.
 *
 * Uses better-sqlite3 (synchronous) — no API calls, no rate limiting, runs at
 * full CPU/disk speed. 200K lookups typically complete in under 60 seconds.
 *
 * Use --health-check-limit=N to cap checks per run for incremental processing.
 */
async function runDatabaseHealthCheck() {
  if (SKIP_HEALTH_CHECK) {
    log('Phase 0: Database health check skipped (--skip-health-check).', 'WARN');
    return { checked: 0, inactive: 0, notFound: 0, skipped: 0 };
  }

  log('Phase 0: Loading all active podcasts from Firestore...', 'PHASE');

  const cutoffTs = Math.floor(Date.now() / 1000) - 60 * 86400;

  // ── Step 1: Load podcast IDs + PodcastIndex feedId from Firestore ─────────
  const allDocs  = [];
  let lastDoc    = null;
  let fetchBatch = 0;

  while (true) {
    let q = db.collection('podcasts')
      .select('id', 'feedId', 'active')  // minimal fields only
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => {
      if (d.data().active === false) return; // already inactive — skip
      const data   = d.data();
      const feedId = data.id || data.feedId || null;
      allDocs.push({ itunesId: d.id, feedId });
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    fetchBatch++;
    process.stdout.write(`\r  Phase 0: loaded ${allDocs.length} active podcasts (batch ${fetchBatch})...`);
    if (snap.docs.length < 1000) break;
  }
  process.stdout.write('\n');
  log(`Phase 0: ${allDocs.length} active podcasts to check.`);

  // Apply optional per-run limit for incremental weekly processing
  const toCheck = (HEALTH_CHECK_LIMIT > 0) ? allDocs.slice(0, HEALTH_CHECK_LIMIT) : allDocs;
  if (HEALTH_CHECK_LIMIT > 0) {
    log(`Phase 0: limit applied — checking first ${toCheck.length} of ${allDocs.length}.`, 'WARN');
  }

  // ── Step 2: SQLite lookup — synchronous, full speed, no rate limiting ─────
  const sqlite      = new Database(DB_PATH, { readonly: true });
  const stmt        = sqlite.prepare('SELECT newestItemPubdate FROM podcasts WHERE id = ?');
  const inactiveIds = [];
  let checked       = 0;
  let notFound      = 0;  // feedId present in Firestore but no matching row in SQLite
  let skipped       = 0;  // no feedId at all — can't cross-reference

  for (const doc of toCheck) {
    if (!doc.feedId) {
      skipped++;
      checked++;
      if (checked % 5000 === 0) {
        process.stdout.write(`\r  Phase 0: ${checked}/${toCheck.length} | inactive: ${inactiveIds.length} | skipped: ${skipped}...`);
      }
      continue;
    }

    const row = stmt.get(doc.feedId);
    if (!row) {
      notFound++;
    } else if ((row.newestItemPubdate || 0) <= cutoffTs) {
      inactiveIds.push(doc.itunesId);
    }

    checked++;
    if (checked % 5000 === 0) {
      process.stdout.write(`\r  Phase 0: ${checked}/${toCheck.length} | inactive: ${inactiveIds.length} | not found: ${notFound}...`);
    }
  }

  sqlite.close();
  process.stdout.write(`\r  Phase 0: ${checked}/${toCheck.length} | inactive: ${inactiveIds.length} | not found: ${notFound}    \n`);
  log(`Phase 0: ${checked} checked, ${inactiveIds.length} inactive, ${notFound} not in SQLite, ${skipped} skipped (no feedId).`);

  // ── Step 3: Batch-delete stale podcasts from Firestore ────────────────────
  if (inactiveIds.length === 0) {
    log('Phase 0: No stale podcasts found.', 'SUCCESS');
    return { checked, deleted: 0, notFound, skipped };
  }

  if (DRY_RUN) {
    log(`[DRY-RUN] Would delete ${inactiveIds.length} stale podcasts from Firestore.`, 'WARN');
    return { checked, deleted: inactiveIds.length, notFound, skipped };
  }

  log(`Phase 0: Deleting ${inactiveIds.length} stale podcasts from Firestore...`);
  const BATCH_SIZE = 400;
  let deleted      = 0;

  for (let i = 0; i < inactiveIds.length; i += BATCH_SIZE) {
    const chunk = inactiveIds.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection('podcasts').doc(id));
    }
    await batch.commit();
    deleted += chunk.length;
    process.stdout.write(`\r  Deleted ${deleted}/${inactiveIds.length}...`);
  }
  process.stdout.write('\n');
  log(`Phase 0 complete: ${inactiveIds.length} stale podcasts deleted.`, 'SUCCESS');

  return { checked, deleted: inactiveIds.length, notFound, skipped };
}

// ============================================================================
// PHASE 1 — QUERY FROM SQLITE
// ============================================================================

/**
 * Queries the local SQLite snapshot for podcast candidates matching all
 * Phase 1 criteria in a single query:
 *   - language starts with 'en'
 *   - newestItemPubdate within the last 60 days
 *   - episodeCount >= MIN_EPISODES (50)
 *   - itunesId is present (non-null, non-empty, non-zero)
 *
 * Then deduplicates against all existing Firestore IDs.
 * Returns { feeds, rawCount } where feeds are normalized to the shape
 * expected by Phase 3 (guest filter) and Phase 4 (Gemini scoring).
 */
async function queryNewPodcastsFromSQLite() {
  log('Phase 1: Querying SQLite for new podcast candidates...', 'PHASE');

  const cutoffTs = Math.floor(Date.now() / 1000) - 60 * 86400;
  const sqlite   = new Database(DB_PATH, { readonly: true });

  const rows = sqlite.prepare(`
    SELECT id, url, title, lastUpdate, link, itunesId,
           itunesAuthor, itunesOwnerName, imageUrl,
           newestItemPubdate, language, episodeCount,
           description,
           category1, category2, category3, category4, category5,
           category6, category7, category8, category9, category10
    FROM podcasts
    WHERE language LIKE 'en%'
      AND newestItemPubdate > ?
      AND episodeCount >= ?
      AND itunesId IS NOT NULL
      AND CAST(itunesId AS TEXT) != ''
      AND CAST(itunesId AS TEXT) != '0'
  `).all(cutoffTs, MIN_EPISODES);

  sqlite.close();
  log(`Phase 1: ${rows.length.toLocaleString()} podcasts passed SQLite filters (English, active 60d, ≥${MIN_EPISODES} eps, has itunesId).`);

  // Load existing Firestore IDs for dedup
  const existingIds = await getExistingFirestoreIds();

  // Normalize rows → feed-like objects, skipping those already in Firestore
  const feeds = [];
  for (const row of rows) {
    const itunesId = String(row.itunesId);
    if (existingIds.has(itunesId)) continue;

    // Build categories map from the 10 individual category columns
    const categories = {};
    for (let i = 1; i <= 10; i++) {
      if (row[`category${i}`]) categories[String(i)] = row[`category${i}`];
    }

    feeds.push({
      id               : row.id,
      itunesId         : itunesId,
      url              : row.url              || '',
      title            : row.title            || '',
      description      : row.description      || '',
      language         : row.language         || '',
      artwork          : row.imageUrl         || '',
      link             : row.link             || '',
      episodeCount     : row.episodeCount      || 0,
      newestItemPubdate: row.newestItemPubdate || null,
      lastUpdateTime   : row.lastUpdate        || null,
      ownerName        : row.itunesOwnerName   || '',
      ownerEmail       : '',
      author           : row.itunesAuthor      || '',
      categories,
    });
  }

  const newCount = feeds.length;
  log(`Phase 1: ${newCount.toLocaleString()} new podcasts after dedup (${(rows.length - newCount).toLocaleString()} already in Firestore).`, 'SUCCESS');
  return { feeds, rawCount: rows.length };
}

// ============================================================================
// UTILITIES
// ============================================================================

async function getExistingFirestoreIds() {
  log('Loading existing Firestore IDs for deduplication...');
  const set = new Set();
  let last  = null;
  while (true) {
    let q = db.collection('podcasts')
      .select()            // fetch document IDs only (no field data)
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(5000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach(d => set.add(d.id));
    last = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Loaded ${set.size} existing IDs...`);
    if (snap.docs.length < 5000) break;
  }
  process.stdout.write('\n');
  log(`Deduplication set: ${set.size} existing podcasts.`);
  return set;
}

// ============================================================================
// PHASE 3 — GUEST-FRIENDLY PRE-FILTER
// ============================================================================

function countGuestSignals(episodeTitles) {
  let count = 0;
  for (const title of episodeTitles) {
    const lower = (title || '').toLowerCase();
    if (GUEST_KEYWORDS.some(kw => lower.includes(kw))) count++;
  }
  return count;
}

async function applyGuestFilter(feeds, concurrency = 3) {
  log(`Checking guest-friendliness for ${feeds.length} podcasts (${concurrency} workers @ 2 req/s)...`, 'PHASE');

  const client  = new PodcastIndexClient({ ratePerSec: 2 }); // shared bucket
  const passed  = [];
  let checked   = 0;
  let guestPass = 0;
  const queue   = [...feeds];

  const workers = Array(concurrency).fill(null).map(async () => {
    while (true) {
      const feed = queue.shift();
      if (!feed) break;

      try {
        const episodes   = await client.getEpisodesByFeedId(feed.id || feed.feedId, 10);
        const titles     = episodes.map(e => e.title);
        const signals    = countGuestSignals(titles);

        feed._episodeTitles = titles;    // carry forward for Gemini prompt
        feed._guestSignals  = signals;

        if (signals >= MIN_GUEST_SIGNALS) {
          guestPass++;
          passed.push(feed);
        }
      } catch (err) {
        log(`\n  Episode fetch failed for feed ${feed.id}: ${err.message}`, 'WARN');
      }

      checked++;
      process.stdout.write(`\r  Checked ${checked}/${feeds.length} | passed: ${guestPass}...`);
    }
  });

  await Promise.all(workers);
  process.stdout.write('\n');
  log(`Guest filter: ${guestPass}/${feeds.length} passed (≥${MIN_GUEST_SIGNALS}/10 episode titles match keywords)`, 'SUCCESS');
  return passed;
}

// ============================================================================
// PHASE 4 — GEMINI SCORING
// ============================================================================

function normalizeFeedForScoring(feed) {
  return {
    itunesId           : String(feed.itunesId || feed.id || ''),
    title              : feed.title        || '',
    description        : feed.description  || '',
    genres             : Object.values(feed.categories || {}),
    episodeCount       : feed.episodeCount || 0,
    recentEpisodeTitles: feed._episodeTitles || [],
    // Fields used by engagement/audience/power score (may be empty for new podcasts)
    apple_rating       : null,
    apple_rating_count : null,
    yt_subscribers     : null,
    newestItemPubdate  : feed.newestItemPubdate || null,
    lastUpdate         : feed.newestItemPubdate || feed.lastUpdateTime || null,
  };
}

async function scoreAllPodcasts(feeds) {
  log(`Scoring ${feeds.length} podcasts with Gemini (${GEMINI_CONCURRENCY} workers)...`, 'PHASE');

  const scored     = [];
  const queue      = feeds.map(normalizeFeedForScoring);
  let   processed  = 0;
  let   failed     = 0;

  const checkpoint = loadCheckpoint();
  const doneIds    = new Set(checkpoint?.scoredIds || []);
  const toProcess  = queue.filter(p => !doneIds.has(p.itunesId));

  if (doneIds.size > 0) {
    log(`Resuming from checkpoint: ${doneIds.size} already scored, ${toProcess.length} remaining.`);
  }

  const workers = Array(GEMINI_CONCURRENCY).fill(null).map(async () => {
    while (true) {
      const podcast = toProcess.shift();
      if (!podcast) break;

      const result = await categorizeSinglePodcast(podcast, 3);

      if (result.success) {
        const aiCat     = result.data;
        const engagement = calculateEngagementLevel(podcast);
        const audSize    = calculateAudienceSize(podcast);

        scored.push({
          itunesId                : podcast.itunesId,
          title                   : podcast.title,
          ai_primary_category     : aiCat.niche               || '',
          ai_secondary_categories : aiCat.secondary_categories || [],
          ai_topics               : aiCat.topics               || [],
          ai_target_audience      : aiCat.target_audience      || '',
          ai_podcast_style        : aiCat.podcast_style        || '',
          ai_business_relevance   : aiCat.business_relevance   || 5,
          ai_guest_friendly       : aiCat.guest_friendly       || false,
          ai_summary              : aiCat.summary              || '',
          ai_engagement_level     : engagement,
          ai_audience_size        : audSize,
          ai_content_quality      : calculateContentQuality(podcast),
          ai_monetization_potential: calculateMonetizationPotential(podcast, engagement, audSize),
          _original               : podcast,
          _feed                   : feeds.find(f => String(f.itunesId || f.id) === podcast.itunesId),
        });
      } else {
        failed++;
        log(`\n  Gemini failed for "${podcast.title}": ${result.error}`, 'WARN');
      }

      processed++;
      process.stdout.write(`\r  Scored ${processed}/${toProcess.length + processed} | failed: ${failed}...`);

      // Checkpoint every 50
      if (processed % 50 === 0) {
        saveCheckpoint({ phase: 'scoring', scoredIds: scored.map(p => p.itunesId) });
      }
    }
  });

  await Promise.all(workers);
  process.stdout.write('\n');
  log(`Gemini scoring: ${scored.length} succeeded, ${failed} failed.`, 'SUCCESS');

  // Percentiles + Badassery scores
  calculatePercentiles(scored);
  applyBadasseryScores(scored);

  return scored;
}

// ============================================================================
// PHASE 5 — FIRESTORE WRITE
// ============================================================================

async function writeToFirestore(scoredPodcasts) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would write ${scoredPodcasts.length} podcasts to Firestore.`, 'WARN');
    return;
  }

  log(`Writing ${scoredPodcasts.length} podcasts to Firestore...`, 'PHASE');

  const BATCH_SIZE = 400;
  let   written    = 0;

  for (let i = 0; i < scoredPodcasts.length; i += BATCH_SIZE) {
    const chunk = scoredPodcasts.slice(i, i + BATCH_SIZE);
    const batch = db.batch();

    for (const p of chunk) {
      const feed = p._feed || {};
      const ref  = db.collection('podcasts').doc(p.itunesId);

      batch.set(ref, {
        // Core fields from PodcastIndex
        itunesId       : p.itunesId,
        title          : p.title,
        description    : feed.description  || '',
        language       : feed.language     || '',
        imageUrl       : feed.artwork      || feed.image || '',
        url            : feed.url          || '',
        link           : feed.link         || '',
        episodeCount   : feed.episodeCount || 0,
        lastUpdate     : feed.newestItemPubdate || feed.lastUpdateTime || null,
        rss_owner_email: feed.ownerEmail   || '',
        rss_owner_name : feed.ownerName    || '',
        rss_author     : feed.author       || '',
        // Episode titles (carried from guest filter)
        recentEpisodeTitles: p._original?.recentEpisodeTitles || [],
        // AI scoring
        ai_primary_category     : p.ai_primary_category,
        ai_secondary_categories : p.ai_secondary_categories,
        ai_topics               : p.ai_topics,
        ai_target_audience      : p.ai_target_audience,
        ai_podcast_style        : p.ai_podcast_style,
        ai_business_relevance   : p.ai_business_relevance,
        ai_guest_friendly       : p.ai_guest_friendly,
        ai_summary              : p.ai_summary,
        ai_engagement_level     : p.ai_engagement_level,
        ai_audience_size        : p.ai_audience_size,
        ai_content_quality      : p.ai_content_quality,
        ai_monetization_potential: p.ai_monetization_potential,
        ai_badassery_score      : p.ai_badassery_score,
        ai_category_percentile  : p.ai_category_percentile,
        ai_category_rank        : p.ai_category_rank,
        ai_category_total       : p.ai_category_total,
        ai_percentile_used_global: p.ai_percentile_used_global,
        ai_global_percentile    : p.ai_global_percentile,
        ai_global_rank          : p.ai_global_rank,
        ai_global_total         : p.ai_global_total,
        aiCategorizationStatus  : 'completed',
        aiCategorizedAt         : admin.firestore.Timestamp.now(),
        uploadedAt              : admin.firestore.Timestamp.now(),
        uploadedFrom            : 'weekly_pipeline',
        updatedAt               : admin.firestore.Timestamp.now(),
      }, { merge: false });
    }

    await batch.commit();
    written += chunk.length;
    process.stdout.write(`\r  Written ${written}/${scoredPodcasts.length}...`);
  }

  process.stdout.write('\n');
  log(`Firestore write complete: ${written} podcasts.`, 'SUCCESS');
}

// ============================================================================
// PHASE 0b — APPLE CHARTS
// ============================================================================

/**
 * Scrape Apple Podcast Charts (US Top 200, 19 genres) and write chart rank
 * fields back to every matched Firestore document.
 *
 * Fields written: apple_chart_rank, apple_chart_genre, apple_chart_genres,
 *                 apple_chart_scrapedAt
 *
 * Skipped entirely when --skip-charts is passed or DRY_RUN is active.
 */
async function runAppleChartsUpdate() {
  if (SKIP_CHARTS) {
    log('Phase 0b: Apple Charts skipped (--skip-charts).', 'WARN');
    return { totalInCharts: 0, matched: 0, updated: 0 };
  }

  log('Phase 0b: Scraping Apple Podcast Charts (US, 19 genres)...', 'PHASE');

  const chartIndex    = await scrapeAllAppleCharts();
  const chartIds      = Object.keys(chartIndex);
  const totalInCharts = chartIds.length;

  // Save raw cache
  const CACHE_PATH = require('path').join(__dirname, '../data/apple_charts_cache.json');
  require('fs').writeFileSync(
    CACHE_PATH,
    JSON.stringify({ scrapedAt: new Date().toISOString(), charts: chartIndex }, null, 2),
    'utf8'
  );
  log(`Cache written → data/apple_charts_cache.json`);

  // Resolve which charted IDs exist in Firestore (batch `in` queries, max 30 each)
  log(`Resolving ${totalInCharts} chart IDs against Firestore...`);
  const matched = [];
  const IN_CHUNK = 30;
  for (let i = 0; i < chartIds.length; i += IN_CHUNK) {
    const chunk = chartIds.slice(i, i + IN_CHUNK);
    const snap  = await db.collection('podcasts')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .select()
      .get();
    snap.docs.forEach(d => matched.push(d.id));
    process.stdout.write(`\r  Resolved ${Math.min(i + IN_CHUNK, chartIds.length)} / ${totalInCharts}...`);
  }
  process.stdout.write('\n');
  log(`${matched.length} of ${totalInCharts} charted podcasts found in Firestore.`, 'SUCCESS');

  if (matched.length === 0) return { totalInCharts, matched: 0, updated: 0 };

  if (DRY_RUN) {
    log(`[DRY-RUN] Would update ${matched.length} Firestore documents with chart data.`, 'WARN');
    return { totalInCharts, matched: matched.length, updated: 0 };
  }

  // Batch-update matched documents
  log(`Updating ${matched.length} Firestore documents with chart data...`);
  const now     = admin.firestore.Timestamp.now();
  const BATCH_SIZE = 400;
  let   updated = 0;

  for (let i = 0; i < matched.length; i += BATCH_SIZE) {
    const chunk = matched.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of chunk) {
      const entry = chartIndex[id];
      batch.update(db.collection('podcasts').doc(id), {
        apple_chart_rank      : entry.bestRank,
        apple_chart_genre     : entry.bestGenre,
        apple_chart_genres    : entry.genres,
        apple_chart_scrapedAt : now,
      });
    }
    await batch.commit();
    updated += chunk.length;
    process.stdout.write(`\r  Updated ${updated} / ${matched.length}...`);
  }
  process.stdout.write('\n');
  log(`Phase 0b complete: ${updated} documents updated with chart data.`, 'SUCCESS');

  return { totalInCharts, matched: matched.length, updated };
}

// ============================================================================
// PHASE 0c — SPOTIFY CHARTS
// ============================================================================

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scrape Spotify Podcast Charts (US, all categories) and write chart rank
 * fields back to every matched Firestore document.
 *
 * Match strategy: by normalized podcast title (Spotify IDs not stored in Firestore).
 *
 * Fields written: spotify_chart_rank, spotify_chart_genre, spotify_chart_genres,
 *                 spotify_chart_scrapedAt
 *
 * Skipped when --skip-spotify-charts is passed or DRY_RUN is active.
 */
async function runSpotifyChartsUpdate() {
  if (SKIP_SPOTIFY_CHARTS) {
    log('Phase 0c: Spotify Charts skipped (--skip-spotify-charts).', 'WARN');
    return { totalInCharts: 0, matched: 0, updated: 0 };
  }

  log('Phase 0c: Scraping Spotify Podcast Charts (US, all categories)...', 'PHASE');

  const chartIndex    = await scrapeAllSpotifyCharts();
  const chartEntries  = Object.entries(chartIndex);
  const totalInCharts = chartEntries.length;

  // Save raw cache
  const CACHE_PATH = path.join(__dirname, '../data/spotify_charts_cache.json');
  fs.writeFileSync(
    CACHE_PATH,
    JSON.stringify({ scrapedAt: new Date().toISOString(), charts: chartIndex }, null, 2),
    'utf8'
  );
  log(`Cache written → data/spotify_charts_cache.json`);

  // Build title → itunesId map from Firestore
  log(`Building title map from Firestore to resolve ${totalInCharts} chart entries...`);
  const titleMap = new Map();
  let   lastDoc  = null;
  let   loaded   = 0;

  while (true) {
    let q = db.collection('podcasts')
      .select('title')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1000);
    if (lastDoc) q = q.startAfter(lastDoc);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach(d => {
      const t = d.data().title;
      if (t) titleMap.set(normalizeTitle(t), d.id);
    });
    lastDoc = snap.docs[snap.docs.length - 1];
    loaded += snap.docs.length;
    process.stdout.write(`\r  Loaded ${loaded} podcast titles...`);
    if (snap.docs.length < 1000) break;
  }
  process.stdout.write('\n');

  // Match chart entries against title map
  const matches = [];
  for (const [, entry] of chartEntries) {
    if (!entry.title) continue;
    const itunesId = titleMap.get(normalizeTitle(entry.title));
    if (itunesId) matches.push({ itunesId, entry });
  }
  log(`${matches.length} of ${totalInCharts} charted podcasts matched in Firestore by title.`, 'SUCCESS');

  if (matches.length === 0) return { totalInCharts, matched: 0, updated: 0 };

  if (DRY_RUN) {
    log(`[DRY-RUN] Would update ${matches.length} Firestore documents with Spotify chart data.`, 'WARN');
    return { totalInCharts, matched: matches.length, updated: 0 };
  }

  // Batch-update matched documents
  log(`Updating ${matches.length} Firestore documents with Spotify chart data...`);
  const now      = admin.firestore.Timestamp.now();
  const BSIZE    = 400;
  let   updated  = 0;

  for (let i = 0; i < matches.length; i += BSIZE) {
    const chunk = matches.slice(i, i + BSIZE);
    const batch = db.batch();
    for (const { itunesId, entry } of chunk) {
      batch.update(db.collection('podcasts').doc(itunesId), {
        spotify_chart_rank      : entry.bestRank,
        spotify_chart_genre     : entry.bestGenre,
        spotify_chart_genres    : entry.genres,
        spotify_chart_scrapedAt : now,
      });
    }
    await batch.commit();
    updated += chunk.length;
    process.stdout.write(`\r  Updated ${updated} / ${matches.length}...`);
  }
  process.stdout.write('\n');
  log(`Phase 0c complete: ${updated} documents updated with Spotify chart data.`, 'SUCCESS');

  return { totalInCharts, matched: matches.length, updated };
}

// ============================================================================
// PHASE 0d — SPOTIFY RATING ENRICHMENT
// ============================================================================

/**
 * For each podcast that has a website_spotify URL but no spotify_rating yet,
 * scrape the Spotify show page and write spotify_rating + spotify_review_count.
 *
 * Capped to SPOTIFY_RATING_BATCH per run (default 50) to keep runtime reasonable.
 * Each page load takes ~10–15 seconds; 50 podcasts ≈ 10–12 minutes.
 *
 * Skipped when --skip-spotify-rating is passed or DRY_RUN is active.
 */
async function runSpotifyRatingUpdate() {
  if (SKIP_SPOTIFY_RATING) {
    log('Phase 0d: Spotify Rating enrichment skipped (--skip-spotify-rating).', 'WARN');
    return { processed: 0, enriched: 0, failed: 0 };
  }

  log(`Phase 0d: Fetching podcasts with website_spotify but missing spotify_rating (batch: ${SPOTIFY_RATING_BATCH})...`, 'PHASE');

  // Podcasts that have a Spotify URL but haven't been rated yet
  const snap = await db.collection('podcasts')
    .where('website_spotify', '!=', null)
    .where('spotify_rating', '==', null)
    .limit(SPOTIFY_RATING_BATCH)
    .get();

  if (snap.empty) {
    log('Phase 0d: No podcasts need Spotify rating enrichment.', 'SUCCESS');
    return { processed: 0, enriched: 0, failed: 0 };
  }

  const toEnrich = snap.docs.map(d => ({
    itunesId       : d.id,
    spotifyUrl     : d.data().website_spotify,
    title          : d.data().title,
  })).filter(p => p.spotifyUrl && p.spotifyUrl.includes('open.spotify.com/show/'));

  log(`Phase 0d: Enriching ${toEnrich.length} podcasts with Spotify ratings...`);

  if (DRY_RUN) {
    log(`[DRY-RUN] Would enrich ${toEnrich.length} podcasts with Spotify ratings.`, 'WARN');
    return { processed: toEnrich.length, enriched: 0, failed: 0 };
  }

  let enriched = 0;
  let failed   = 0;

  // Process sequentially — Puppeteer headed mode, one browser window at a time
  for (let i = 0; i < toEnrich.length; i++) {
    const p = toEnrich[i];
    process.stdout.write(`\r  [${i + 1}/${toEnrich.length}] ${p.title?.slice(0, 50)}...`);

    const result = await scrapeSpotifyRating(p.spotifyUrl);

    if (result) {
      try {
        await db.collection('podcasts').doc(p.itunesId).update({
          spotify_rating       : result.rating,
          spotify_review_count : result.reviewCount,
        });
        enriched++;
      } catch (err) {
        log(`\n  Firestore update failed for ${p.itunesId}: ${err.message}`, 'WARN');
        failed++;
      }
    } else {
      failed++;
    }
  }

  process.stdout.write('\n');
  log(`Phase 0d complete: ${enriched} enriched, ${failed} failed.`, 'SUCCESS');
  return { processed: toEnrich.length, enriched, failed };
}

// ============================================================================
// PHASE 5b — REGENERATE + DEPLOY
// ============================================================================

async function regenerateAndDeploy() {
  if (SKIP_DEPLOY) {
    log('[DRY-RUN / --skip-deploy] Skipping export + deploy.', 'WARN');
    return;
  }

  log('Regenerating podcasts-lite.json...', 'PHASE');
  execSync(`node ${path.join(__dirname, 'export_podcasts_lite.js')}`, { stdio: 'inherit' });

  log('Deploying to Firebase Hosting...', 'PHASE');
  const webappDir = path.join(__dirname, '../webapp/badassery');
  execSync('npm run build', { cwd: webappDir, stdio: 'inherit' });
  execSync('firebase deploy --only hosting', { cwd: webappDir, stdio: 'inherit' });

  log('Deploy complete.', 'SUCCESS');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(72));
  console.log('  🚀  BADASSERY PR — WEEKLY PIPELINE');
  console.log('='.repeat(72));
  console.log(`  Min eps  : ${MIN_EPISODES}`);
  console.log(`  Guest kw : ≥${MIN_GUEST_SIGNALS}/10 episode titles`);
  console.log(`  Gemini   : ${GEMINI_CONCURRENCY} workers @ ${GEMINI_RATE} req/s`);
  if (DRY_RUN)          console.log('  ⚠️  DRY-RUN MODE — no writes, no deploy');
  if (SKIP_DEPLOY)      console.log('  ⚠️  SKIP-DEPLOY — writes Firestore, skips export/deploy');
  if (SKIP_HEALTH_CHECK) console.log('  ⚠️  SKIP-HEALTH-CHECK — Phase 0 skipped');
  if (HEALTH_CHECK_LIMIT > 0) console.log(`  ℹ️  Health check limit: ${HEALTH_CHECK_LIMIT} podcasts`);
  if (SKIP_CHARTS)          console.log('  ⚠️  SKIP-CHARTS — Phase 0b skipped');
  if (SKIP_SPOTIFY_CHARTS)  console.log('  ⚠️  SKIP-SPOTIFY-CHARTS — Phase 0c skipped');
  if (SKIP_SPOTIFY_RATING)  console.log('  ⚠️  SKIP-SPOTIFY-RATING — Phase 0d skipped');
  if (!SKIP_SPOTIFY_RATING) console.log(`  ℹ️  Spotify rating batch: ${SPOTIFY_RATING_BATCH} podcasts/run`);
  console.log('='.repeat(72));
  console.log('');

  // Init Gemini key pool
  initKeyPool({ ratePerSecond: GEMINI_RATE });

  try {
    // ── Ensure SQLite DB is present and fresh (downloads if >7 days old) ────
    await ensureDatabase();

    // ── Phase 0: Database health check ──────────────────────────────────────
    const healthResult = await runDatabaseHealthCheck();

    // ── Phase 0b: Apple Charts ───────────────────────────────────────────────
    const chartsResult = await runAppleChartsUpdate();

    // ── Phase 0c: Spotify Charts ─────────────────────────────────────────────
    const spotifyChartsResult = await runSpotifyChartsUpdate();

    // ── Phase 0d: Spotify Rating enrichment ──────────────────────────────────
    const spotifyRatingResult = await runSpotifyRatingUpdate();

    const checkpoint = loadCheckpoint();

    let sqliteRaw     = 0;
    let sqliteFeeds   = [];
    let guestFiltered = [];

    // ── Resume from checkpoint (Gemini interrupted mid-scoring) ─────────────
    if (checkpoint?.phase === 'guest_filter' && checkpoint.guestFeeds?.length > 0) {
      log(`Checkpoint found: skipping Phases 1–3, resuming Gemini scoring of ${checkpoint.guestFeeds.length} feeds.`);
      guestFiltered = checkpoint.guestFeeds;
      sqliteRaw     = checkpoint.rawCount || 0;
      sqliteFeeds   = { length: checkpoint.newCount || 0 };
    } else {
      // ── Phase 1: SQLite query + dedup ──────────────────────────────────────
      const phase1  = await queryNewPodcastsFromSQLite();
      sqliteFeeds   = phase1.feeds;
      sqliteRaw     = phase1.rawCount;
      saveCheckpoint({ phase: 'sqlite_query', rawCount: sqliteRaw, newCount: sqliteFeeds.length });

      if (sqliteFeeds.length === 0) {
        log('No new podcasts found in SQLite. Pipeline complete.', 'SUCCESS');
        clearCheckpoint();
        printSummary({ sqliteRaw, newCount: 0, guestFiltered: [], scored: [], healthResult, chartsResult, spotifyChartsResult, spotifyRatingResult, startTime });
        process.exit(0);
      }

      // ── Phase 3: Guest filter ───────────────────────────────────────────────
      guestFiltered = await applyGuestFilter(sqliteFeeds);

      if (guestFiltered.length === 0) {
        log('No podcasts passed guest-friendly filter. Pipeline complete.', 'SUCCESS');
        clearCheckpoint();
        printSummary({ sqliteRaw, newCount: sqliteFeeds.length, guestFiltered, scored: [], healthResult, chartsResult, spotifyChartsResult, spotifyRatingResult, startTime });
        process.exit(0);
      }

      // Save full feed list so a Phase 4 crash can resume without re-running Phase 1–3
      saveCheckpoint({
        phase    : 'guest_filter',
        rawCount : sqliteRaw,
        newCount : sqliteFeeds.length,
        guestFeeds: guestFiltered,
      });
    }

    // ── Phase 4: Gemini scoring ───────────────────────────────────────────
    const scored = await scoreAllPodcasts(guestFiltered);

    // ── Phase 5a: Firestore write ─────────────────────────────────────────
    await writeToFirestore(scored);

    // ── Phase 5b: Export + deploy ─────────────────────────────────────────
    await regenerateAndDeploy();

    clearCheckpoint();
    printSummary({ sqliteRaw, newCount: sqliteFeeds.length, guestFiltered, scored, healthResult, chartsResult, spotifyChartsResult, spotifyRatingResult, startTime });
    process.exit(0);

  } catch (err) {
    log(`Fatal error: ${err.message}`, 'ERROR');
    console.error(err.stack);
    process.exit(1);
  }
}

function printSummary({ sqliteRaw, newCount, guestFiltered, scored, healthResult, chartsResult, spotifyChartsResult, spotifyRatingResult, startTime }) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const hr  = healthResult       || {};
  const cr  = chartsResult       || {};
  const scr = spotifyChartsResult || {};
  const srr = spotifyRatingResult || {};
  console.log('');
  console.log('='.repeat(72));
  console.log('  📊  PIPELINE SUMMARY');
  console.log('='.repeat(72));
  if (!SKIP_HEALTH_CHECK) {
    console.log(`  Phase 0   Health check (checked)     : ${hr.checked ?? '—'}`);
    console.log(`  Phase 0   Deleted (stale > 60d)      : ${hr.deleted ?? '—'}`);
    console.log(`  Phase 0   Not in SQLite              : ${hr.notFound ?? '—'}`);
    console.log(`  Phase 0   Skipped (no feedId)        : ${hr.skipped ?? '—'}`);
  }
  if (!SKIP_CHARTS) {
    console.log(`  Phase 0b  Apple Charts (unique IDs)  : ${cr.totalInCharts ?? '—'}`);
    console.log(`  Phase 0b  Matched in Firestore       : ${cr.matched ?? '—'}`);
    console.log(`  Phase 0b  Firestore docs updated     : ${DRY_RUN ? '0 (dry-run)' : (cr.updated ?? '—')}`);
  }
  if (!SKIP_SPOTIFY_CHARTS) {
    console.log(`  Phase 0c  Spotify Charts (unique)    : ${scr.totalInCharts ?? '—'}`);
    console.log(`  Phase 0c  Matched in Firestore       : ${scr.matched ?? '—'}`);
    console.log(`  Phase 0c  Firestore docs updated     : ${DRY_RUN ? '0 (dry-run)' : (scr.updated ?? '—')}`);
  }
  if (!SKIP_SPOTIFY_RATING) {
    console.log(`  Phase 0d  Spotify Rating (processed) : ${srr.processed ?? '—'}`);
    console.log(`  Phase 0d  Spotify Rating (enriched)  : ${DRY_RUN ? '0 (dry-run)' : (srr.enriched ?? '—')}`);
    console.log(`  Phase 0d  Spotify Rating (failed)    : ${srr.failed ?? '—'}`);
  }
  console.log(`  Phase 1   SQLite filter (passed)     : ${(sqliteRaw || 0).toLocaleString()}`);
  console.log(`  Phase 1   New after dedup            : ${(newCount  || 0).toLocaleString()}`);
  console.log(`  Phase 3   Passed guest filter        : ${guestFiltered.length}`);
  console.log(`  Phase 4   Scored by Gemini           : ${scored.length}`);
  console.log(`  Phase 5   Written to Firestore       : ${DRY_RUN ? 0 : scored.length}`);
  console.log(`  Total time : ${elapsed}s`);
  if (DRY_RUN) console.log('  ⚠️  DRY-RUN — nothing was written.');
  console.log('='.repeat(72));
}

main();
