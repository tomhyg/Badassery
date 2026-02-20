const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkFieldNames() {
  console.log('🔍 Checking field names in outreach collection...\n');

  // Get first 5 documents to see field names
  const snapshot = await db.collection('outreach').limit(5).get();

  if (snapshot.empty) {
    console.log('❌ No documents found in outreach collection');
    process.exit(1);
  }

  snapshot.docs.forEach((doc, index) => {
    const data = doc.data();
    console.log(`\n📄 Document ${index + 1} (ID: ${doc.id})`);
    console.log('=' .repeat(80));

    // Log ALL field names and their values
    Object.keys(data).forEach(key => {
      const value = data[key];

      // Special handling for status-related fields
      if (key.toLowerCase().includes('status')) {
        console.log(`\n🎯 STATUS FIELD FOUND:`);
        console.log(`   Field name: "${key}"`);
        console.log(`   Field value: "${value}"`);
        console.log(`   Type: ${typeof value}`);
      } else {
        // Log other fields more compactly
        const displayValue = typeof value === 'string'
          ? (value.length > 50 ? value.substring(0, 50) + '...' : value)
          : typeof value === 'object'
          ? JSON.stringify(value).substring(0, 50) + '...'
          : value;
        console.log(`   ${key}: ${displayValue}`);
      }
    });
  });

  console.log('\n\n' + '='.repeat(80));
  console.log('🔑 All unique field names across documents:');
  console.log('='.repeat(80));

  const allFieldNames = new Set();
  snapshot.docs.forEach(doc => {
    Object.keys(doc.data()).forEach(key => allFieldNames.add(key));
  });

  Array.from(allFieldNames).sort().forEach(fieldName => {
    console.log(`  - "${fieldName}"`);
  });

  process.exit(0);
}

checkFieldNames().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
