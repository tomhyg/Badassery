'use strict';

/**
 * normalize_apple_rating.js — Unify apple_rating_scraped → apple_rating
 *
 * Background: the Python enricher wrote apple_rating as "apple_rating_scraped"
 * on some docs and "apple_rating" on others. This script standardises to
 * "apple_rating" everywhere and removes the old field.
 *
 * Logic per doc that has apple_rating_scraped:
 *   - If apple_rating is undefined or null → set apple_rating = apple_rating_scraped
 *   - Always delete apple_rating_scraped (FieldValue.delete())
 *
 * Usage:
 *   node scripts/normalize_apple_rating.js              # dry-run (default)
 *   node scripts/normalize_apple_rating.js --confirm    # write to Firestore
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('firebase-admin');

const DRY_RUN    = !process.argv.includes('--confirm');
const BATCH_SIZE = 400;

const serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

async function main() {
  const startTime = Date.now();

  console.log('='.repeat(72));
  console.log('  🍎  NORMALIZE apple_rating_scraped → apple_rating');
  console.log('='.repeat(72));
  if (DRY_RUN) {
    console.log('  ⚠️  DRY-RUN mode — Firestore will NOT be updated.');
    console.log('      Run with --confirm to apply changes.');
  } else {
    console.log('  🔴  LIVE mode — Firestore documents WILL be updated.');
  }
  console.log('='.repeat(72) + '\n');

  let lastDoc   = null;
  let totalSeen = 0;
  let normalized = 0;  // had apple_rating_scraped, apple_rating was missing/null → copied
  let skipped   = 0;   // had apple_rating_scraped but apple_rating already present

  // Paginate docs that have apple_rating_scraped
  while (true) {
    let q = db.collection('podcasts')
      .where('apple_rating_scraped', '>', 0)
      .select('apple_rating_scraped', 'apple_rating')
      .limit(1000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    // Collect docs to write in this page
    const toWrite = [];
    for (const doc of snap.docs) {
      const d = doc.data();
      const scraped  = d.apple_rating_scraped;
      const existing = d.apple_rating;

      if (existing == null) {
        // Copy scraped → apple_rating, delete old field
        toWrite.push({ ref: doc.ref, scraped, action: 'copy+delete' });
        normalized++;
      } else {
        // apple_rating already has a value — just delete the duplicate scraped field
        toWrite.push({ ref: doc.ref, scraped: null, action: 'delete-only' });
        skipped++;
      }
    }

    totalSeen += snap.docs.length;
    lastDoc = snap.docs[snap.docs.length - 1];

    process.stdout.write(`\r  Scanned ${totalSeen} docs (normalized: ${normalized}, skipped: ${skipped})...`);

    if (!DRY_RUN && toWrite.length > 0) {
      // Write in sub-batches of BATCH_SIZE
      for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
        const chunk = toWrite.slice(i, i + BATCH_SIZE);
        const batch = db.batch();
        for (const item of chunk) {
          const update = { apple_rating_scraped: admin.firestore.FieldValue.delete() };
          if (item.action === 'copy+delete') {
            update.apple_rating = item.scraped;
          }
          batch.update(item.ref, update);
        }
        await batch.commit();
      }
    }

    if (snap.docs.length < 1000) break;
  }

  process.stdout.write('\n');

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Docs with apple_rating_scraped : ${totalSeen.toLocaleString()}`);
  console.log(`  Normalized (copied + deleted)  : ${normalized.toLocaleString()}`);
  console.log(`  Skipped (apple_rating existed) : ${skipped.toLocaleString()}`);
  console.log(`  Firestore writes               : ${DRY_RUN ? '0 (dry-run)' : totalSeen.toLocaleString()}`);
  console.log(`  Total time                     : ${elapsed}s`);
  console.log('='.repeat(72));

  process.exit(0);
}

main().catch(err => {
  log(`Fatal: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
