const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
require('dotenv').config();
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
// Find podcasts that have any social/website fields filled
db.collection('podcasts').where('rss_social_twitter', '>', '').limit(3).get().then(snap => {
  console.log('With rss_social_twitter:', snap.size);
  snap.docs.forEach(doc => {
    const d = doc.data();
    const keys = Object.keys(d).filter(k => k.includes('social') || k.includes('website_') );
    console.log('  ' + d.title);
    keys.forEach(k => { if(d[k]) console.log('    ' + k + ': ' + d[k]); });
  });
  return db.collection('podcasts').where('website_instagram', '>', '').limit(3).get();
}).then(snap => {
  console.log('\nWith website_instagram:', snap.size);
  snap.docs.forEach(doc => {
    const d = doc.data();
    console.log('  ' + d.title + ' | instagram: ' + d.website_instagram);
  });
  process.exit(0);
});
