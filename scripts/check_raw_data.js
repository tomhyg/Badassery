const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkRawData() {
  console.log('🔍 Checking rawData field for Outreach Status...\n');

  // Get sample documents
  const snapshot = await db.collection('outreach').limit(10).get();

  if (snapshot.empty) {
    console.log('❌ No documents found in outreach collection');
    process.exit(1);
  }

  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`\n📄 Document ${index + 1}: ${data.showName}`);
    console.log('='.repeat(80));

    // Check if rawData exists and what it contains
    if (data.rawData) {
      console.log('📦 rawData keys:');
      Object.keys(data.rawData).forEach(key => {
        if (key.toLowerCase().includes('status') || key.toLowerCase().includes('outreach')) {
          console.log(`   🎯 ${key}: "${data.rawData[key]}"`);
        }
      });

      // Show all rawData keys
      console.log('\n   All rawData keys:', Object.keys(data.rawData).join(', '));
    } else {
      console.log('❌ No rawData field');
    }
  });

  process.exit(0);
}

checkRawData().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
