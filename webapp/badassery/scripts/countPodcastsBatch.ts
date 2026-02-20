/**
 * Count podcasts in Firestore using batch queries to avoid timeout
 */

import { db } from '../services/firebase.ts';
import {
  collection,
  query,
  where,
  getCountFromServer,
  getDocs,
  limit,
  startAfter,
  orderBy,
  DocumentSnapshot
} from 'firebase/firestore';

async function countPodcastsInBatches() {
  console.log('🔍 Counting podcasts in Firestore...\n');

  try {
    const podcastsCollection = collection(db, 'podcasts');

    // Method 1: Try to get total count directly (may timeout)
    console.log('Attempting direct count...');
    try {
      const totalCountSnapshot = await getCountFromServer(podcastsCollection);
      const totalCount = totalCountSnapshot.data().count;
      console.log(`✅ Total podcasts: ${totalCount.toLocaleString()}\n`);

      // Now count categorized podcasts
      console.log('Counting categorized podcasts...');
      const categorizedQuery = query(
        podcastsCollection,
        where('ai_badassery_score', '!=', null)
      );
      const categorizedCountSnapshot = await getCountFromServer(categorizedQuery);
      const categorizedCount = categorizedCountSnapshot.data().count;

      console.log(`✅ AI Categorized: ${categorizedCount.toLocaleString()}`);
      console.log(`❌ Missing categorization: ${(totalCount - categorizedCount).toLocaleString()}`);
      console.log(`📊 Categorization rate: ${((categorizedCount / totalCount) * 100).toFixed(2)}%\n`);

      // Try to get status breakdown
      console.log('Getting status breakdown...');
      const statuses = ['completed', 'failed', 'pending'];
      for (const status of statuses) {
        try {
          const statusQuery = query(
            podcastsCollection,
            where('aiCategorizationStatus', '==', status)
          );
          const statusCountSnapshot = await getCountFromServer(statusQuery);
          const count = statusCountSnapshot.data().count;
          console.log(`  - ${status}: ${count.toLocaleString()}`);
        } catch (error) {
          console.log(`  - ${status}: Unable to count (may need index)`);
        }
      }

    } catch (error: any) {
      if (error.code === 'deadline-exceeded') {
        console.log('⚠️  Direct count timed out. Using sampling method...\n');

        // Method 2: Sample-based estimation
        const sampleSize = 1000;
        const sampleQuery = query(podcastsCollection, limit(sampleSize));
        const sampleSnapshot = await getDocs(sampleQuery);

        let categorizedInSample = 0;
        const statusCounts: Record<string, number> = {};

        sampleSnapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.ai_badassery_score != null) {
            categorizedInSample++;
          }
          if (data.aiCategorizationStatus) {
            statusCounts[data.aiCategorizationStatus] = (statusCounts[data.aiCategorizationStatus] || 0) + 1;
          }
        });

        const categorizationRate = categorizedInSample / sampleSize;

        console.log(`📊 Sample Analysis (${sampleSize} podcasts):`);
        console.log(`   - Categorized in sample: ${categorizedInSample}`);
        console.log(`   - Categorization rate: ${(categorizationRate * 100).toFixed(2)}%`);
        console.log(`\n📈 Estimated totals (assuming ~195,000 podcasts):`);
        console.log(`   - Estimated categorized: ~${Math.round(195000 * categorizationRate).toLocaleString()}`);
        console.log(`   - Estimated missing: ~${Math.round(195000 * (1 - categorizationRate)).toLocaleString()}`);

        if (Object.keys(statusCounts).length > 0) {
          console.log(`\n📋 Status breakdown in sample:`);
          Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`   - ${status}: ${count} (${((count / sampleSize) * 100).toFixed(2)}%)`);
          });
        }
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Run the count
countPodcastsInBatches()
  .then(() => {
    console.log('\n✨ Analysis complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Analysis failed:', error);
    process.exit(1);
  });
