'use strict';

/**
 * fetch_apple_charts.js — Scrape Apple Podcast Charts and update Firestore
 *
 * Scrapes the US Top 200 for each of the 19 Apple Podcast genres via Puppeteer,
 * writes the raw index to data/apple_charts_cache.json, then batch-updates every
 * matched Firestore podcast document with chart rank fields.
 *
 * Fields written to Firestore (on matched docs only):
 *   apple_chart_rank       {number}  Best rank across all genres (1 = #1 chart)
 *   apple_chart_genre      {string}  Genre where best rank was achieved
 *   apple_chart_genres     {object}  { GenreName: rank, ... } — all genres the podcast appears in
 *   apple_chart_scrapedAt  {Timestamp}
 *
 * Usage:
 *   node scripts/fetch_apple_charts.js             # dry-run (default) — no Firestore writes
 *   node scripts/fetch_apple_charts.js --confirm   # write to Firestore
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const { scrapeAllAppleCharts } = require('./utils/appleChartsScraper');

const DRY_RUN    = !process.argv.includes('--confirm');
const BATCH_SIZE = 400;
const CACHE_PATH = path.join(__dirname, '../data/apple_charts_cache.json');

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

// ── Step 1: Scrape Apple Charts ───────────────────────────────────────────────

async function fetchAndCacheCharts() {
  const chartIndex = await scrapeAllAppleCharts();

  // Save raw cache to disk
  const data = JSON.stringify({ scrapedAt: new Date().toISOString(), charts: chartIndex }, null, 2);
  fs.writeFileSync(CACHE_PATH, data, 'utf8');

  const sizeMB = (Buffer.byteLength(data) / 1024 / 1024).toFixed(1);
  log(`Cache written to ${CACHE_PATH} (${sizeMB} MB).`);

  return chartIndex;
}

// ── Step 2: Resolve which itunesIds exist in Firestore ────────────────────────

async function resolveFirestoreMatches(chartIndex) {
  log('Checking which charted podcasts exist in Firestore...', 'PHASE');

  const chartIds = Object.keys(chartIndex); // all itunesIds found in charts
  const matched  = [];

  // Firestore `in` queries max 30 items — batch them
  const IN_CHUNK = 30;
  for (let i = 0; i < chartIds.length; i += IN_CHUNK) {
    const chunk = chartIds.slice(i, i + IN_CHUNK);
    const snap  = await db.collection('podcasts')
      .where(admin.firestore.FieldPath.documentId(), 'in', chunk)
      .select() // IDs only
      .get();
    snap.docs.forEach(d => matched.push(d.id));
    process.stdout.write(`\r  Resolved ${Math.min(i + IN_CHUNK, chartIds.length)} / ${chartIds.length} chart IDs...`);
  }

  process.stdout.write('\n');
  log(`${matched.length} of ${chartIds.length} charted podcasts found in Firestore.`, 'SUCCESS');
  return matched;
}

// ── Step 3: Batch-update Firestore ────────────────────────────────────────────

async function updateFirestore(chartIndex, matchedIds) {
  if (matchedIds.length === 0) {
    log('No matched podcasts to update.', 'WARN');
    return 0;
  }

  if (DRY_RUN) {
    log(`[DRY-RUN] Would update ${matchedIds.length} Firestore documents with chart data.`, 'WARN');
    return 0;
  }

  log(`Updating ${matchedIds.length} Firestore documents...`, 'PHASE');

  const now     = admin.firestore.Timestamp.now();
  let   updated = 0;

  for (let i = 0; i < matchedIds.length; i += BATCH_SIZE) {
    const chunk = matchedIds.slice(i, i + BATCH_SIZE);
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
    process.stdout.write(`\r  Updated ${updated} / ${matchedIds.length}...`);
  }

  process.stdout.write('\n');
  log(`Firestore update complete: ${updated} documents updated.`, 'SUCCESS');
  return updated;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(72));
  console.log('  🎙️   APPLE PODCAST CHARTS — Scrape + Firestore update');
  console.log('='.repeat(72));
  if (DRY_RUN) {
    console.log('  ⚠️  DRY-RUN mode — Firestore will NOT be updated.');
    console.log('      Run with --confirm to write chart data.');
  } else {
    console.log('  🔴  LIVE mode — Firestore documents WILL be updated.');
  }
  console.log('='.repeat(72));
  console.log('');

  // Scrape
  const chartIndex  = await fetchAndCacheCharts();
  const totalInCharts = Object.keys(chartIndex).length;

  // Resolve against Firestore
  const matchedIds = await resolveFirestoreMatches(chartIndex);

  // Update Firestore
  const updated = await updateFirestore(chartIndex, matchedIds);

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Genres scraped         : 19`);
  console.log(`  Unique IDs in charts   : ${totalInCharts.toLocaleString()}`);
  console.log(`  Matched in Firestore   : ${matchedIds.length.toLocaleString()}`);
  console.log(`  Firestore updated      : ${DRY_RUN ? '0 (dry-run)' : updated.toLocaleString()}`);
  console.log(`  Cache saved to         : data/apple_charts_cache.json`);
  console.log(`  Total time             : ${elapsed}s`);
  console.log('='.repeat(72));

  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
