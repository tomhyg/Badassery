/**
 * phase3_filter.js — Standalone Phase 3 guest-interview filter
 *
 * Reads SQLite candidates → skips itunesIds already having phase3_guest_friendly in Firestore
 * → runs description check (free) + PodcastIndex episode-title check (rate-limited to 1 req/s)
 * → writes phase3_guest_friendly field back to Firestore
 * → checkpoints every 500 podcasts to checkpoints/phase3.json
 * → saves full results to data/phase3_results.json on completion
 *
 * Usage:
 *   node scripts/phase3_filter.js            # full run
 *   node scripts/phase3_filter.js --dry-run  # count only, no writes
 *   node scripts/phase3_filter.js --reset    # ignore checkpoint, start from scratch
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs      = require('fs');
const path    = require('path');
const admin   = require('firebase-admin');
const Database = require('better-sqlite3');
const { PodcastIndexClient } = require('./utils/podcastIndexClient');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN    = process.argv.includes('--dry-run');
const RESET      = process.argv.includes('--reset');
const DB_PATH    = path.join(__dirname, '../data/podcastindex_feeds.db');
const CKPT_PATH  = path.join(__dirname, '../checkpoints/phase3.json');
const OUT_PATH   = path.join(__dirname, '../data/phase3_results.json');
const BATCH_SIZE = 400;
const LOG_EVERY  = 500;   // log ETA every N podcasts
const REQ_DELAY  = 1000;  // ms between PI API calls (1 req/s)

// Phase 3 guest-detection config
const P3_MIN_SIGNALS = 2;  // minimum episode title matches to PASS

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
  const elapsed = (Date.now() - startMs) / 1000;
  const rate = processed / elapsed;           // podcasts/s
  const remaining = (total - processed) / rate;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Phase 3 guest patterns ────────────────────────────────────────────────────

const GUEST_KEYWORDS = [
  'interview', ' with ', 'feat', 'featuring', 'guest',
  'joined by', 'talks to', 'speaks with', "today's guest",
  'sits down with', 'in conversation with', 'my guest',
  'welcomes', 'special guest', 'chatting with',
];

const RE_NAME_ON  = /[A-Z][a-z]+ [A-Z][a-z]+ on [A-Z]/;
const RE_NAME_END = / [-|–] [A-Z][a-z]+ [A-Z][a-z]+$/;
const RE_NAME_ON2 = /[A-Z][a-z]+ on [A-Z]/;

const DESC_KEYWORDS = [
  'interview', 'interviews', 'guest', 'guests', 'featuring',
];

function titleMatchesGuestPattern(title) {
  const lower = title.toLowerCase();
  for (const kw of GUEST_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return RE_NAME_ON.test(title) || RE_NAME_END.test(title) || RE_NAME_ON2.test(title);
}

function descMatchesGuestPattern(description) {
  const lower = (description || '').toLowerCase();
  return DESC_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Step 1: Query SQLite ──────────────────────────────────────────────────────

function queryPodcasts() {
  log('Opening SQLite database...', 'PHASE');
  const sqlite = new Database(DB_PATH, { readonly: true });

  const sql = `
    SELECT
      id,
      url,
      title,
      description,
      language,
      itunesId,
      episodeCount,
      newestItemPubdate,
      imageUrl
    FROM podcasts
    WHERE lower(language)   LIKE 'en%'
      AND episodeCount      >= 50
      AND newestItemPubdate >  strftime('%s', 'now', '-90 days')
      AND itunesId          IS NOT NULL
      AND itunesId          != 0
      AND dead              = 0
  `;

  log('Running SQL filter (English, ≥50 eps, active 90d, has itunesId, not dead)...');
  const rows = sqlite.prepare(sql).all();
  sqlite.close();

  log(`SQL returned ${rows.length.toLocaleString()} candidates.`, 'SUCCESS');
  return rows;
}

// ── Step 2: Load Firestore itunesIds that already have phase3_guest_friendly ──

async function loadAlreadyScored() {
  log('Scanning Firestore for podcasts already having phase3_guest_friendly...', 'PHASE');
  const doneIds = new Set();
  let lastDoc = null;

  while (true) {
    let q = db.collection('podcasts')
      .where('phase3_guest_friendly', '!=', null)
      .select('phase3_guest_friendly')
      .limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => doneIds.add(d.id));  // doc ID = itunesId
    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Found ${doneIds.size.toLocaleString()} already scored...`);

    if (snap.docs.length < 5000) break;
  }

  process.stdout.write('\n');
  log(`Already scored: ${doneIds.size.toLocaleString()} podcasts.`, 'SUCCESS');
  return doneIds;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (RESET) return null;
  try {
    const raw = fs.readFileSync(CKPT_PATH, 'utf8');
    const ckpt = JSON.parse(raw);
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

function saveResults(results) {
  const dir = path.dirname(OUT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
}

// ── Step 3: Run Phase 3 filter ────────────────────────────────────────────────

async function runPhase3(rows, alreadyScoredIds) {
  // Remove already-scored from the work queue
  const todo = rows.filter(r => !alreadyScoredIds.has(String(r.itunesId)));
  log(`Work queue: ${todo.length.toLocaleString()} podcasts to score.`, 'INFO');

  if (DRY_RUN) {
    // Description check is free — give a quick estimate
    const descPassCount = todo.filter(r => descMatchesGuestPattern(r.description)).length;
    log(`[DRY-RUN] ${descPassCount.toLocaleString()} would pass via description check instantly.`, 'WARN');
    log(`[DRY-RUN] ${(todo.length - descPassCount).toLocaleString()} would need PI API episode check.`, 'WARN');
    log(`[DRY-RUN] No writes or API calls performed.`, 'WARN');
    return;
  }

  if (todo.length === 0) {
    log('All podcasts already scored — nothing to do.', 'SUCCESS');
    return;
  }

  // Load checkpoint to know which itunesIds were already processed in a prior run
  const ckpt = loadCheckpoint();
  const processedInRun = new Set(ckpt ? ckpt.processedItunesIds : []);
  const remaining = todo.filter(r => !processedInRun.has(String(r.itunesId)));

  log(`Remaining after checkpoint: ${remaining.length.toLocaleString()} podcasts.`, 'INFO');

  const client = new PodcastIndexClient();
  const results = [];

  let batch        = db.batch();
  let batchCount   = 0;
  let processed    = processedInRun.size;  // total processed including prior runs
  let passCount    = 0;
  let failCount    = 0;
  let descPassCount = 0;
  let apiPassCount  = 0;
  let apiErrors    = 0;
  const startMs    = Date.now();

  for (const row of remaining) {
    const itunesId = String(row.itunesId);

    // 1. Description check (free, no API call)
    const descPass = descMatchesGuestPattern(row.description);
    let guestFriendly = descPass;
    let method = descPass ? 'desc' : null;

    if (!descPass) {
      // 2. Episode title check via PI API
      try {
        const episodes = await client.getEpisodesByFeedId(row.id, 10);
        const matchCount = episodes.filter(ep => titleMatchesGuestPattern(ep.title)).length;
        if (matchCount >= P3_MIN_SIGNALS) {
          guestFriendly = true;
          method = 'episodes';
          apiPassCount++;
        } else {
          guestFriendly = false;
          method = 'episodes';
        }
      } catch {
        apiErrors++;
        // On API error, default to false (conservative)
        guestFriendly = false;
        method = 'error';
      }

      // Rate limit: 1 req/s
      await new Promise(r => setTimeout(r, REQ_DELAY));
    } else {
      descPassCount++;
    }

    if (guestFriendly) passCount++;
    else failCount++;

    results.push({ itunesId, feedId: row.id, title: row.title, guestFriendly, method });
    processedInRun.add(itunesId);
    processed++;

    // Write to Firestore batch
    if (!itunesId) continue;
    const docRef = db.collection('podcasts').doc(itunesId);
    batch.set(docRef, { phase3_guest_friendly: guestFriendly }, { merge: true });
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }

    // Checkpoint + ETA every LOG_EVERY podcasts
    if (processed % LOG_EVERY === 0) {
      const etaStr = eta(processed - (ckpt ? ckpt.processedCount : 0), remaining.length, startMs);
      log(
        `Progress: ${processed.toLocaleString()} processed | ` +
        `${passCount.toLocaleString()} pass / ${failCount.toLocaleString()} fail | ` +
        `errors: ${apiErrors} | ETA: ${etaStr}`
      );

      saveCheckpoint({
        processedCount    : processed,
        processedItunesIds: [...processedInRun],
        passCount,
        failCount,
        descPassCount,
        apiPassCount,
        apiErrors,
        savedAt           : new Date().toISOString(),
      });
    }
  }

  // Flush remaining batch
  if (batchCount > 0) {
    await batch.commit();
  }

  // Final checkpoint + results file
  saveCheckpoint({
    processedCount    : processed,
    processedItunesIds: [...processedInRun],
    passCount,
    failCount,
    descPassCount,
    apiPassCount,
    apiErrors,
    completedAt       : new Date().toISOString(),
  });

  saveResults(results);

  log(
    `Phase 3 complete: ${passCount.toLocaleString()} passed, ${failCount.toLocaleString()} failed ` +
    `(${descPassCount.toLocaleString()} via desc, ${apiPassCount.toLocaleString()} via episodes) ` +
    `— ${apiErrors} API errors.`,
    'SUCCESS'
  );
  log(`Results saved to ${OUT_PATH}`, 'SUCCESS');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔍  PHASE 3 GUEST FILTER — STANDALONE RUN');
  console.log('='.repeat(72));
  if (DRY_RUN) console.log('  ⚠️  DRY-RUN — no writes or API calls');
  if (RESET)   console.log('  ⚠️  --reset — ignoring checkpoint');
  console.log(`  DB path     : ${DB_PATH}`);
  console.log(`  Checkpoint  : ${CKPT_PATH}`);
  console.log(`  Output      : ${OUT_PATH}`);
  console.log(`  Rate limit  : ${REQ_DELAY}ms / API call`);
  console.log(`  PASS if     : desc keyword hit  OR  ≥${P3_MIN_SIGNALS}/10 episode titles match`);
  console.log('='.repeat(72));
  console.log('');

  const startTime = Date.now();

  const sqlRows      = queryPodcasts();
  const alreadyDone  = await loadAlreadyScored();
  await runPhase3(sqlRows, alreadyDone);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log(`  Total time: ${elapsed}s`);
  console.log('='.repeat(72));
  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
