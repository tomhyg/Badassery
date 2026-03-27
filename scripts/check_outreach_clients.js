const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkOutreachClients() {
  console.log('📊 Checking outreach data and client IDs...\n');

  // Get sample outreach documents
  const outreachSnapshot = await db.collection('outreach').limit(10).get();

  console.log('Sample Outreach Documents:');
  console.log('='.repeat(80));

  const clientIds = new Set();
  outreachSnapshot.docs.forEach(doc => {
    const data = doc.data();
    clientIds.add(data.clientId);
    console.log(`Show: ${data.showName}`);
    console.log(`  Client ID: ${data.clientId}`);
    console.log(`  Client Name: ${data.clientName}`);
    console.log('');
  });

  console.log('\n' + '='.repeat(80));
  console.log('Unique Client IDs in Outreach:');
  console.log('='.repeat(80));
  clientIds.forEach(id => console.log(`  - ${id}`));

  // Now check what client IDs actually exist in clients collection
  console.log('\n' + '='.repeat(80));
  console.log('Checking Clients Collection:');
  console.log('='.repeat(80));

  const clientsSnapshot = await db.collection('clients').get();
  console.log(`Total clients in collection: ${clientsSnapshot.size}\n`);

  clientsSnapshot.docs.forEach(doc => {
    const data = doc.data();
    const firstName = data.identity?.firstName || '';
    const lastName = data.identity?.lastName || '';
    console.log(`ID: ${doc.id} | Name: ${firstName} ${lastName}`);
  });

  // Check which outreach clientIds match actual client IDs
  console.log('\n' + '='.repeat(80));
  console.log('Matching Analysis:');
  console.log('='.repeat(80));

  for (const clientId of clientIds) {
    const exists = clientsSnapshot.docs.some(doc => doc.id === clientId);
    console.log(`${clientId}: ${exists ? '✅ EXISTS' : '❌ NOT FOUND'}`);
  }

  process.exit(0);
}

checkOutreachClients().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
