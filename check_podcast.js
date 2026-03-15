const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
require('dotenv').config();
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// Find podcasts where rss_ep1_title is non-empty
db.collection('podcasts')
  .where('rss_ep1_title', '>', '')
  .limit(5).get().then(snap => {
    console.log('Podcasts with non-empty rss_ep1_title:', snap.size);
    snap.docs.forEach(doc => {
      const d = doc.data();
      console.log(doc.id, '|', d.title);
      for (let i = 1; i <= 3; i++) {
        if (d[`rss_ep${i}_title`]) console.log(`  ep${i}:`, d[`rss_ep${i}_title`].substring(0,80));
      }
    });
    process.exit(0);
  });
