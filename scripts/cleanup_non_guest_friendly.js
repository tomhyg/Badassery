'use strict';

/**
 * cleanup_non_guest_friendly.js
 *
 * Deletes all Firestore podcasts where ai_guest_friendly === false.
 *
 * Usage:
 *   node scripts/cleanup_non_guest_friendly.js --dry-run          # Preview only (default)
 *   node scripts/cleanup_non_guest_friendly.js --dry-run --confirm # Same as above
 *   node scripts/cleanup_non_guest_friendly.js --confirm           # REAL deletion
 *
 * Flags:
 *   --dry-run   Print what would be deleted without deleting (DEFAULT if omitted)
 *   --confirm   Required for real deletion; without it the script aborts
 */

require('dotenv').config();
const admin = require('firebase-admin');
const path  = require('path');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || !args.includes('--confirm');
const CONFIRM = args.includes('--confirm');

if (!CONFIRM) {
  console.log('⚠️  DRY-RUN MODE — pass --confirm to perform real deletions.\n');
}

// ── Config ────────────────────────────────────────────────────────────────────

const BATCH_SIZE       = 400; // Firestore max per commit is 500; stay under
const LOG_INTERVAL     = 1000; // Log progress every N deletions

// ── Firebase init ─────────────────────────────────────────────────────────────

const saPath = path.join(__dirname, '../serviceAccountKey.json');
admin.initializeApp({ credential: admin.credential.cert(require(saPath)) });
const db = admin.firestore();

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================================================');
  console.log('  🗑️   CLEANUP — ai_guest_friendly === false');
  console.log('========================================================================');
  console.log(`  Mode     : ${DRY_RUN ? '⚠️  DRY-RUN (no writes)' : '🔴 LIVE DELETION'}`);
  console.log(`  Batch    : ${BATCH_SIZE}`);
  console.log(`  Log every: ${LOG_INTERVAL} deletions`);
  console.log('========================================================================\n');

  // Count first so we know what we're dealing with
  const countSnap = await db.collection('podcasts')
    .where('ai_guest_friendly', '==', false)
    .count()
    .get();
  const total = countSnap.data().count;

  console.log(`📊  Documents to delete: ${total.toLocaleString()}\n`);

  if (total === 0) {
    console.log('✅  Nothing to delete. Exiting.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log(`✅  Dry-run complete. Would have deleted ${total.toLocaleString()} documents.`);
    console.log('    Run with --confirm (and without --dry-run) to perform real deletions.');
    process.exit(0);
  }

  // ── Real deletion ─────────────────────────────────────────────────────────

  let deleted   = 0;
  let lastCursor = null;

  console.log('🚀  Starting deletion...\n');

  while (true) {
    let query = db.collection('podcasts')
      .where('ai_guest_friendly', '==', false)
      .limit(BATCH_SIZE);

    if (lastCursor) {
      query = query.startAfter(lastCursor);
    }

    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    deleted += snap.docs.length;
    lastCursor = snap.docs[snap.docs.length - 1];

    if (deleted % LOG_INTERVAL < BATCH_SIZE || snap.docs.length < BATCH_SIZE) {
      console.log(`  Deleted ${deleted.toLocaleString()} / ${total.toLocaleString()} (${(deleted/total*100).toFixed(1)}%)`);
    }

    // Safety: stop if we somehow overshoot
    if (snap.docs.length < BATCH_SIZE) break;
  }

  console.log(`\n✅  Done. Deleted ${deleted.toLocaleString()} documents.`);
  process.exit(0);
}

main().catch(err => {
  console.error('❌  Fatal error:', err);
  process.exit(1);
});
