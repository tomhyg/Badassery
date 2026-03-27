const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function migrateOutreachStatus() {
  console.log('🚀 Starting migration of Outreach Status from rawData to top-level field...\n');

  // Get all outreach documents
  const snapshot = await db.collection('outreach').get();

  console.log(`📊 Found ${snapshot.size} documents to process\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;

  let batch = db.batch();
  let batchCount = 0;
  const BATCH_SIZE = 500;

  for (const doc of snapshot.docs) {
    const data = doc.data();

    // Check if Outreach Status exists in rawData
    const outreachStatus = data.rawData?.['Outreach Status'];

    if (outreachStatus && outreachStatus.trim() !== '') {
      // Add to batch update
      batch.update(doc.ref, {
        'Outreach Status': outreachStatus,
        updatedAt: admin.firestore.Timestamp.now()
      });

      batchCount++;
      updated++;

      console.log(`✅ ${updated}. ${data.showName}: "${outreachStatus}"`);

      // Commit batch if we hit the size limit
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        console.log(`\n💾 Committed batch of ${batchCount} updates\n`);
        // Create new batch for next set
        batch = db.batch();
        batchCount = 0;
      }
    } else {
      skipped++;
      console.log(`⏭️  Skipped ${data.showName} (no Outreach Status in rawData)`);
    }
  }

  // Commit any remaining updates
  if (batchCount > 0) {
    await batch.commit();
    console.log(`\n💾 Committed final batch of ${batchCount} updates\n`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('📈 Migration Summary:');
  console.log('='.repeat(80));
  console.log(`✅ Updated: ${updated}`);
  console.log(`⏭️  Skipped: ${skipped}`);
  console.log(`❌ Errors: ${errors}`);
  console.log(`📊 Total: ${snapshot.size}`);
  console.log('\n✨ Migration complete!');

  process.exit(0);
}

migrateOutreachStatus().catch(error => {
  console.error('❌ Migration error:', error);
  process.exit(1);
});
