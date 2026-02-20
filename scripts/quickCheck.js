/**
 * Quick check: How many podcasts have scores?
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function quickCheck() {
  console.log('🔍 Quick check...\n');

  try {
    // Count total
    const total = await db.collection('podcasts').count().get();
    console.log(`📊 Total podcasts: ${total.data().count.toLocaleString()}`);

    // Count with score
    const withScore = await db.collection('podcasts')
      .where('ai_badassery_score', '>', 0)
      .count()
      .get();
    console.log(`✅ With score: ${withScore.data().count.toLocaleString()}`);

    // Sample a few
    console.log('\n🔍 Sample of 5 scored podcasts:');
    const sample = await db.collection('podcasts')
      .where('ai_badassery_score', '>', 0)
      .orderBy('ai_badassery_score', 'desc')
      .limit(5)
      .get();

    sample.docs.forEach((doc, i) => {
      const data = doc.data();
      console.log(`\n${i + 1}. ${data.title}`);
      console.log(`   Score: ${data.ai_badassery_score?.toFixed(1)}`);
      console.log(`   Category: ${data.ai_primary_category || 'N/A'}`);
    });

  } catch (error) {
    console.error('Error:', error);
  }

  console.log('\n✨ Done!');
  process.exit(0);
}

quickCheck();
