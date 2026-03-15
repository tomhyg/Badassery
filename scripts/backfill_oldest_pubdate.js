'use strict';

/**
 * backfill_oldest_pubdate.js — Write oldestItemPubdate from SQLite → Firestore
 *
 * Join key: SQLite.itunesId = Firestore document ID (string == integer string)
 *
 * Logic:
 *   - Loads all itunesId → oldestItemPubdate pairs from SQLite into memory
 *   - Paginates Firestore (batches of 500)
 *   - For docs where oldestItemPubdate is undefined:
 *       → look up by Firestore doc ID (= itunesId) in SQLite map
 *       → if found, write oldestItemPubdate as integer Unix timestamp
 *   - Skips docs that already have oldestItemPubdate
 *
 * Usage:
 *   node scripts/backfill_oldest_pubdate.js                # dry-run (default)
 *   node scripts/backfill_oldest_pubdate.js --confirm      # write to Firestore
 *   node scripts/backfill_oldest_pubdate.js --limit=100    # process first N docs only
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin   = require('firebase-admin');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./utils/sqliteDb');

const DRY_RUN    = !process.argv.includes('--confirm');
const BATCH_SIZE = 400;
const PAGE_SIZE  = 500;

const limitArg = process.argv.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

const serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

// ── Load SQLite map ────────────────────────────────────────────────────────────

function loadSQLiteMap() {
  log('Loading SQLite itunesId → oldestItemPubdate map...', 'PHASE');
  const sqlite = new Database(DB_PATH, { readonly: true });

  const rows = sqlite.prepare(
    'SELECT CAST(itunesId AS TEXT) AS itunesId, oldestItemPubdate FROM podcasts WHERE itunesId IS NOT NULL AND oldestItemPubdate > 0'
  ).all();

  sqlite.close();

  const map = new Map();
  for (const row of rows) {
    map.set(row.itunesId, row.oldestItemPubdate);
  }

  log(`SQLite map loaded: ${map.size.toLocaleString()} entries with oldestItemPubdate.`, 'SUCCESS');
  return map;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(72));
  console.log('  📅  BACKFILL oldestItemPubdate: SQLite → Firestore');
  console.log('='.repeat(72));
  if (DRY_RUN) {
    console.log('  ⚠️  DRY-RUN mode — Firestore will NOT be updated.');
    console.log('      Run with --confirm to apply changes.');
  } else {
    console.log('  🔴  LIVE mode — Firestore documents WILL be updated.');
  }
  if (LIMIT !== Infinity) console.log(`  Limit: first ${LIMIT} Firestore docs`);
  console.log('='.repeat(72) + '\n');

  const sqliteMap = loadSQLiteMap();

  let lastDoc       = null;
  let totalScanned  = 0;
  let matched       = 0;  // found in SQLite + will be/was written
  let notInSQLite   = 0;  // doc ID not in SQLite map
  let alreadyHas    = 0;  // already had oldestItemPubdate in Firestore
  let written       = 0;

  // Sample to show in dry-run mode
  const samples = [];

  while (totalScanned < LIMIT) {
    const pageSize = Math.min(PAGE_SIZE, LIMIT - totalScanned);

    let q = db.collection('podcasts')
      .select('oldestItemPubdate', 'title')
      .limit(pageSize)
      .orderBy(admin.firestore.FieldPath.documentId());
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    const toWrite = [];

    for (const doc of snap.docs) {
      const d = doc.data();

      if (d.oldestItemPubdate != null) {
        alreadyHas++;
        continue;
      }

      const pubdate = sqliteMap.get(doc.id);
      if (pubdate == null) {
        notInSQLite++;
        continue;
      }

      matched++;
      toWrite.push({ ref: doc.ref, id: doc.id, title: d.title, pubdate });

      if (samples.length < 5) {
        samples.push({ id: doc.id, title: d.title, oldestItemPubdate: pubdate });
      }
    }

    totalScanned += snap.docs.length;
    lastDoc = snap.docs[snap.docs.length - 1];

    process.stdout.write(
      `\r  Scanned ${totalScanned.toLocaleString()} | matched: ${matched} | skipped: ${alreadyHas} | not-in-sqlite: ${notInSQLite}...`
    );

    if (!DRY_RUN && toWrite.length > 0) {
      for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
        const chunk = toWrite.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const item of chunk) {
          batch.update(item.ref, { oldestItemPubdate: item.pubdate });
        }
        await batch.commit();
        written += chunk.length;
      }
    }

    if (snap.docs.length < pageSize) break;
  }

  process.stdout.write('\n');

  // Show samples in dry-run or first run
  if (samples.length > 0) {
    console.log('\n  Sample docs that would be updated:');
    for (const s of samples) {
      const date = new Date(s.oldestItemPubdate * 1000).toISOString().split('T')[0];
      console.log(`    ${s.id}  "${s.title?.substring(0, 45)}"  → ${s.oldestItemPubdate} (${date})`);
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Firestore docs scanned          : ${totalScanned.toLocaleString()}`);
  console.log(`  Already had oldestItemPubdate   : ${alreadyHas.toLocaleString()}`);
  console.log(`  Matched in SQLite (need write)  : ${matched.toLocaleString()}`);
  console.log(`  Not found in SQLite             : ${notInSQLite.toLocaleString()}`);
  console.log(`  Firestore writes                : ${DRY_RUN ? '0 (dry-run)' : written.toLocaleString()}`);
  console.log(`  Total time                      : ${elapsed}s`);
  console.log('='.repeat(72));

  process.exit(0);
}

main().catch(err => {
  log(`Fatal: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
