/**
 * Export all Firestore podcasts to a lite JSON for static hosting
 *
 * Reads all podcasts in batches of 500, keeps only the fields needed
 * for list/filter views, and writes to webapp/badassery/public/podcasts-lite.json
 *
 * Usage: node scripts/export_podcasts_lite.js
 *
 * The file is served by Firebase Hosting (~9MB gzipped) and cached by
 * the browser via IndexedDB (24h TTL), eliminating per-visit Firestore reads.
 */

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const CHARTS_CACHE_PATH          = path.join(__dirname, '../data/apple_charts_cache.json');
const CHARTS_OUTPUT_PATH         = path.join(__dirname, '../webapp/badassery/public/apple_charts.json');
const SPOTIFY_CHARTS_CACHE_PATH  = path.join(__dirname, '../data/spotify_charts_cache.json');
const SPOTIFY_CHARTS_OUTPUT_PATH = path.join(__dirname, '../webapp/badassery/public/spotify_charts.json');

// Initialize Firebase Admin
const serviceAccount = require('../serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Fields to keep in the lite export (sufficient for list views and all filters)
const LITE_FIELDS = [
  'id',       // PodcastIndex feed ID (old enriched docs)
  'title',
  'imageUrl',
  'language',
  'episodeCount',
  'ai_primary_category',
  'ai_secondary_categories',
  'ai_badassery_score',
  'ai_engagement_level',
  'ai_guest_friendly',
  'ai_business_relevance',
  'ai_content_quality',
  'ai_audience_size',
  'ai_category_percentile',
  'ai_global_percentile',
  'ai_topics',
  'description',
  'apple_rating',
  'apple_rating_count',
  'spotify_rating',
  'spotify_review_count',
  'spotify_chart_rank',
  'spotify_chart_genre',
  'yt_subscribers',
  'yt_channel_id',
  'yt_channel_name',
  'website',
  'rss_website',
  'apple_api_url',
  'rss_owner_email',
  'website_email',
  'website_instagram',
  'website_twitter',
  'website_facebook',
  'website_linkedin',
  'website_tiktok',
  'updatedAt',
];

const BATCH_SIZE = 500;
const OUTPUT_PATH = path.join(__dirname, '../webapp/badassery/public/podcasts-lite.json');

function loadChartsCache() {
  if (!fs.existsSync(CHARTS_CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(CHARTS_CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function loadSpotifyChartsCache() {
  if (!fs.existsSync(SPOTIFY_CHARTS_CACHE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(SPOTIFY_CHARTS_CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function exportPodcastsLite() {
  console.log('[Export] Starting Firestore → podcasts-lite.json export...');

  const podcasts = [];
  let lastDoc = null;
  let batchNum = 0;

  while (true) {
    let q = db.collection('podcasts')
      .where('ai_guest_friendly', '==', true)
      .limit(BATCH_SIZE);
    if (lastDoc) {
      q = q.startAfter(lastDoc);
    }

    const snapshot = await q.get();
    if (snapshot.empty) break;

    snapshot.docs.forEach(doc => {
      const data = doc.data();

      // Skip inactive podcasts (marked by Phase 0 health check)
      if (data.active === false) return;

      // Skip docs without a badassery score
      if (!data.ai_badassery_score || data.ai_badassery_score <= 0) return;

      const lite = { itunesId: doc.id };

      for (const field of LITE_FIELDS) {
        if (data[field] !== undefined) {
          // Convert Firestore Timestamps to ISO strings
          if (data[field] && typeof data[field].toDate === 'function') {
            lite[field] = data[field].toDate().toISOString();
          } else {
            lite[field] = data[field];
          }
        }
      }

      // Normalize: phase3-imported docs store the PI feed ID as 'feedId',
      // older enriched docs use 'id'. Unify to 'id' so fetchEpisodes works for both.
      if (!lite.id && data.feedId) lite.id = data.feedId;

      podcasts.push(lite);
    });

    lastDoc = snapshot.docs[snapshot.docs.length - 1];
    batchNum++;

    process.stdout.write(`\r[Export] Fetched ${podcasts.length} podcasts (batch ${batchNum})...`);

    if (snapshot.docs.length < BATCH_SIZE) break;
  }

  console.log(`\n[Export] Total podcasts fetched: ${podcasts.length}`);

  // ── Inject Apple Charts data from local cache ──────────────────────────────
  const chartsCache = loadChartsCache();
  if (chartsCache?.charts) {
    const chartMap = chartsCache.charts; // { itunesId: { bestRank, bestGenre, ... } }
    let chartsMatched = 0;
    for (const podcast of podcasts) {
      const entry = chartMap[podcast.itunesId];
      if (entry) {
        podcast.apple_chart_rank   = entry.bestRank;
        podcast.apple_chart_genre  = entry.bestGenre;
        podcast.apple_chart_genres = entry.genres;
        chartsMatched++;
      }
    }
    console.log(`[Export] Apple Charts: ${chartsMatched} podcasts annotated with chart rank.`);
  } else {
    console.log('[Export] Apple Charts: no cache found at data/apple_charts_cache.json — skipping chart annotation.');
  }

  // ── Inject Spotify Charts data from local cache ────────────────────────────
  const spotifyChartsCache = loadSpotifyChartsCache();
  if (spotifyChartsCache?.charts) {
    // Spotify chart keys are spotifyId; match to podcasts by normalized title
    const titleToIdx = new Map();
    podcasts.forEach((p, i) => {
      if (p.title) titleToIdx.set(normalizeTitle(p.title), i);
    });

    let spotifyChartsMatched = 0;
    for (const entry of Object.values(spotifyChartsCache.charts)) {
      if (!entry.title) continue;
      const idx = titleToIdx.get(normalizeTitle(entry.title));
      if (idx !== undefined) {
        podcasts[idx].spotify_chart_rank  = entry.bestRank;
        podcasts[idx].spotify_chart_genre = entry.bestGenre;
        spotifyChartsMatched++;
      }
    }
    console.log(`[Export] Spotify Charts: ${spotifyChartsMatched} podcasts annotated with chart rank.`);
  } else {
    console.log('[Export] Spotify Charts: no cache found at data/spotify_charts_cache.json — skipping chart annotation.');
  }

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write podcasts-lite.json
  const json = JSON.stringify(podcasts);
  fs.writeFileSync(OUTPUT_PATH, json, 'utf8');

  const sizeBytes = Buffer.byteLength(json, 'utf8');
  const sizeMB    = (sizeBytes / 1024 / 1024).toFixed(1);
  console.log(`[Export] Written to: ${OUTPUT_PATH}`);
  console.log(`[Export] File size: ${sizeMB} MB uncompressed (expect ~${(sizeBytes / 1024 / 1024 / 7).toFixed(1)} MB gzipped)`);

  // ── Write apple_charts.json (annotated with inDb flag) ────────────────────
  if (chartsCache?.charts) {
    const dbSet   = new Set(podcasts.map(p => p.itunesId));
    const charts  = chartsCache.charts;
    const annotated = {};
    for (const [id, entry] of Object.entries(charts)) {
      annotated[id] = { ...entry, inDb: dbSet.has(id) };
    }
    const chartsJson = JSON.stringify({ scrapedAt: chartsCache.scrapedAt, charts: annotated });
    fs.writeFileSync(CHARTS_OUTPUT_PATH, chartsJson, 'utf8');
    const chartsSizeMB = (Buffer.byteLength(chartsJson) / 1024 / 1024).toFixed(1);
    console.log(`[Export] apple_charts.json written: ${Object.keys(annotated).length} entries (${chartsSizeMB} MB).`);
  }

  // ── Write spotify_charts.json (annotated with inDb flag + itunesId) ────────
  if (spotifyChartsCache?.charts) {
    // Build title → itunesId map from exported podcasts for inDb annotation
    const titleToItunesId = new Map();
    podcasts.forEach(p => {
      if (p.title) titleToItunesId.set(normalizeTitle(p.title), p.itunesId);
    });

    const spotifyCharts = spotifyChartsCache.charts;
    const spotifyAnnotated = {};
    for (const [id, entry] of Object.entries(spotifyCharts)) {
      const itunesId = entry.title ? (titleToItunesId.get(normalizeTitle(entry.title)) || null) : null;
      spotifyAnnotated[id] = { ...entry, inDb: !!itunesId, itunesId };
    }
    const spotifyChartsJson = JSON.stringify({ scrapedAt: spotifyChartsCache.scrapedAt, charts: spotifyAnnotated });
    fs.writeFileSync(SPOTIFY_CHARTS_OUTPUT_PATH, spotifyChartsJson, 'utf8');
    const spotifyChartsSizeMB = (Buffer.byteLength(spotifyChartsJson) / 1024 / 1024).toFixed(1);
    console.log(`[Export] spotify_charts.json written: ${Object.keys(spotifyAnnotated).length} entries (${spotifyChartsSizeMB} MB).`);
  }

  console.log(`[Export] Done! ${podcasts.length} podcasts exported.`);

  process.exit(0);
}

exportPodcastsLite().catch(err => {
  console.error('[Export] Fatal error:', err);
  process.exit(1);
});
