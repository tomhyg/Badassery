/**
 * Check podcast scoring status
 */

const admin = require('firebase-admin');
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

async function checkStatus() {
  console.log('='.repeat(80));
  console.log('   📊 PODCAST SCORING STATUS CHECK');
  console.log('='.repeat(80));
  console.log('');

  try {
    // Total podcasts
    console.log('📂 Fetching podcast statistics...\n');

    const allSnapshot = await db.collection('podcasts').count().get();
    const total = allSnapshot.data().count;

    console.log(`Total podcasts in database: ${total.toLocaleString()}`);
    console.log('');

    // Count by status
    const statuses = ['completed', 'failed', 'pending'];
    const statusCounts = {};

    for (const status of statuses) {
      const snapshot = await db.collection('podcasts')
        .where('aiCategorizationStatus', '==', status)
        .count()
        .get();
      statusCounts[status] = snapshot.data().count;
    }

    // Podcasts without status field
    const noStatusSnapshot = await db.collection('podcasts')
      .where('aiCategorizationStatus', '==', null)
      .count()
      .get();
    const noStatus = noStatusSnapshot.data().count;

    console.log('Status breakdown:');
    console.log(`  ✅ Completed: ${statusCounts.completed.toLocaleString()}`);
    console.log(`  ❌ Failed:    ${statusCounts.failed.toLocaleString()}`);
    console.log(`  ⏳ Pending:   ${statusCounts.pending.toLocaleString()}`);
    console.log(`  ❓ No status: ${noStatus.toLocaleString()}`);
    console.log('');

    const toProcess = total - statusCounts.completed;
    console.log(`📊 Podcasts to process: ${toProcess.toLocaleString()}`);
    console.log('');

    // Sample completed podcast
    if (statusCounts.completed > 0) {
      console.log('='.repeat(80));
      console.log('📋 Sample completed podcast (with AI scores):');
      console.log('='.repeat(80));
      console.log('');

      const sampleSnapshot = await db.collection('podcasts')
        .where('aiCategorizationStatus', '==', 'completed')
        .limit(1)
        .get();

      if (!sampleSnapshot.empty) {
        const podcast = { ...sampleSnapshot.docs[0].data(), id: sampleSnapshot.docs[0].id };

        console.log(`Title: ${podcast.title || 'N/A'}`);
        console.log(`iTunes ID: ${podcast.id}`);
        console.log('');
        console.log('AI Scores:');
        console.log(`  • Badassery Score: ${podcast.ai_badassery_score || 'N/A'}/100`);
        console.log(`  • Global Percentile: ${podcast.ai_global_percentile || 'N/A'}`);
        console.log(`  • Category Percentile: ${podcast.ai_category_percentile || 'N/A'}`);
        console.log(`  • Primary Category: ${podcast.ai_primary_category || 'N/A'}`);
        console.log(`  • Engagement Level: ${podcast.ai_engagement_level || 'N/A'}/10`);
        console.log(`  • Audience Size: ${podcast.ai_audience_size || 'N/A'}`);
        console.log(`  • Business Relevance: ${podcast.ai_business_relevance || 'N/A'}/10`);
        console.log(`  • Guest Friendly: ${podcast.ai_guest_friendly ? 'Yes' : 'No'}`);
        console.log('');
      }
    }

    // Sample uncompleted podcast
    if (toProcess > 0) {
      console.log('='.repeat(80));
      console.log('📋 Sample podcast to process (without scores):');
      console.log('='.repeat(80));
      console.log('');

      const uncompletedSnapshot = await db.collection('podcasts')
        .where('aiCategorizationStatus', '!=', 'completed')
        .limit(1)
        .get();

      if (!uncompletedSnapshot.empty) {
        const podcast = { ...uncompletedSnapshot.docs[0].data(), id: uncompletedSnapshot.docs[0].id };

        console.log(`Title: ${podcast.title || 'N/A'}`);
        console.log(`iTunes ID: ${podcast.id}`);
        console.log(`Episodes: ${podcast.episodeCount || 0}`);
        console.log(`Apple Rating: ${podcast.apple_rating || 'N/A'}`);
        console.log(`YT Subscribers: ${(podcast.yt_subscribers || 0).toLocaleString()}`);
        console.log(`Status: ${podcast.aiCategorizationStatus || 'Not set'}`);
        console.log('');
      }
    }

    console.log('='.repeat(80));
    console.log('');
    console.log('🎯 Next steps:');

    if (toProcess === 0) {
      console.log('  ✅ All podcasts are already scored!');
      console.log('  📊 You can now work on the UI integration.');
      console.log('');
      console.log('  Options:');
      console.log('    A. View scored podcasts in Firestore Console');
      console.log('    B. Start UI integration (display scores, filters)');
      console.log('    C. Re-score specific podcasts (reset status to null)');
    } else {
      console.log(`  ⏳ ${toProcess.toLocaleString()} podcasts need scoring`);
      console.log('  🚀 Run: LANCER_PARALLEL.bat → Option 1');
    }

    console.log('');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }

  process.exit(0);
}

checkStatus();
