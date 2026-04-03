'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

async function nukeCollection(collectionName) {
  const col = db.collection(collectionName);
  let total = 0;

  while (true) {
    const snap = await col.limit(400).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    total += snap.docs.length;
    process.stdout.write(`\r  Deleted ${total} docs...`);
  }

  process.stdout.write(`\n`);
  console.log(`Done — ${total} documents deleted from "${collectionName}"`);
}

nukeCollection('podcasts').catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
