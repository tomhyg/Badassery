import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAtzxhchv_2pmSNLXu-IZLYIqTnWop-Q7g",
  authDomain: "brooklynn-61dc8.firebaseapp.com",
  projectId: "brooklynn-61dc8",
  storageBucket: "brooklynn-61dc8.firebasestorage.app",
  messagingSenderId: "123339333797",
  appId: "1:123339333797:web:fa0659cd153d09491aad4c",
  measurementId: "G-SZ7TS3VYRC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

interface PodcastData {
  ai_badassery_score?: number;
  aiCategorizationStatus?: string;
  [key: string]: any;
}

async function analyzePodcastCategorization() {
  try {
    console.log("Connecting to Firestore...\n");
    
    // Get all podcasts from the collection
    const podcastsRef = collection(db, "podcasts");
    const querySnapshot = await getDocs(podcastsRef);
    
    const totalPodcasts = querySnapshot.size;
    let categorizedCount = 0;
    let missingCategorizationCount = 0;
    const statusBreakdown: Record<string, number> = {};
    
    // Analyze each document
    querySnapshot.forEach((doc) => {
      const data = doc.data() as PodcastData;
      
      // Check if AI categorized (has ai_badassery_score)
      if (data.ai_badassery_score !== undefined && data.ai_badassery_score !== null) {
        categorizedCount++;
      } else {
        missingCategorizationCount++;
      }
      
      // Track aiCategorizationStatus breakdown
      const status = data.aiCategorizationStatus || "undefined";
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1;
    });
    
    // Display results
    console.log("====================================");
    console.log("PODCAST CATEGORIZATION ANALYSIS");
    console.log("====================================\n");
    
    console.log(`Total Podcasts: ${totalPodcasts}`);
    console.log(`AI Categorized (have ai_badassery_score): ${categorizedCount}`);
    console.log(`Missing Categorization: ${missingCategorizationCount}`);
    
    if (totalPodcasts > 0) {
      const categorizedPercent = ((categorizedCount / totalPodcasts) * 100).toFixed(2);
      const missingPercent = ((missingCategorizationCount / totalPodcasts) * 100).toFixed(2);
      console.log(`  - Categorized: ${categorizedPercent}%`);
      console.log(`  - Missing: ${missingPercent}%`);
    }
    
    console.log("\n====================================");
    console.log("BREAKDOWN BY aiCategorizationStatus");
    console.log("====================================\n");
    
    // Sort status breakdown by count (descending)
    const sortedStatuses = Object.entries(statusBreakdown)
      .sort(([, a], [, b]) => b - a);
    
    sortedStatuses.forEach(([status, count]) => {
      const percent = ((count / totalPodcasts) * 100).toFixed(2);
      console.log(`${status}: ${count} (${percent}%)`);
    });
    
    console.log("\n====================================\n");
    
    process.exit(0);
  } catch (error) {
    console.error("Error analyzing podcasts:", error);
    process.exit(1);
  }
}

// Run the analysis
analyzePodcastCategorization();
