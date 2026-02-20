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
const BATCH_SIZE = 500;

// Files to import
const FILES_TO_IMPORT = [
  // Enriched files (vm1-20)
  ...Array.from({length: 20}, (_, i) => ({
    path: path.join(BASE_DIR, `enriched_vm${i + 1}.json`),
    type: 'enriched',
    vm: i + 1
  })),
  // Checkpoint files
  { path: path.join(BASE_DIR, 'checkpoint_vm9.json'), type: 'checkpoint', vm: 9 },
  { path: path.join(BASE_DIR, 'checkpoint_vm18.json'), type: 'checkpoint', vm: 18 },
  // Remaining split files
  ...Array.from({length: 20}, (_, i) => ({
    path: path.join(BASE_DIR, 'remaining_split', `podcasts_vm${i + 1}.json`),
    type: 'remaining',
    vm: i + 1
  }))
];

function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${msg}`);
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

async function findPodcastByShowName(showName) {
  try {
    const snapshot = await db.collection('outreach')
      .where('showName', '==', showName)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    return {
      id: snapshot.docs[0].id,
      data: snapshot.docs[0].data()
    };
  } catch (error) {
    log(`⚠️  Error finding podcast "${showName}": ${error.message}`);
    return null;
  }
}

async function mergeEnrichedData(podcasts, sourceType, vmNumber) {
  if (!podcasts || !Array.isArray(podcasts)) {
    log(`⚠️  Invalid data format for ${sourceType} vm${vmNumber}`);
    return { updated: 0, skipped: 0, errors: 0 };
  }

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let batch = db.batch();
  let batchCount = 0;

  log(`\n📦 Processing ${podcasts.length} podcasts from ${sourceType} vm${vmNumber}...`);

  for (const podcast of podcasts) {
    const showName = podcast['Show Name'] || podcast.showName || podcast.show_name;

    if (!showName) {
      skipped++;
      continue;
    }

    try {
      // Find existing podcast in Firestore
      const existing = await findPodcastByShowName(showName);

      if (!existing) {
        skipped++;
        if (skipped % 100 === 0) {
          log(`⏭️  Skipped ${skipped} (not found in Firestore)`);
        }
        continue;
      }

      // Prepare enriched data to merge
      const enrichedData = {};

      // ========================================================================
      // BASIC PODCAST INFO
      // ========================================================================
      if (podcast.title) enrichedData.title = podcast.title;
      if (podcast.description) enrichedData.description = podcast.description;
      if (podcast.language) enrichedData.language = podcast.language;
      if (podcast.imageUrl) enrichedData.imageUrl = podcast.imageUrl;
      if (podcast.url) enrichedData.url = podcast.url;
      if (podcast.link) enrichedData.link = podcast.link;
      if (podcast.website) enrichedData.website = podcast.website;
      if (podcast.lastUpdate !== undefined) enrichedData.lastUpdate = podcast.lastUpdate;

      // ========================================================================
      // EMAIL FIELDS
      // ========================================================================
      if (podcast.rss_owner_email) enrichedData.rss_owner_email = podcast.rss_owner_email;
      if (podcast.website_email) enrichedData.website_email = podcast.website_email;

      // ========================================================================
      // APPLE PODCAST DATA
      // ========================================================================
      if (podcast.apple_rating !== undefined) enrichedData.apple_rating = podcast.apple_rating;
      if (podcast.apple_rating_count !== undefined) enrichedData.apple_rating_count = podcast.apple_rating_count;
      if (podcast.apple_api_url) enrichedData.apple_api_url = podcast.apple_api_url;
      if (podcast.apple_api_artist_id) enrichedData.apple_api_artist_id = podcast.apple_api_artist_id;
      if (podcast.apple_api_artwork_url) enrichedData.apple_api_artwork_url = podcast.apple_api_artwork_url;
      if (podcast.apple_api_genres) enrichedData.apple_api_genres = podcast.apple_api_genres;
      if (podcast.apple_api_genre_ids) enrichedData.apple_api_genre_ids = podcast.apple_api_genre_ids;
      if (podcast.apple_scrape_status) enrichedData.apple_scrape_status = podcast.apple_scrape_status;

      // ========================================================================
      // RSS FEED DATA
      // ========================================================================
      if (podcast.rss_url) enrichedData.rss_url = podcast.rss_url;
      if (podcast.rss_owner_name) enrichedData.rss_owner_name = podcast.rss_owner_name;
      if (podcast.rss_author) enrichedData.rss_author = podcast.rss_author;
      if (podcast.rss_description) enrichedData.rss_description = podcast.rss_description;
      if (podcast.rss_website) enrichedData.rss_website = podcast.rss_website;
      if (podcast.rss_status) enrichedData.rss_status = podcast.rss_status;

      // ========================================================================
      // EPISODE DATA
      // ========================================================================
      if (podcast.episodeCount !== undefined) enrichedData.episodeCount = podcast.episodeCount;

      // RSS episodes (ep1-10) - COMPLETE data including audio_url and guid
      for (let i = 1; i <= 10; i++) {
        if (podcast[`rss_ep${i}_title`]) enrichedData[`rss_ep${i}_title`] = podcast[`rss_ep${i}_title`];
        if (podcast[`rss_ep${i}_date`]) enrichedData[`rss_ep${i}_date`] = podcast[`rss_ep${i}_date`];
        if (podcast[`rss_ep${i}_description`]) enrichedData[`rss_ep${i}_description`] = podcast[`rss_ep${i}_description`];
        if (podcast[`rss_ep${i}_duration`]) enrichedData[`rss_ep${i}_duration`] = podcast[`rss_ep${i}_duration`];
        if (podcast[`rss_ep${i}_audio_url`]) enrichedData[`rss_ep${i}_audio_url`] = podcast[`rss_ep${i}_audio_url`];
        if (podcast[`rss_ep${i}_guid`]) enrichedData[`rss_ep${i}_guid`] = podcast[`rss_ep${i}_guid`];
      }

      // ========================================================================
      // YOUTUBE DATA
      // ========================================================================
      if (podcast.yt_subscribers !== undefined) enrichedData.yt_subscribers = podcast.yt_subscribers;
      if (podcast.yt_channel_name) enrichedData.yt_channel_name = podcast.yt_channel_name;
      if (podcast.yt_channel_id) enrichedData.yt_channel_id = podcast.yt_channel_id;
      if (podcast.youtube_status) enrichedData.youtube_status = podcast.youtube_status;

      // YouTube videos (yt_video_1-10) - COMPLETE data including duration and id
      for (let i = 1; i <= 10; i++) {
        if (podcast[`yt_video_${i}_title`]) enrichedData[`yt_video_${i}_title`] = podcast[`yt_video_${i}_title`];
        if (podcast[`yt_video_${i}_views`]) enrichedData[`yt_video_${i}_views`] = podcast[`yt_video_${i}_views`];
        if (podcast[`yt_video_${i}_duration`]) enrichedData[`yt_video_${i}_duration`] = podcast[`yt_video_${i}_duration`];
        if (podcast[`yt_video_${i}_id`]) enrichedData[`yt_video_${i}_id`] = podcast[`yt_video_${i}_id`];
      }

      // ========================================================================
      // SOCIAL MEDIA LINKS
      // ========================================================================
      if (podcast.website_facebook) enrichedData.website_facebook = podcast.website_facebook;
      if (podcast.website_instagram) enrichedData.website_instagram = podcast.website_instagram;
      if (podcast.website_twitter) enrichedData.website_twitter = podcast.website_twitter;
      if (podcast.website_linkedin) enrichedData.website_linkedin = podcast.website_linkedin;
      if (podcast.website_youtube) enrichedData.website_youtube = podcast.website_youtube;
      if (podcast.website_spotify) enrichedData.website_spotify = podcast.website_spotify;
      if (podcast.website_tiktok) enrichedData.website_tiktok = podcast.website_tiktok;
      if (podcast.website_status) enrichedData.website_status = podcast.website_status;

      // Skip if no enriched data to add
      if (Object.keys(enrichedData).length === 0) {
        skipped++;
        continue;
      }

      // Add to batch
      enrichedData.updatedAt = admin.firestore.Timestamp.now();
      enrichedData.importedFrom = `${sourceType}_vm${vmNumber}`;
      enrichedData.importedAt = admin.firestore.Timestamp.now();

      const docRef = db.collection('outreach').doc(existing.id);
      batch.update(docRef, enrichedData);

      batchCount++;
      updated++;

      if (updated % 50 === 0) {
        log(`✅ Updated: ${updated}`);
      }

      // Commit batch if size limit reached
      if (batchCount >= BATCH_SIZE) {
        await batch.commit();
        log(`💾 Committed batch of ${batchCount} updates`);
        batch = db.batch();
        batchCount = 0;
      }

    } catch (error) {
      errors++;
      log(`❌ Error updating "${showName}": ${error.message}`);
    }
  }

  // Commit remaining updates
  if (batchCount > 0) {
    await batch.commit();
    log(`💾 Committed final batch of ${batchCount} updates`);
  }

  return { updated, skipped, errors };
}

async function main() {
  console.log('=' .repeat(80));
  console.log('   🚀 ENRICHED DATA IMPORT TO FIRESTORE');
  console.log('=' .repeat(80));

  const totalStats = {
    updated: 0,
    skipped: 0,
    errors: 0,
    filesProcessed: 0,
    filesSkipped: 0
  };

  for (const fileInfo of FILES_TO_IMPORT) {
    const exists = await fileExists(fileInfo.path);

    if (!exists) {
      log(`⏭️  Skipping ${fileInfo.type} vm${fileInfo.vm} (file not found)`);
      totalStats.filesSkipped++;
      continue;
    }

    log(`\n${'='.repeat(80)}`);
    log(`📂 Loading ${fileInfo.type} vm${fileInfo.vm}...`);

    const data = await loadJsonFile(fileInfo.path);

    if (!data) {
      totalStats.filesSkipped++;
      continue;
    }

    const stats = await mergeEnrichedData(data, fileInfo.type, fileInfo.vm);

    totalStats.updated += stats.updated;
    totalStats.skipped += stats.skipped;
    totalStats.errors += stats.errors;
    totalStats.filesProcessed++;

    log(`📊 Stats for ${fileInfo.type} vm${fileInfo.vm}:`);
    log(`   ✅ Updated: ${stats.updated}`);
    log(`   ⏭️  Skipped: ${stats.skipped}`);
    log(`   ❌ Errors: ${stats.errors}`);
  }

  console.log('\n' + '='.repeat(80));
  console.log('   ✅ IMPORT COMPLETE');
  console.log('='.repeat(80));
  console.log(`📂 Files processed: ${totalStats.filesProcessed}/${FILES_TO_IMPORT.length}`);
  console.log(`   Skipped: ${totalStats.filesSkipped}`);
  console.log(`\n📊 Total podcasts:`);
  console.log(`   ✅ Updated: ${totalStats.updated}`);
  console.log(`   ⏭️  Skipped: ${totalStats.skipped}`);
  console.log(`   ❌ Errors: ${totalStats.errors}`);
  console.log('='.repeat(80));

  process.exit(0);
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
