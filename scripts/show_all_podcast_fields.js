const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function showAllPodcastFields() {
  console.log('🎙️ Analyzing podcast data structure...\n');

  // Get one document with the most fields
  const snapshot = await db.collection('outreach').limit(10).get();

  if (snapshot.empty) {
    console.log('❌ No documents found in outreach collection');
    process.exit(1);
  }

  // Collect all unique field names across all documents
  const allFields = new Set();
  const allRawDataFields = new Set();
  let sampleDoc = null;
  let maxFieldCount = 0;

  snapshot.docs.forEach(doc => {
    const data = doc.data();

    // Collect top-level fields
    Object.keys(data).forEach(key => {
      allFields.add(key);
    });

    // Collect rawData fields
    if (data.rawData) {
      Object.keys(data.rawData).forEach(key => {
        allRawDataFields.add(key);
      });

      // Keep track of document with most fields
      const fieldCount = Object.keys(data.rawData).length;
      if (fieldCount > maxFieldCount) {
        maxFieldCount = fieldCount;
        sampleDoc = { id: doc.id, data };
      }
    }
  });

  console.log('=' .repeat(80));
  console.log('📋 TOP-LEVEL FIELDS IN FIRESTORE');
  console.log('=' .repeat(80));

  const sortedFields = Array.from(allFields).sort();
  sortedFields.forEach(field => {
    console.log(`  ✓ ${field}`);
  });

  console.log('\n' + '=' .repeat(80));
  console.log('📦 FIELDS AVAILABLE IN rawData (from CSV)');
  console.log('=' .repeat(80));

  const sortedRawFields = Array.from(allRawDataFields).sort();
  sortedRawFields.forEach(field => {
    console.log(`  ✓ ${field}`);
  });

  if (sampleDoc) {
    console.log('\n' + '=' .repeat(80));
    console.log(`📄 EXAMPLE PODCAST: ${sampleDoc.data.showName}`);
    console.log('=' .repeat(80));

    console.log('\n🔹 Top-level Data:');
    console.log(JSON.stringify({
      id: sampleDoc.id,
      showName: sampleDoc.data.showName,
      itunesId: sampleDoc.data.itunesId,
      clientName: sampleDoc.data.clientName,
      status: sampleDoc.data.status,
      'Outreach Status': sampleDoc.data['Outreach Status'],
      hostContactInfo: sampleDoc.data.hostContactInfo,
      needsManualReview: sampleDoc.data.needsManualReview
    }, null, 2));

    console.log('\n🔹 Sample rawData fields (first 10):');
    const rawDataKeys = Object.keys(sampleDoc.data.rawData).slice(0, 10);
    const sampleRawData = {};
    rawDataKeys.forEach(key => {
      const value = sampleDoc.data.rawData[key];
      sampleRawData[key] = typeof value === 'string' && value.length > 100
        ? value.substring(0, 100) + '...'
        : value;
    });
    console.log(JSON.stringify(sampleRawData, null, 2));
  }

  console.log('\n' + '=' .repeat(80));
  console.log('📊 SUMMARY');
  console.log('=' .repeat(80));
  console.log(`  Top-level fields: ${allFields.size}`);
  console.log(`  rawData fields: ${allRawDataFields.size}`);
  console.log(`  Total unique fields: ${allFields.size + allRawDataFields.size}`);

  process.exit(0);
}

showAllPodcastFields().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
