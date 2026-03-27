/**
 * READ-ONLY script: list all distinct ai_primary_category values with counts
 * No writes, no modifications.
 */

const admin = require('firebase-admin');
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

async function listCategories() {
  console.log('Fetching all podcasts from Firestore (read-only)...\n');

  const categoryCounts = {};
  let total = 0;
  let noPrimaryCategory = 0;

  let lastDoc = null;
  const BATCH = 500;

  while (true) {
    let query = db.collection('podcasts').select('ai_primary_category').limit(BATCH);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    snap.forEach(doc => {
      total++;
      const cat = doc.data().ai_primary_category;
      if (!cat || cat.trim() === '') {
        noPrimaryCategory++;
      } else {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
      }
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.size < BATCH) break;

    process.stdout.write(`\r  Processed: ${total} podcasts...`);
  }

  console.log(`\n\nTotal podcasts scanned: ${total}`);
  console.log(`Without ai_primary_category: ${noPrimaryCategory}\n`);

  const sorted = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

  console.log('='.repeat(65));
  console.log('  ai_primary_category  |  Count');
  console.log('='.repeat(65));
  sorted.forEach(([cat, count]) => {
    console.log(`  ${cat.padEnd(45)} | ${count}`);
  });
  console.log('='.repeat(65));
  console.log(`  Total distinct categories: ${sorted.length}`);

  process.exit(0);
}

listCategories().catch(err => { console.error(err); process.exit(1); });
