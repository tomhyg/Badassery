/**
 * Count podcasts correctly
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function countCorrectly() {
  console.log('🔍 Counting podcasts correctly...\n');

  // Total count
  const totalSnapshot = await db.collection('podcasts').count().get();
  const total = totalSnapshot.data().count;
  console.log(`📊 Total podcasts: ${total.toLocaleString()}`);

  // Count with ai_badassery_score != null
  const withScoreSnapshot = await db.collection('podcasts')
    .where('ai_badassery_score', '!=', null)
    .count()
    .get();
  const withScore = withScoreSnapshot.data().count;
  console.log(`✅ With ai_badassery_score != null: ${withScore.toLocaleString()}`);

  // Count with ai_badassery_score > 0
  try {
    const withPositiveScoreSnapshot = await db.collection('podcasts')
      .where('ai_badassery_score', '>', 0)
      .count()
      .get();
    const withPositiveScore = withPositiveScoreSnapshot.data().count;
    console.log(`✅ With ai_badassery_score > 0: ${withPositiveScore.toLocaleString()}`);
  } catch (error) {
    console.log(`⚠️  Cannot count ai_badassery_score > 0 (may need index)`);
  }

  // Calculate missing
  const missing = total - withScore;
  console.log(`\n❌ Missing ai_badassery_score: ${missing.toLocaleString()}`);
  console.log(`📈 Categorization rate: ${((withScore / total) * 100).toFixed(2)}%`);

  // Sample to understand the difference
  console.log('\n🔍 Sampling 5000 podcasts to understand the data...');
  const sampleSnapshot = await db.collection('podcasts')
    .orderBy('updatedAt', 'asc')
    .limit(5000)
    .get();

  const sampleStats = {
    undefined: 0,
    null: 0,
    zero: 0,
    positive: 0
  };

  sampleSnapshot.docs.forEach(doc => {
    const score = doc.data().ai_badassery_score;
    if (score === undefined) sampleStats.undefined++;
    else if (score === null) sampleStats.null++;
    else if (score === 0) sampleStats.zero++;
    else sampleStats.positive++;
  });

  console.log(`\n📊 In sample of 5000 (oldest):`);
  console.log(`   - undefined: ${sampleStats.undefined}`);
  console.log(`   - null: ${sampleStats.null}`);
  console.log(`   - 0: ${sampleStats.zero}`);
  console.log(`   - > 0: ${sampleStats.positive}`);

  const uncategorizedInSample = sampleStats.undefined + sampleStats.null + sampleStats.zero;
  console.log(`\n📈 Estimated total uncategorized (if same ratio):`);
  console.log(`   ${Math.round((uncategorizedInSample / 5000) * total).toLocaleString()}`);

  console.log('\n✨ Done!');
  process.exit(0);
}

countCorrectly().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
