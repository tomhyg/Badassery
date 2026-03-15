'use strict';

/**
 * fetch_spotify_charts.js — Scrape Spotify Podcast Charts and update Firestore
 *
 * Scrapes the US Top 200 for each Spotify Podcast chart category via Puppeteer,
 * writes the raw index to data/spotify_charts_cache.json, then batch-updates every
 * matched Firestore podcast document with chart rank fields.
 *
 * Match strategy: by normalized podcast title, since Spotify show IDs are not
 * stored in Firestore. Normalization = lowercase + strip non-alphanumeric.
 *
 * Fields written to Firestore (on matched docs only):
 *   spotify_chart_rank       {number}  Best rank across all categories
 *   spotify_chart_genre      {string}  Category where best rank was achieved
 *   spotify_chart_genres     {object}  { CategoryName: rank, ... }
 *   spotify_chart_scrapedAt  {Timestamp}
 *
 * Usage:
 *   node scripts/fetch_spotify_charts.js             # dry-run (default) — no Firestore writes
 *   node scripts/fetch_spotify_charts.js --confirm   # write to Firestore
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const { scrapeAllSpotifyCharts } = require('./utils/spotifyChartsScraper');

const DRY_RUN    = !process.argv.includes('--confirm');
const BATCH_SIZE = 400;
const CACHE_PATH = path.join(__dirname, '../data/spotify_charts_cache.json');

// ── Firebase ──────────────────────────────────────────────────────────────────

const serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

// ── Title normalization ───────────────────────────────────────────────────────

function normalizeTitle(title) {
  return (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Step 1: Scrape Spotify Charts ─────────────────────────────────────────────

async function fetchAndCacheCharts() {
  const chartIndex = await scrapeAllSpotifyCharts();

  const data = JSON.stringify({ scrapedAt: new Date().toISOString(), charts: chartIndex }, null, 2);
  fs.writeFileSync(CACHE_PATH, data, 'utf8');

  const sizeMB = (Buffer.byteLength(data) / 1024 / 1024).toFixed(1);
  log(`Cache written to ${CACHE_PATH} (${sizeMB} MB).`);

  return chartIndex;
}

// ── Step 2: Load title → itunesId map from Firestore ─────────────────────────

async function loadFirestoreTitleMap() {
  log('Building title → itunesId map from Firestore...', 'PHASE');

  const map     = new Map(); // normalizedTitle → itunesId
  let   lastDoc = null;
  let   total   = 0;

  while (true) {
    let q = db.collection('podcasts')
      .select('title')
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(1000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => {
      const title = d.data().title;
      if (title) map.set(normalizeTitle(title), d.id);
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    total += snap.docs.length;
    process.stdout.write(`\r  Loaded ${total} podcast titles...`);
    if (snap.docs.length < 1000) break;
  }

  process.stdout.write('\n');
  log(`Title map built: ${map.size} entries from ${total} Firestore docs.`, 'SUCCESS');
  return map;
}

// ── Step 3: Resolve chart entries against Firestore by title ──────────────────

async function resolveFirestoreMatches(chartIndex) {
  const titleMap = await loadFirestoreTitleMap();

  const chartEntries = Object.entries(chartIndex); // [spotifyId, entry]
  const matches      = [];                          // [{ itunesId, entry }]
  let   unmatched    = 0;

  for (const [, entry] of chartEntries) {
    if (!entry.title) { unmatched++; continue; }
    const normalized = normalizeTitle(entry.title);
    const itunesId   = titleMap.get(normalized);
    if (itunesId) {
      matches.push({ itunesId, entry });
    } else {
      unmatched++;
    }
  }

  log(`${matches.length} of ${chartEntries.length} charted podcasts matched in Firestore by title (${unmatched} unmatched).`, 'SUCCESS');
  return matches;
}

// ── Step 4: Batch-update Firestore ────────────────────────────────────────────

async function updateFirestore(matches) {
  if (matches.length === 0) {
    log('No matched podcasts to update.', 'WARN');
    return 0;
  }

  if (DRY_RUN) {
    log(`[DRY-RUN] Would update ${matches.length} Firestore documents with Spotify chart data.`, 'WARN');
    log('  Sample matches:');
    matches.slice(0, 5).forEach(m => log(`    ${m.itunesId} — "${m.entry.title}" → rank ${m.entry.bestRank} (${m.entry.bestGenre})`));
    return 0;
  }

  log(`Updating ${matches.length} Firestore documents...`, 'PHASE');

  const now     = admin.firestore.Timestamp.now();
  let   updated = 0;

  for (let i = 0; i < matches.length; i += BATCH_SIZE) {
    const chunk = matches.slice(i, i + BATCH_SIZE);
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
  log(`Firestore update complete: ${updated} documents updated.`, 'SUCCESS');
  return updated;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(72));
  console.log('  🎵  SPOTIFY PODCAST CHARTS — Scrape + Firestore update');
  console.log('='.repeat(72));
  if (DRY_RUN) {
    console.log('  ⚠️  DRY-RUN mode — Firestore will NOT be updated.');
    console.log('      Run with --confirm to write chart data.');
  } else {
    console.log('  🔴  LIVE mode — Firestore documents WILL be updated.');
  }
  console.log('='.repeat(72));
  console.log('');

  const chartIndex      = await fetchAndCacheCharts();
  const totalInCharts   = Object.keys(chartIndex).length;
  const matches         = await resolveFirestoreMatches(chartIndex);
  const updated         = await updateFirestore(matches);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Categories scraped      : ${Object.values(chartIndex).reduce((cats, e) => { Object.keys(e.genres || {}).forEach(c => cats.add(c)); return cats; }, new Set()).size}`);
  console.log(`  Unique IDs in charts    : ${totalInCharts.toLocaleString()}`);
  console.log(`  Matched in Firestore    : ${matches.length.toLocaleString()}`);
  console.log(`  Firestore updated       : ${DRY_RUN ? '0 (dry-run)' : updated.toLocaleString()}`);
  console.log(`  Cache saved to          : data/spotify_charts_cache.json`);
  console.log(`  Total time              : ${elapsed}s`);
  console.log('='.repeat(72));

  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
