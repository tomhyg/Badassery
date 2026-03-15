/**
 * TEMPORARY VERSION - Works without Firestore index
 * Use this while the index is building
 *
 * Simplified query that doesn't require composite index
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Firebase
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4');
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

console.log('='.repeat(80));
console.log('   ⚡ TEMPORARY SCRIPT - No Index Required');
console.log('='.repeat(80));
console.log('');
console.log('This version uses a simplified query while the index is building.');
console.log('Will process 10 podcasts as a test.');
console.log('');

async function testGeminiConnection() {
  try {
    console.log('🔍 Testing Gemini API connection...');

    const result = await model.generateContent('Say "OK" if you can hear me.');
    const response = await result.response;
    const text = response.text();

    console.log('✅ Gemini API working!');
    console.log(`   Response: ${text.substring(0, 50)}...\n`);
    return true;
  } catch (error) {
    console.log('❌ Gemini API error:', error.message);
    return false;
  }
}

async function fetchPodcastsSimple() {
  try {
    console.log('📂 Fetching podcasts (simplified query - no index needed)...');

    // SIMPLIFIED QUERY - No composite index needed
    const snapshot = await db.collection('podcasts')
      .orderBy('updatedAt', 'desc')  // Single orderBy = no composite index
      .limit(10)
      .get();

    const podcasts = snapshot.docs.map(doc => ({
      ...doc.data(),
      itunesId: doc.id
    }));

    // Filter in memory (no Firestore filter needed)
    const uncompleted = podcasts.filter(p =>
      !p.aiCategorizationStatus || p.aiCategorizationStatus !== 'completed'
    );

    console.log(`✅ Found ${podcasts.length} total podcasts`);
    console.log(`✅ ${uncompleted.length} need processing\n`);

    return uncompleted.slice(0, 10);

  } catch (error) {
    console.log('❌ Error fetching podcasts:', error.message);
    throw error;
  }
}

async function showPodcastSample(podcasts) {
  console.log('📋 Sample podcasts to process:');
  console.log('='.repeat(80));

  podcasts.slice(0, 5).forEach((p, i) => {
    console.log(`\n${i + 1}. ${p.title || 'Untitled'}`);
    console.log(`   iTunes ID: ${p.itunesId}`);
    console.log(`   Episodes: ${p.episodeCount || 0}`);
    console.log(`   Apple Rating: ${p.apple_rating || 'N/A'}`);
    console.log(`   YT Subs: ${(p.yt_subscribers || 0).toLocaleString()}`);
  });

  console.log('\n' + '='.repeat(80));
  console.log('');
}

async function checkIndexStatus() {
  console.log('📊 Index Status Check:');
  console.log('='.repeat(80));
  console.log('');
  console.log('The composite index is being created. To check status:');
  console.log('');
  console.log('1. Go to Firebase Console → Firestore → Indexes');
  console.log('2. Look for index on "podcasts" collection');
  console.log('3. Status should be:');
  console.log('   • Building... (5-10 minutes) ⏳');
  console.log('   • Enabled (ready!) ✅');
  console.log('');
  console.log('Once enabled, you can use the full parallel script:');
  console.log('   node scripts/parallel_scoring_v2.js --limit=1000');
  console.log('');
  console.log('='.repeat(80));
  console.log('');
}

async function main() {
  try {
    // Test Gemini
    const geminiOk = await testGeminiConnection();
    if (!geminiOk) {
      console.log('⚠️  Gemini API not working. Check your API key.');
      process.exit(1);
    }

    // Fetch podcasts (simple query)
    const podcasts = await fetchPodcastsSimple();

    if (podcasts.length === 0) {
      console.log('⚠️  No podcasts found that need processing.');
      console.log('   All podcasts may already be completed!');
      process.exit(0);
    }

    // Show sample
    await showPodcastSample(podcasts);

    // Show index status info
    await checkIndexStatus();

    console.log('✅ VALIDATION COMPLETE!\n');
    console.log('Summary:');
    console.log(`  • Gemini API: Working ✅`);
    console.log(`  • Firestore: Connected ✅`);
    console.log(`  • Podcasts available: ${podcasts.length} ✅`);
    console.log('');
    console.log('🎯 Next steps:');
    console.log('  1. Wait for index to finish building (5-10 min)');
    console.log('  2. Check index status in Firebase Console');
    console.log('  3. Once enabled, run: LANCER_PARALLEL.bat → Option 1');
    console.log('');

  } catch (error) {
    console.log('\n❌ Error:', error.message);
    console.log('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  }
}

main();
