const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'YOUR_API_KEY_HERE');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

// Configuration
const BATCH_SIZE = 10; // Process 10 podcasts at a time
const PAUSE_BETWEEN_BATCHES = 2000; // 2 seconds between batches (API rate limiting)
const MAX_PODCASTS_TO_PROCESS = 100; // Limit for testing (remove for full run)

function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${msg}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate AI categorization for a podcast
 */
async function categorizePodcast(podcast) {
  try {
    const prompt = `Analyze this podcast and provide categorization in JSON format.

Podcast Information:
- Title: ${podcast.title || 'N/A'}
- Description: ${(podcast.description || '').substring(0, 500)}
- Apple Genres: ${(podcast.apple_api_genres || []).join(', ') || 'N/A'}
- Language: ${podcast.language || 'N/A'}
- Episode Count: ${podcast.episodeCount || 0}
- Apple Rating: ${podcast.apple_rating || 'N/A'} (${podcast.apple_rating_count || 0} reviews)
- YouTube Subscribers: ${podcast.yt_subscribers || 0}

Recent Episodes:
${podcast.rss_ep1_title ? `- ${podcast.rss_ep1_title}` : ''}
${podcast.rss_ep2_title ? `- ${podcast.rss_ep2_title}` : ''}
${podcast.rss_ep3_title ? `- ${podcast.rss_ep3_title}` : ''}

Provide a JSON response with:
{
  "primaryCategory": "one of: Business, Technology, Health & Fitness, Education, Society & Culture, Comedy, News & Politics, Arts, Science, Sports, True Crime, Lifestyle, Entertainment, Other",
  "secondaryCategories": ["array of 1-3 additional relevant categories"],
  "topics": ["array of 3-5 specific topics covered, e.g., 'entrepreneurship', 'AI', 'mental health'"],
  "targetAudience": "brief description of target audience (20-50 words)",
  "podcastStyle": "one of: Interview, Solo Commentary, Panel Discussion, Storytelling, Educational, News & Analysis, Comedy, Documentary, Conversational, Other",
  "businessRelevance": 1-10 (how relevant is this podcast for B2B marketing/outreach),
  "guestFriendly": true/false (does this podcast regularly feature guests),
  "monetizationPotential": 1-10 (sponsorship potential based on audience size, engagement, niche),
  "contentQuality": 1-10 (based on production value, consistency, ratings),
  "audienceSize": "one of: Small (0-10K), Medium (10K-100K), Large (100K-500K), Very Large (500K+)",
  "engagementLevel": 1-10 (based on review count, subscriber ratio, update frequency),
  "aiSummary": "2-3 sentence summary of what makes this podcast unique"
}

Return ONLY valid JSON, no other text.`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from response (handle markdown code blocks)
    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const categorization = JSON.parse(jsonText);

    return {
      success: true,
      data: categorization
    };
  } catch (error) {
    log(`❌ Error categorizing podcast: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Process a batch of podcasts
 */
async function processBatch(podcasts) {
  const results = {
    processed: 0,
    failed: 0,
    skipped: 0
  };

  for (const podcast of podcasts) {
    try {
      // Skip if already categorized (optional - remove to re-categorize)
      if (podcast.aiCategorizationStatus === 'completed') {
        results.skipped++;
        continue;
      }

      // Skip if no description (not enough data to categorize)
      if (!podcast.description && !podcast.title) {
        results.skipped++;
        continue;
      }

      log(`\n🤖 Categorizing: ${podcast.title}`);

      const categorization = await categorizePodcast(podcast);

      if (categorization.success) {
        // Update Firestore with AI categorization
        const docRef = db.collection('podcasts').doc(podcast.itunesId);
        await docRef.update({
          // AI Categorization fields
          ai_primary_category: categorization.data.primaryCategory,
          ai_secondary_categories: categorization.data.secondaryCategories || [],
          ai_topics: categorization.data.topics || [],
          ai_target_audience: categorization.data.targetAudience || '',
          ai_podcast_style: categorization.data.podcastStyle || '',
          ai_business_relevance: categorization.data.businessRelevance || 0,
          ai_guest_friendly: categorization.data.guestFriendly || false,
          ai_monetization_potential: categorization.data.monetizationPotential || 0,
          ai_content_quality: categorization.data.contentQuality || 0,
          ai_audience_size: categorization.data.audienceSize || 'Unknown',
          ai_engagement_level: categorization.data.engagementLevel || 0,
          ai_summary: categorization.data.aiSummary || '',

          // Metadata
          aiCategorizationStatus: 'completed',
          aiCategorizedAt: admin.firestore.Timestamp.now(),
          updatedAt: admin.firestore.Timestamp.now()
        });

        results.processed++;
        log(`✅ Categorized: ${categorization.data.primaryCategory} | Business: ${categorization.data.businessRelevance}/10`);
      } else {
        results.failed++;

        // Mark as failed so we can retry later
        const docRef = db.collection('podcasts').doc(podcast.itunesId);
        await docRef.update({
          aiCategorizationStatus: 'failed',
          aiCategorizationError: categorization.error,
          updatedAt: admin.firestore.Timestamp.now()
        });
      }

      // Small pause between individual requests
      await sleep(500);

    } catch (error) {
      log(`❌ Error processing podcast ${podcast.itunesId}: ${error.message}`);
      results.failed++;
    }
  }

  return results;
}

async function main() {
  console.log('='.repeat(80));
  console.log('   🤖 AI PODCAST CATEGORIZATION');
  console.log('='.repeat(80));
  console.log(`📊 Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️  Pause between batches: ${PAUSE_BETWEEN_BATCHES}ms`);
  console.log(`🎯 Max podcasts to process: ${MAX_PODCASTS_TO_PROCESS}`);
  console.log('='.repeat(80));
  console.log('');

  try {
    // Get podcasts that need categorization
    log('📂 Fetching podcasts from Firestore...');

    let query = db.collection('podcasts')
      .where('aiCategorizationStatus', '!=', 'completed')
      .orderBy('aiCategorizationStatus')
      .orderBy('apple_rating_count', 'desc') // Prioritize popular podcasts
      .limit(MAX_PODCASTS_TO_PROCESS);

    // If no podcasts with status field, just get any podcasts
    let snapshot;
    try {
      snapshot = await query.get();
    } catch (error) {
      // Field might not exist, get first N podcasts
      log('⚠️  Status field not found, fetching first podcasts...');
      query = db.collection('podcasts')
        .orderBy('updatedAt', 'desc')
        .limit(MAX_PODCASTS_TO_PROCESS);
      snapshot = await query.get();
    }

    const podcasts = snapshot.docs.map(doc => ({
      itunesId: doc.id,
      ...doc.data()
    }));

    log(`✅ Found ${podcasts.length} podcasts to categorize\n`);

    if (podcasts.length === 0) {
      log('✅ No podcasts need categorization!');
      process.exit(0);
    }

    const totalStats = {
      processed: 0,
      failed: 0,
      skipped: 0
    };

    // Process in batches
    for (let i = 0; i < podcasts.length; i += BATCH_SIZE) {
      const batch = podcasts.slice(i, i + BATCH_SIZE);
      const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(podcasts.length / BATCH_SIZE);

      log(`\n${'='.repeat(80)}`);
      log(`📦 Processing batch ${batchNumber}/${totalBatches} (${batch.length} podcasts)`);
      log(`${'='.repeat(80)}`);

      const batchResults = await processBatch(batch);

      totalStats.processed += batchResults.processed;
      totalStats.failed += batchResults.failed;
      totalStats.skipped += batchResults.skipped;

      log(`\n📊 Batch ${batchNumber} results:`);
      log(`   ✅ Processed: ${batchResults.processed}`);
      log(`   ⏭️  Skipped: ${batchResults.skipped}`);
      log(`   ❌ Failed: ${batchResults.failed}`);

      // Pause between batches
      if (i + BATCH_SIZE < podcasts.length) {
        log(`\n⏸️  Pausing ${PAUSE_BETWEEN_BATCHES}ms before next batch...\n`);
        await sleep(PAUSE_BETWEEN_BATCHES);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('   ✅ CATEGORIZATION COMPLETE');
    console.log('='.repeat(80));
    console.log(`\n📊 Total Results:`);
    console.log(`   ✅ Processed: ${totalStats.processed}`);
    console.log(`   ⏭️  Skipped: ${totalStats.skipped}`);
    console.log(`   ❌ Failed: ${totalStats.failed}`);
    console.log('='.repeat(80));

    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  }
}

main();
