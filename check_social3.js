const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
require('dotenv').config();
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const fields = ['website_instagram','website_twitter','website_facebook','website_linkedin','website_youtube','website_tiktok','rss_social_instagram','rss_social_twitter','rss_social_linkedin'];

Promise.all(fields.map(f =>
  db.collection('podcasts').where(f, '>', '').limit(1).get().then(s => ({ field: f, count: s.size, example: s.docs[0]?.data()[f] }))
)).then(results => {
  results.forEach(r => console.log(r.field + ': ' + (r.count > 0 ? 'EXISTS - ex: ' + r.example : 'EMPTY')));
  process.exit(0);
});
