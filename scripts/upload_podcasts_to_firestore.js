const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// Configuration
const BASE_DIR = 'C:\\Users\\admin\\OneDrive\\Bureau\\Dossier danielle';
const BATCH_SIZE = 400;
const PAUSE_BETWEEN_BATCHES = 1000; // 1 second
const MAX_RETRIES = 3;

// Files to import
const FILES_TO_IMPORT = [
  // New enriched files (vm1-20)
  ...Array.from({length: 20}, (_, i) => ({
    path: path.join(BASE_DIR, `enriched_vm${i + 1}.json`),
    name: `enriched_vm${i + 1}`
  })),
  // Checkpoint files
  { path: path.join(BASE_DIR, 'checkpoint_vm9.json'), name: 'checkpoint_vm9' },
  { path: path.join(BASE_DIR, 'checkpoint_vm18.json'), name: 'checkpoint_vm18' },
  // Remaining split files
  ...Array.from({length: 20}, (_, i) => ({
    path: path.join(BASE_DIR, 'remaining_split', `podcasts_vm${i + 1}.json`),
    name: `remaining_split_vm${i + 1}`
  }))
];

// Track uploaded podcasts
const uploadedIds = new Set();

function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  process.stdout.write(`[${timestamp}] ${msg}\n`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJsonFile(filePath) {
  try {
    const content = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    log(`❌ Error loading ${filePath}: ${error.message}`);
    return null;
  }
}

async function checkIfPodcastExists(itunesId) {
  try {
    const docRef = db.collection('podcasts').doc(String(itunesId));
    const doc = await docRef.get();
    return doc.exists;
  } catch (error) {
    return false;
  }
}

async function uploadBatchWithRetry(batch, retryCount = 0) {
  try {
    await batch.commit();
    return true;
  } catch (error) {
    if (error.code === 'resource-exhausted' || error.code === 429) {
      if (retryCount < MAX_RETRIES) {
        const waitTime = Math.pow(2, retryCount) * 2000; // Exponential backoff: 2s, 4s, 8s
        log(`⚠️  Rate limit hit, waiting ${waitTime/1000}s before retry ${retryCount + 1}/${MAX_RETRIES}...`);
        await sleep(waitTime);
        return uploadBatchWithRetry(batch, retryCount + 1);
      }
    }
    throw error;
  }
}

async function uploadPodcasts(podcasts, sourceName) {
  if (!podcasts || !Array.isArray(podcasts)) {
    log(`⚠️  Invalid data format for ${sourceName}`);
    return { uploaded: 0, skipped: 0, errors: 0 };
  }

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  let batch = db.batch();
  let batchCount = 0;

  log(`\n📦 Processing ${podcasts.length} podcasts from ${sourceName}...`);

  for (const podcast of podcasts) {
    const itunesId = podcast.itunesId || podcast.itunes_id;

    // Skip if no iTunes ID
    if (!itunesId) {
      skipped++;
      continue;
    }

    // Skip if already uploaded in this session
    if (uploadedIds.has(String(itunesId))) {
      skipped++;
      continue;
    }

    // Skip existence check for speed - just upload everything
    // Firestore will handle duplicates with set()

    try {
      // Prepare podcast data
      const podcastData = {
        // Basic info
        itunesId: itunesId,
        title: podcast.title || '',
        description: podcast.description || '',
        language: podcast.language || '',
        imageUrl: podcast.imageUrl || '',
        url: podcast.url || '',
        link: podcast.link || '',
        website: podcast.website || '',

        // Episode count
        episodeCount: podcast.episodeCount || 0,
        lastUpdate: podcast.lastUpdate || null,

        // Apple Podcast data
        apple_rating: podcast.apple_rating || null,
        apple_rating_count: podcast.apple_rating_count || null,
        apple_api_url: podcast.apple_api_url || '',
        apple_api_artist_id: podcast.apple_api_artist_id || '',
        apple_api_artwork_url: podcast.apple_api_artwork_url || '',
        apple_api_genres: podcast.apple_api_genres || [],
        apple_api_genre_ids: podcast.apple_api_genre_ids || [],
        apple_scrape_status: podcast.apple_scrape_status || '',

        // RSS data
        rss_url: podcast.rss_url || '',
        rss_owner_email: podcast.rss_owner_email || '',
        rss_owner_name: podcast.rss_owner_name || '',
        rss_author: podcast.rss_author || '',
        rss_description: podcast.rss_description || '',
        rss_website: podcast.rss_website || '',
        rss_status: podcast.rss_status || '',

        // YouTube data
        yt_subscribers: podcast.yt_subscribers || null,
        yt_channel_name: podcast.yt_channel_name || '',
        yt_channel_id: podcast.yt_channel_id || '',
        youtube_status: podcast.youtube_status || '',

        // Social media
        website_email: podcast.website_email || '',
        website_facebook: podcast.website_facebook || '',
        website_instagram: podcast.website_instagram || '',
        website_twitter: podcast.website_twitter || '',
        website_linkedin: podcast.website_linkedin || '',
        website_youtube: podcast.website_youtube || '',
        website_spotify: podcast.website_spotify || '',
        website_tiktok: podcast.website_tiktok || '',
        website_status: podcast.website_status || '',

        // Metadata
        uploadedAt: admin.firestore.Timestamp.now(),
        uploadedFrom: sourceName,
        updatedAt: admin.firestore.Timestamp.now()
      };

      // Add RSS episodes (1-10)
      for (let i = 1; i <= 10; i++) {
        if (podcast[`rss_ep${i}_title`]) podcastData[`rss_ep${i}_title`] = podcast[`rss_ep${i}_title`];
        if (podcast[`rss_ep${i}_date`]) podcastData[`rss_ep${i}_date`] = podcast[`rss_ep${i}_date`];
        if (podcast[`rss_ep${i}_description`]) podcastData[`rss_ep${i}_description`] = podcast[`rss_ep${i}_description`];
        if (podcast[`rss_ep${i}_duration`]) podcastData[`rss_ep${i}_duration`] = podcast[`rss_ep${i}_duration`];
        if (podcast[`rss_ep${i}_audio_url`]) podcastData[`rss_ep${i}_audio_url`] = podcast[`rss_ep${i}_audio_url`];
        if (podcast[`rss_ep${i}_guid`]) podcastData[`rss_ep${i}_guid`] = podcast[`rss_ep${i}_guid`];
      }

      // Add YouTube videos (1-10)
      for (let i = 1; i <= 10; i++) {
        if (podcast[`yt_video_${i}_title`]) podcastData[`yt_video_${i}_title`] = podcast[`yt_video_${i}_title`];
        if (podcast[`yt_video_${i}_views`]) podcastData[`yt_video_${i}_views`] = podcast[`yt_video_${i}_views`];
        if (podcast[`yt_video_${i}_duration`]) podcastData[`yt_video_${i}_duration`] = podcast[`yt_video_${i}_duration`];
        if (podcast[`yt_video_${i}_id`]) podcastData[`yt_video_${i}_id`] = podcast[`yt_video_${i}_id`];
      }

      // Add to batch
      const docRef = db.collection('podcasts').doc(String(itunesId));
      batch.set(docRef, podcastData);

      batchCount++;
      uploaded++;
      uploadedIds.add(String(itunesId));

      // Real-time logging every 10 podcasts
      if (uploaded % 10 === 0) {
        log(`✅ Uploaded: ${uploaded} | ⏭️  Skipped: ${skipped} | ❌ Errors: ${errors}`);
      }

      // Commit batch if size limit reached
      if (batchCount >= BATCH_SIZE) {
        await uploadBatchWithRetry(batch);
        log(`\n💾 Committed batch of ${batchCount} podcasts`);
        batch = db.batch();
        batchCount = 0;

        // Pause between batches
        await sleep(PAUSE_BETWEEN_BATCHES);
      }

    } catch (error) {
      errors++;
      log(`\n❌ Error uploading podcast ${itunesId}: ${error.message}`);
    }
  }

  // Commit remaining podcasts
  if (batchCount > 0) {
    await uploadBatchWithRetry(batch);
    log(`\n💾 Committed final batch of ${batchCount} podcasts`);
  }

  return { uploaded, skipped, errors };
}

async function main() {
  console.log('='.repeat(80));
  console.log('   🚀 UPLOAD PODCASTS TO FIRESTORE COLLECTION');
  console.log('='.repeat(80));
  console.log(`📊 Target collection: podcasts`);
  console.log(`⚙️  Batch size: ${BATCH_SIZE}`);
  console.log(`⏱️  Pause between batches: ${PAUSE_BETWEEN_BATCHES}ms`);
  console.log('='.repeat(80));

  const totalStats = {
    uploaded: 0,
    skipped: 0,
    errors: 0,
    filesProcessed: 0,
    filesSkipped: 0
  };

  for (const fileInfo of FILES_TO_IMPORT) {
    const exists = await fileExists(fileInfo.path);

    if (!exists) {
      log(`⏭️  Skipping ${fileInfo.name} (file not found)`);
      totalStats.filesSkipped++;
      continue;
    }

    log(`\n${'='.repeat(80)}`);
    log(`📂 Loading ${fileInfo.name}...`);

    const data = await loadJsonFile(fileInfo.path);

    if (!data) {
      totalStats.filesSkipped++;
      continue;
    }

    const stats = await uploadPodcasts(data, fileInfo.name);

    totalStats.uploaded += stats.uploaded;
    totalStats.skipped += stats.skipped;
    totalStats.errors += stats.errors;
    totalStats.filesProcessed++;

    log(`\n📊 Stats for ${fileInfo.name}:`);
    log(`   ✅ Uploaded: ${stats.uploaded}`);
    log(`   ⏭️  Skipped: ${stats.skipped}`);
    log(`   ❌ Errors: ${stats.errors}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('   ✅ UPLOAD COMPLETE');
  console.log('='.repeat(80));
  console.log(`📂 Files processed: ${totalStats.filesProcessed}/${FILES_TO_IMPORT.length}`);
  console.log(`   Files skipped: ${totalStats.filesSkipped}`);
  console.log(`\n📊 Total podcasts:`);
  console.log(`   ✅ Uploaded: ${totalStats.uploaded}`);
  console.log(`   ⏭️  Skipped: ${totalStats.skipped}`);
  console.log(`   ❌ Errors: ${totalStats.errors}`);
  console.log('='.repeat(80));

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
