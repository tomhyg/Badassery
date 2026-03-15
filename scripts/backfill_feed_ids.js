/**
 * backfill_feed_ids.js — Backfill missing feedId from PodcastIndex
 *
 * Reads webapp/badassery/public/podcasts-lite.json, finds podcasts with no
 * id field (14,811 older enriched docs), looks each up via PodcastIndex
 * /podcasts/byitunesid, and writes feedId back to Firestore.
 *
 * After this runs, re-deploy so podcasts-lite.json is regenerated with the
 * new feedId values and episodes work in production.
 *
 * Usage:
 *   node scripts/backfill_feed_ids.js            # full run
 *   node scripts/backfill_feed_ids.js --dry-run  # count only, no writes or API calls
 *   node scripts/backfill_feed_ids.js --reset    # ignore checkpoint, start fresh
 *
 * Rate: 0.9 req/s via PodcastIndexClient token bucket → ~4.6h for 14,811 docs
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs    = require('fs');
const path  = require('path');
const admin = require('firebase-admin');
const { PodcastIndexClient } = require('./utils/podcastIndexClient');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN   = process.argv.includes('--dry-run');
const RESET     = process.argv.includes('--reset');
const JSON_PATH = path.join(__dirname, '../webapp/badassery/public/podcasts-lite.json');
const CKPT_PATH = path.join(__dirname, '../checkpoints/backfill_feed_ids.json');
const BATCH_SIZE = 400;
const LOG_EVERY  = 100;

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

function eta(processed, total, startMs) {
  if (processed === 0) return '—';
  const elapsed   = (Date.now() - startMs) / 1000;
  const rate      = processed / elapsed;
  const remaining = (total - processed) / rate;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (RESET) return null;
  try {
    const ckpt = JSON.parse(fs.readFileSync(CKPT_PATH, 'utf8'));
    log(`Resuming from checkpoint: ${ckpt.processedCount.toLocaleString()} already processed.`);
    return ckpt;
  } catch {
    return null;
  }
}

function saveCheckpoint(data) {
  const dir = path.dirname(CKPT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CKPT_PATH, JSON.stringify(data, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔧  FEED ID BACKFILL — PodcastIndex byitunesid lookup');
  console.log('='.repeat(72));
  if (DRY_RUN) console.log('  ⚠️  DRY-RUN — no API calls or Firestore writes');
  if (RESET)   console.log('  ⚠️  --reset — ignoring checkpoint');
  console.log(`  Source     : ${JSON_PATH}`);
  console.log(`  Checkpoint : ${CKPT_PATH}`);
  console.log(`  Rate       : 0.9 req/s → ~4.6h for 14,811 docs`);
  console.log('='.repeat(72));
  console.log('');

  const startTime = Date.now();

  // Load the lite JSON and find podcasts with no id
  log('Loading podcasts-lite.json...', 'PHASE');
  const allPodcasts = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const needsBackfill = allPodcasts.filter(p => p.id == null);
  log(`Total in JSON: ${allPodcasts.length.toLocaleString()}`);
  log(`Missing feedId: ${needsBackfill.length.toLocaleString()}`, 'SUCCESS');

  if (DRY_RUN) {
    log(`[DRY-RUN] Would call PodcastIndex API for ${needsBackfill.length.toLocaleString()} podcasts.`, 'WARN');
    log(`[DRY-RUN] Estimated time at 0.9 req/s: ${Math.round(needsBackfill.length / 0.9 / 3600 * 10) / 10}h`, 'WARN');
    process.exit(0);
  }

  if (needsBackfill.length === 0) {
    log('All podcasts already have a feedId — nothing to do.', 'SUCCESS');
    process.exit(0);
  }

  // Resume from checkpoint
  const ckpt = loadCheckpoint();
  const doneIds = new Set(ckpt ? ckpt.doneIds : []);
  const remaining = needsBackfill.filter(p => !doneIds.has(p.itunesId));
  log(`Remaining after checkpoint: ${remaining.length.toLocaleString()} podcasts.`);

  const client = new PodcastIndexClient();

  let batch      = db.batch();
  let batchCount = 0;
  let processed  = doneIds.size;
  let found      = ckpt?.found    || 0;
  let notFound   = ckpt?.notFound || 0;
  let errors     = 0;
  const startMs  = Date.now();

  for (const podcast of remaining) {
    let feedId = null;

    try {
      feedId = await client.getFeedIdByItunesId(podcast.itunesId);
    } catch (err) {
      errors++;
    }

    doneIds.add(podcast.itunesId);
    processed++;

    if (feedId) {
      found++;
      const docRef = db.collection('podcasts').doc(String(podcast.itunesId));
      batch.update(docRef, { feedId });
      batchCount++;

      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    } else {
      notFound++;
    }

    if (processed % LOG_EVERY === 0) {
      const rate   = found + notFound > 0 ? ((found / (found + notFound)) * 100).toFixed(1) : '0.0';
      const etaStr = eta(processed - (ckpt?.processedCount || 0), remaining.length, startMs);
      log(
        `Progress: ${processed.toLocaleString()} processed | ` +
        `${found.toLocaleString()} found (${rate}%) | ` +
        `${notFound.toLocaleString()} not found | ${errors} errors | ETA: ${etaStr}`
      );
      saveCheckpoint({
        processedCount: processed,
        doneIds: [...doneIds],
        found, notFound, errors,
        savedAt: new Date().toISOString(),
      });
    }
  }

  // Flush remaining batch
  if (batchCount > 0) {
    await batch.commit();
  }

  saveCheckpoint({
    processedCount: processed,
    doneIds: [...doneIds],
    found, notFound, errors,
    completedAt: new Date().toISOString(),
  });

  const rate = found + notFound > 0 ? ((found / (found + notFound)) * 100).toFixed(1) : '0.0';
  log(
    `Done: ${found.toLocaleString()} feedIds written (${rate}%), ` +
    `${notFound.toLocaleString()} not found in PodcastIndex, ${errors} errors.`,
    'SUCCESS'
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log(`  Total time: ${elapsed}s`);
  console.log(`  Next step : cd webapp/badassery && npm run deploy`);
  console.log('='.repeat(72));
  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
