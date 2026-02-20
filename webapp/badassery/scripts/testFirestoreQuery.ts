/**
 * Test Firestore query for podcasts with scores
 * This helps debug why the webapp shows 0 podcasts
 */

import { db } from '../services/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getCountFromServer
} from 'firebase/firestore';

async function testQuery() {
  console.log('🔍 Testing Firestore queries from webapp...\n');

  try {
    // Test 1: Count all podcasts
    console.log('Test 1: Counting all podcasts...');
    const allPodcastsRef = collection(db, 'podcasts');
    const totalCount = await getCountFromServer(allPodcastsRef);
    console.log(`✅ Total podcasts: ${totalCount.data().count.toLocaleString()}\n`);

    // Test 2: Count podcasts with scores (using !=)
    console.log('Test 2: Counting podcasts with ai_badassery_score != null...');
    try {
      const withScoreQuery = query(
        collection(db, 'podcasts'),
        where('ai_badassery_score', '!=', null)
      );
      const withScoreCount = await getCountFromServer(withScoreQuery);
      console.log(`✅ With score (!= null): ${withScoreCount.data().count.toLocaleString()}\n`);
    } catch (error: any) {
      console.log(`❌ Query failed: ${error.message}`);
      console.log(`   This likely means the index doesn't exist\n`);
    }

    // Test 3: Query podcasts with score > 0 (THIS IS THE QUERY USED IN getScoredPodcasts)
    console.log('Test 3: Querying podcasts with ai_badassery_score > 0...');
    try {
      const scoredQuery = query(
        collection(db, 'podcasts'),
        where('ai_badassery_score', '>', 0),
        orderBy('ai_badassery_score', 'desc'),
        limit(10)
      );
      const scoredSnapshot = await getDocs(scoredQuery);
      console.log(`✅ Query succeeded! Found ${scoredSnapshot.docs.length} podcasts`);

      if (scoredSnapshot.docs.length > 0) {
        console.log('\n📊 Sample podcasts:');
        scoredSnapshot.docs.slice(0, 3).forEach((doc, i) => {
          const data = doc.data();
          console.log(`\n${i + 1}. ${data.title}`);
          console.log(`   Score: ${data.ai_badassery_score?.toFixed(1)}`);
          console.log(`   Category: ${data.ai_primary_category || 'N/A'}`);
        });
      } else {
        console.log('⚠️  Query returned 0 documents');
      }
    } catch (error: any) {
      console.log(`❌ Query FAILED: ${error.message}`);
      console.log(`   Error code: ${error.code}`);

      if (error.code === 'failed-precondition' || error.message.includes('index')) {
        console.log('\n🔧 FIX NEEDED:');
        console.log('   You need to create a Firestore index!');
        console.log('   The error message should contain a URL to create the index.');
        console.log('   Click that URL and Firebase will auto-create the index for you.');

        // Extract URL from error message if present
        const urlMatch = error.message.match(/(https:\/\/console\.firebase\.google\.com\/[^\s]+)/);
        if (urlMatch) {
          console.log(`\n   Index creation URL:\n   ${urlMatch[1]}`);
        }
      }
    }

    // Test 4: Try fetching without score filter (fallback approach)
    console.log('\n\nTest 4: Fetching podcasts without score filter...');
    try {
      const basicQuery = query(
        collection(db, 'podcasts'),
        limit(10)
      );
      const basicSnapshot = await getDocs(basicQuery);
      console.log(`✅ Basic query succeeded! Found ${basicSnapshot.docs.length} podcasts`);

      // Check how many have scores
      let withScores = 0;
      basicSnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.ai_badassery_score && data.ai_badassery_score > 0) {
          withScores++;
        }
      });

      console.log(`   Podcasts with scores: ${withScores}/${basicSnapshot.docs.length}`);
    } catch (error: any) {
      console.log(`❌ Even basic query failed: ${error.message}`);
    }

  } catch (error) {
    console.error('\n💥 Unexpected error:', error);
  }

  console.log('\n✨ Test complete!');
}

testQuery()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
