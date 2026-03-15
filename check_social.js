const admin = require('firebase-admin');
const sa = require('./serviceAccountKey.json');
require('dotenv').config();
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
db.collection('podcasts').limit(5).get().then(snap => {
  snap.docs.forEach(doc => {
    const d = doc.data();
    const socialKeys = Object.keys(d).filter(k =>
      k.includes('social') || k.includes('twitter') || k.includes('instagram') ||
      k.includes('linkedin') || k.includes('facebook') || k.includes('tiktok') || k.includes('youtube')
    );
    console.log('--- ' + d.title);
    socialKeys.forEach(k => { if(d[k]) console.log('  ' + k + ': ' + d[k]); });
  });
  process.exit(0);
});
