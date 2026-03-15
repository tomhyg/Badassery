/**
 * import_from_sqlite.js — PodcastIndex SQLite → Firestore delta import
 *
 * Usage:
 *   node scripts/import_from_sqlite.js            # full run
 *   node scripts/import_from_sqlite.js --dry-run  # show counts, no writes
 *   node scripts/import_from_sqlite.js --skip-phase3  # bypass guest filter
 *
 * Steps:
 *   1. Download podcastindex_feeds.db.tgz (skipped if <7 days old)
 *   2. SQL filter: English, ≥50 episodes, active in 90d, has itunesId, not dead
 *   3. Phase 3 guest filter: desc keywords OR ≥2/10 episode title matches
 *   4. Delta: load all existing itunesIds from Firestore, skip known ones
 *   5. Write new podcasts with batch.set(..., { merge: true })
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs      = require('fs');
const path    = require('path');
const admin   = require('firebase-admin');
const Database = require('better-sqlite3');
const { PodcastIndexClient } = require('./utils/podcastIndexClient');
const { ensureDatabase, DB_PATH } = require('./utils/sqliteDb');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN      = process.argv.includes('--dry-run');
const SKIP_PHASE3  = process.argv.includes('--skip-phase3');
const EXPORT_ONLY  = process.argv.includes('--export-only');
const DATA_DIR     = path.join(__dirname, '../data');
const EXPORT_PATH  = path.join(DATA_DIR, 'phase3_true_new.json');
const BATCH_SIZE   = 400;
const LOG_INTERVAL = 1000;

// Phase 3 config
const P3_WORKERS      = 5;
const P3_WORKER_DELAY = 200; // ms between requests per worker (~1 req/s total)
const P3_MIN_SIGNALS  = 2;   // minimum episode title matches to PASS

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

// ── Step 2: SQL filter ────────────────────────────────────────────────────────

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

// ── Step 3: Phase 3 guest filter ──────────────────────────────────────────────

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

async function phase3GuestFilter(rows) {
  if (SKIP_PHASE3) {
    log('--skip-phase3 flag set — bypassing guest filter.', 'WARN');
    return rows;
  }

  log(`Phase 3 guest filter: ${rows.length.toLocaleString()} candidates, ${P3_WORKERS} workers...`, 'PHASE');

  // Description check is free — do it first, no API call needed
  const descPass  = rows.filter(r => descMatchesGuestPattern(r.description));
  const descPassIds = new Set(descPass.map(r => r.id));
  const needsApi  = rows.filter(r => !descPassIds.has(r.id));

  log(`Desc check: ${descPass.length.toLocaleString()} passed instantly, ${needsApi.length.toLocaleString()} need API episode check.`);

  // Episode title check via PodcastIndex API (parallel workers)
  const client = new PodcastIndexClient();
  const queue  = [...needsApi];
  const apiPass = [];
  let checked = 0;
  let errors  = 0;

  async function worker() {
    while (queue.length > 0) {
      const row = queue.shift();
      if (!row) break;

      try {
        const episodes = await client.getEpisodesByFeedId(row.id, 10);
        const matchCount = episodes.filter(ep => titleMatchesGuestPattern(ep.title)).length;
        if (matchCount >= P3_MIN_SIGNALS) {
          apiPass.push(row);
        }
      } catch {
        errors++;
      }

      checked++;
      if (checked % 500 === 0 || checked === needsApi.length) {
        const pct = ((checked / needsApi.length) * 100).toFixed(1);
        process.stdout.write(
          `\r  API check: ${checked.toLocaleString()} / ${needsApi.length.toLocaleString()} (${pct}%) — ${apiPass.length.toLocaleString()} passed, ${errors} errors`
        );
      }

      await new Promise(r => setTimeout(r, P3_WORKER_DELAY));
    }
  }

  await Promise.all(Array(P3_WORKERS).fill(null).map(() => worker()));
  if (needsApi.length > 0) process.stdout.write('\n');

  const passed = [...descPass, ...apiPass];
  log(
    `Phase 3 complete: ${passed.length.toLocaleString()} passed ` +
    `(${descPass.length.toLocaleString()} via desc, ${apiPass.length.toLocaleString()} via episodes) ` +
    `— ${(rows.length - passed.length).toLocaleString()} filtered out.`,
    'SUCCESS'
  );
  return passed;
}

// ── Step 4a: Load existing Firestore IDs (used by --skip-phase3 path) ────────

async function loadExistingIds() {
  log('Loading existing itunesIds from Firestore (one full scan)...', 'PHASE');
  const existingIds = new Set();
  let lastDoc = null;

  while (true) {
    let q = db.collection('podcasts').select('itunesId').limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => existingIds.add(d.id));
    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Loaded ${existingIds.size.toLocaleString()} existing IDs...`);

    if (snap.docs.length < 5000) break;
  }

  process.stdout.write('\n');
  log(`Deduplication set: ${existingIds.size.toLocaleString()} existing podcasts.`, 'SUCCESS');
  return existingIds;
}

// ── Step 4b: Load Phase 3 data from Firestore ─────────────────────────────────
// Returns:
//   passIds        — itunesIds where phase3_guest_friendly = true
//   missingTitleIds — subset of passIds where title is null/missing (need import)

async function loadPhase3Data() {
  log('Loading phase3_guest_friendly = true IDs from Firestore...', 'PHASE');
  const passIds        = new Set();
  const missingTitleIds = new Set();
  let lastDoc = null;

  while (true) {
    let q = db.collection('podcasts')
      .where('phase3_guest_friendly', '==', true)
      .select('title')
      .limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => {
      passIds.add(d.id);
      const title = d.data().title;
      if (title == null || title === '') missingTitleIds.add(d.id);
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Loaded ${passIds.size.toLocaleString()} phase3-pass IDs (${missingTitleIds.size.toLocaleString()} missing title)...`);

    if (snap.docs.length < 5000) break;
  }

  process.stdout.write('\n');
  log(`Phase 3 pass IDs    : ${passIds.size.toLocaleString()}`, 'SUCCESS');
  log(`Missing title (stub): ${missingTitleIds.size.toLocaleString()}`, 'INFO');
  return { passIds, missingTitleIds };
}

// ── Step 5a: Export to JSON (--export-only) ───────────────────────────────────

function exportToJson(sqlRows, { passIds, missingTitleIds }) {
  const rows = sqlRows.filter(r => missingTitleIds.has(String(r.itunesId)));
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(EXPORT_PATH, JSON.stringify(rows, null, 2));
  log(`Exported ${rows.length.toLocaleString()} entries to ${EXPORT_PATH}`, 'SUCCESS');
  return rows.length;
}

// ── Step 5b: Write to Firestore ───────────────────────────────────────────────

async function importPodcasts(rows, { passIds, missingTitleIds } = {}) {
  // --skip-phase3 path: passIds/missingTitleIds will be undefined — use legacy dedup
  let newRows;
  if (!passIds) {
    // Legacy: called from --skip-phase3 branch with existingIds as second arg (a Set)
    const existingIds = missingTitleIds; // re-used param slot
    newRows = rows.filter(r => !existingIds.has(String(r.itunesId)));
    log(`Total SQL candidates  : ${rows.length.toLocaleString()}`, 'INFO');
    log(`Already in Firestore  : ${(rows.length - newRows.length).toLocaleString()}`, 'INFO');
    log(`Net new to import     : ${newRows.length.toLocaleString()}`, 'SUCCESS');
  } else {
    // Normal path: cross-reference SQLite rows against phase3 pass IDs,
    // then keep only those missing title in Firestore (stub/ghost docs or never imported).
    const phase3Match = rows.filter(r => passIds.has(String(r.itunesId)));
    newRows           = phase3Match.filter(r => missingTitleIds.has(String(r.itunesId)));
    const alreadyComplete = phase3Match.length - newRows.length;

    log(`Total SQL candidates        : ${rows.length.toLocaleString()}`, 'INFO');
    log(`Matched phase3_guest_friendly: ${phase3Match.length.toLocaleString()}`, 'INFO');
    log(`Already complete in Firestore: ${alreadyComplete.toLocaleString()}`, 'INFO');
    log(`Net new to import (stub/new) : ${newRows.length.toLocaleString()}`, 'SUCCESS');
  }

  if (DRY_RUN) {
    log(`[DRY-RUN] Would write ${newRows.length.toLocaleString()} podcasts to Firestore. No writes performed.`, 'WARN');
    return;
  }

  if (newRows.length === 0) {
    log('Nothing to import — Firestore is already up to date.', 'SUCCESS');
    return;
  }

  log(`Writing ${newRows.length.toLocaleString()} podcasts to Firestore (batch size ${BATCH_SIZE})...`, 'PHASE');

  let written = 0;
  let batch = db.batch();
  let batchCount = 0;
  const importedAt = admin.firestore.Timestamp.now();

  for (const row of newRows) {
    const docRef = db.collection('podcasts').doc(String(row.itunesId));

    batch.set(docRef, {
      feedId           : row.id,
      itunesId         : String(row.itunesId),
      title            : row.title            || '',
      description      : row.description      || '',
      language         : row.language         || '',
      episodeCount     : row.episodeCount      || 0,
      newestItemPubdate: row.newestItemPubdate || null,
      imageUrl         : row.imageUrl         || '',
      url              : row.url              || '',
      importedAt,
      uploadedFrom     : 'import_from_sqlite',
      // AI fields intentionally omitted — Gemini will score later
    }, { merge: true });

    batchCount++;
    written++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }

    if (written % LOG_INTERVAL === 0) {
      log(`Progress: ${written.toLocaleString()} / ${newRows.length.toLocaleString()} written...`);
    }
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  log(`Import complete: ${written.toLocaleString()} podcasts written to Firestore.`, 'SUCCESS');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🗄️   PODCASTINDEX SQLITE → FIRESTORE IMPORT');
  console.log('='.repeat(72));
  if (DRY_RUN)     console.log('  ⚠️  DRY-RUN — no writes will be performed');
  if (SKIP_PHASE3) console.log('  ⚠️  --skip-phase3 — guest filter disabled');
  if (EXPORT_ONLY) console.log('  ⚠️  --export-only — write JSON only, no Firestore writes');
  console.log(`  DB path   : ${DB_PATH}`);
  console.log(`  SQL filter: English, ≥50 episodes, active 90d, not dead`);
  console.log(`  Phase 3   : desc keywords OR ≥${P3_MIN_SIGNALS}/10 episode title matches`);
  console.log('='.repeat(72));
  console.log('');

  const startTime = Date.now();

  await ensureDatabase();
  const sqlRows = queryPodcasts();

  if (EXPORT_ONLY) {
    // Export path: write phase3-pass stubs with full SQLite data to JSON, no Firestore writes
    const phase3Data = await loadPhase3Data();
    exportToJson(sqlRows, phase3Data);
  } else if (SKIP_PHASE3) {
    // Legacy path: import everything not yet in Firestore
    const existingIds = await loadExistingIds();
    await importPodcasts(sqlRows, { passIds: null, missingTitleIds: existingIds });
  } else {
    // Normal path: use pre-computed Phase 3 results from Firestore
    const phase3Data = await loadPhase3Data();
    await importPodcasts(sqlRows, phase3Data);
  }

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
