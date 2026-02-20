/**
 * Diagnostic: Check ai_badassery_score values
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function diagnoseScores() {
  console.log('🔍 Diagnosing ai_badassery_score values...\n');

  // Sample 1000 podcasts
  const snapshot = await db.collection('podcasts')
    .orderBy('updatedAt', 'asc')
    .limit(1000)
    .get();

  const stats = {
    undefined: 0,
    null: 0,
    zero: 0,
    positive: 0,
    total: 0
  };

  const scores = [];

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const score = data.ai_badassery_score;

    stats.total++;

    if (score === undefined) {
      stats.undefined++;
    } else if (score === null) {
      stats.null++;
    } else if (score === 0) {
      stats.zero++;
    } else {
      stats.positive++;
      scores.push(score);
    }
  });

  console.log('📊 Sample of 1000 podcasts (oldest first):');
  console.log(`   - undefined: ${stats.undefined}`);
  console.log(`   - null: ${stats.null}`);
  console.log(`   - 0 (zero): ${stats.zero}`);
  console.log(`   - > 0: ${stats.positive}`);
  console.log(`   - Total: ${stats.total}\n`);

  if (scores.length > 0) {
    console.log(`📈 Positive scores: min=${Math.min(...scores).toFixed(1)}, max=${Math.max(...scores).toFixed(1)}, avg=${(scores.reduce((a,b) => a+b, 0) / scores.length).toFixed(1)}\n`);
  }

  // Check a few specific docs
  console.log('🔍 Checking first 3 docs in detail:');
  for (let i = 0; i < Math.min(3, snapshot.docs.length); i++) {
    const doc = snapshot.docs[i];
    const data = doc.data();
    console.log(`\nDoc ${i+1}:`);
    console.log(`  ID: ${doc.id}`);
    console.log(`  title: ${data.title}`);
    console.log(`  ai_badassery_score: ${data.ai_badassery_score} (type: ${typeof data.ai_badassery_score})`);
    console.log(`  ai_primary_category: ${data.ai_primary_category || 'missing'}`);
    console.log(`  updatedAt: ${data.updatedAt?.toDate()}`);
  }

  console.log('\n✨ Done!');
  process.exit(0);
}

diagnoseScores().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
