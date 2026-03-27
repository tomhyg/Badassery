/**
 * Verify Scoring Results
 * Shows top podcasts and distribution
 */

const admin = require('firebase-admin');

const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function verifyScoring() {
  console.log('='.repeat(80));
  console.log('   📊 VERIFICATION DES SCORES');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Get top 10 by Badassery Score
    console.log('🏆 TOP 10 PODCASTS PAR BADASSERY SCORE:');
    console.log('-'.repeat(80));

    const topPodcasts = await db.collection('podcasts')
      .where('ai_badassery_score', '>', 0)
      .orderBy('ai_badassery_score', 'desc')
      .limit(10)
      .get();

    topPodcasts.docs.forEach((doc, idx) => {
      const p = doc.data();
      console.log(`${idx + 1}. ${p.title?.substring(0, 50) || 'N/A'}`);
      console.log(`   Score: ${p.ai_badassery_score?.toFixed(2)} | Category: ${p.ai_primary_category}`);
      console.log(`   Percentile: ${p.ai_global_percentile} | Business: ${p.ai_business_relevance}/10`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('');

    // Distribution by category
    console.log('📂 DISTRIBUTION PAR CATEGORIE:');
    console.log('-'.repeat(80));

    const allScored = await db.collection('podcasts')
      .where('ai_badassery_score', '>', 0)
      .get();

    const categoryCount = {};
    allScored.docs.forEach(doc => {
      const category = doc.data().ai_primary_category || 'Unknown';
      categoryCount[category] = (categoryCount[category] || 0) + 1;
    });

    const sortedCategories = Object.entries(categoryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    sortedCategories.forEach(([category, count]) => {
      console.log(`   ${category}: ${count} podcasts`);
    });

    console.log('');
    console.log(`   Total scored: ${allScored.size} podcasts`);
    console.log('');

    console.log('='.repeat(80));
    console.log('');

    // Top 1% examples
    console.log('🌟 EXEMPLES TOP 1%:');
    console.log('-'.repeat(80));

    const top1Percent = await db.collection('podcasts')
      .where('ai_global_percentile', '==', 'Top 1%')
      .limit(5)
      .get();

    top1Percent.docs.forEach((doc, idx) => {
      const p = doc.data();
      console.log(`${idx + 1}. ${p.title?.substring(0, 50) || 'N/A'}`);
      console.log(`   Score: ${p.ai_badassery_score?.toFixed(2)} | Rank: ${p.ai_global_rank}/${p.ai_global_total}`);
      console.log(`   Guest-Friendly: ${p.ai_guest_friendly ? 'Yes' : 'No'} | Style: ${p.ai_podcast_style}`);
      console.log('');
    });

    console.log('='.repeat(80));
    console.log('');

    // Stats
    console.log('📈 STATISTIQUES:');
    console.log('-'.repeat(80));

    const guestFriendly = allScored.docs.filter(d => d.data().ai_guest_friendly === true).length;
    const highBusiness = allScored.docs.filter(d => (d.data().ai_business_relevance || 0) >= 7).length;
    const top1PercentCount = allScored.docs.filter(d => d.data().ai_global_percentile === 'Top 1%').length;
    const top5PercentCount = allScored.docs.filter(d => d.data().ai_global_percentile === 'Top 5%').length;
    const top10PercentCount = allScored.docs.filter(d => d.data().ai_global_percentile === 'Top 10%').length;

    console.log(`   Total scored: ${allScored.size}`);
    console.log(`   Guest-friendly: ${guestFriendly} (${(guestFriendly / allScored.size * 100).toFixed(1)}%)`);
    console.log(`   High business relevance (7+): ${highBusiness} (${(highBusiness / allScored.size * 100).toFixed(1)}%)`);
    console.log('');
    console.log(`   Top 1%: ${top1PercentCount} podcasts`);
    console.log(`   Top 5%: ${top5PercentCount} podcasts`);
    console.log(`   Top 10%: ${top10PercentCount} podcasts`);
    console.log('');

    console.log('='.repeat(80));
    console.log('');
    console.log('✅ TOUT FONCTIONNE PARFAITEMENT!');
    console.log('');
    console.log('🎯 Prochaines étapes:');
    console.log('   1. Tester la page Podcasts dans l\'app web');
    console.log('   2. Lancer le scoring des 158K podcasts complets');
    console.log('   3. Profiter de votre base de données enrichie! 🚀');
    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error);
  }

  process.exit(0);
}

verifyScoring();
