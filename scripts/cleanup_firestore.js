/**
 * cleanup_firestore.js — Remove Firestore podcasts not present in podcasts-lite.json
 *
 * Loads every document ID from the Firestore podcasts collection, then loads
 * the set of IDs exported to podcasts-lite.json. Any Firestore document whose
 * ID is NOT in the JSON is a candidate for deletion.
 *
 * Usage:
 *   node scripts/cleanup_firestore.js             # dry-run (default) — logs counts, no deletes
 *   node scripts/cleanup_firestore.js --confirm   # actually delete
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('firebase-admin');
const fs    = require('fs');
const path  = require('path');

const DRY_RUN    = !process.argv.includes('--confirm');
const BATCH_SIZE = 400;
const JSON_PATH  = path.join(__dirname, '../webapp/badassery/public/podcasts-lite.json');

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

// ── Step 1: Load all Firestore document IDs ───────────────────────────────────

async function loadFirestoreIds() {
  log('Loading all document IDs from Firestore podcasts collection...', 'PHASE');
  const ids    = new Set();
  let lastDoc  = null;
  let batch    = 0;

  while (true) {
    let q = db.collection('podcasts')
      .select()  // IDs only — no field data
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => ids.add(d.id));
    lastDoc = snap.docs[snap.docs.length - 1];
    batch++;
    process.stdout.write(`\r  Loaded ${ids.size.toLocaleString()} Firestore IDs (batch ${batch})...`);

    if (snap.docs.length < 5000) break;
  }

  process.stdout.write('\n');
  log(`Firestore total: ${ids.size.toLocaleString()} documents.`, 'SUCCESS');
  return ids;
}

// ── Step 2: Load IDs from podcasts-lite.json ──────────────────────────────────

function loadJsonIds() {
  log(`Loading IDs from ${JSON_PATH}...`, 'PHASE');

  if (!fs.existsSync(JSON_PATH)) {
    throw new Error(`podcasts-lite.json not found at ${JSON_PATH}. Run export_podcasts_lite.js first.`);
  }

  const raw     = fs.readFileSync(JSON_PATH, 'utf8');
  const records = JSON.parse(raw);
  const ids     = new Set(records.map(r => String(r.itunesId)));

  log(`podcasts-lite.json total: ${ids.size.toLocaleString()} entries.`, 'SUCCESS');
  return ids;
}

// ── Step 3: Delete in batches ─────────────────────────────────────────────────

async function deleteIds(toDelete) {
  let deleted = 0;

  for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
    const chunk = toDelete.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const id of chunk) {
      batch.delete(db.collection('podcasts').doc(id));
    }
    await batch.commit();
    deleted += chunk.length;
    process.stdout.write(`\r  Deleted ${deleted.toLocaleString()} / ${toDelete.length.toLocaleString()}...`);
  }

  process.stdout.write('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🧹  FIRESTORE CLEANUP — remove docs absent from podcasts-lite.json');
  console.log('='.repeat(72));
  if (DRY_RUN) {
    console.log('  ⚠️  DRY-RUN mode — no deletions will be performed.');
    console.log('      Run with --confirm to actually delete.');
  } else {
    console.log('  🔴  LIVE mode — documents WILL be permanently deleted.');
  }
  console.log('='.repeat(72));
  console.log('');

  const firestoreIds = await loadFirestoreIds();
  const jsonIds      = loadJsonIds();

  // Find IDs in Firestore but not in the JSON
  const toDelete = [];
  for (const id of firestoreIds) {
    if (!jsonIds.has(id)) toDelete.push(id);
  }

  console.log('');
  log(`Total in Firestore       : ${firestoreIds.size.toLocaleString()}`);
  log(`Total in podcasts-lite   : ${jsonIds.size.toLocaleString()}`);
  log(`To delete (not in JSON)  : ${toDelete.length.toLocaleString()}`, toDelete.length > 0 ? 'WARN' : 'SUCCESS');

  if (toDelete.length === 0) {
    log('Firestore is already in sync with podcasts-lite.json. Nothing to delete.', 'SUCCESS');
    process.exit(0);
  }

  if (DRY_RUN) {
    log(`[DRY-RUN] Would delete ${toDelete.length.toLocaleString()} documents. Re-run with --confirm to proceed.`, 'WARN');
    process.exit(0);
  }

  console.log('');
  log(`Deleting ${toDelete.length.toLocaleString()} documents in batches of ${BATCH_SIZE}...`, 'PHASE');
  await deleteIds(toDelete);

  console.log('');
  console.log('='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Firestore before : ${firestoreIds.size.toLocaleString()}`);
  console.log(`  podcasts-lite    : ${jsonIds.size.toLocaleString()}`);
  console.log(`  Deleted          : ${toDelete.length.toLocaleString()}`);
  console.log(`  Firestore after  : ${(firestoreIds.size - toDelete.length).toLocaleString()}`);
  console.log('='.repeat(72));
  log('Cleanup complete.', 'SUCCESS');
  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
