const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

// Check if already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

/**
 * Delete all documents in a collection
 * Firestore doesn't allow deleting a collection directly, must delete documents
 */
async function deleteCollection(collectionPath, batchSize = 500) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(db, query, resolve, reject);
  });
}

async function deleteQueryBatch(db, query, resolve, reject) {
  try {
    const snapshot = await query.get();

    if (snapshot.size === 0) {
      resolve();
      return;
    }

    console.log(`🗑️  Deleting ${snapshot.size} documents...`);

    // Delete documents in a batch
    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    // Recurse on the next process tick to avoid exploding the stack
    process.nextTick(() => {
      deleteQueryBatch(db, query, resolve, reject);
    });
  } catch (error) {
    reject(error);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🚨 WARNING: This will delete ALL documents in the "outreach" collection!');
  console.log('⏳ Starting deletion in 3 seconds...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  console.log('🔄 Deleting outreach collection...\n');

  await deleteCollection('outreach');

  console.log('\n✅ All documents deleted from "outreach" collection!');
  console.log('📍 You can now run the import script to re-import all data.');

  process.exit(0);
}

main().catch(error => {
  console.error('💥 Error:', error);
  process.exit(1);
});
