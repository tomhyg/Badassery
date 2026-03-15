/**
 * VALIDATION SCRIPT - Check setup before running parallel scoring
 *
 * This script validates:
 * 1. Firebase connection
 * 2. Gemini API key
 * 3. Podcast data availability
 * 4. Node.js memory configuration
 * 5. Dependencies
 */

const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(msg, type = 'info') {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warn: '⚠️',
    check: '🔍'
  };
  const color = {
    info: colors.cyan,
    success: colors.green,
    error: colors.red,
    warn: colors.yellow,
    check: colors.blue
  }[type] || colors.reset;

  console.log(`${color}${icons[type]} ${msg}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(80));
  console.log(`   ${title}`);
  console.log('='.repeat(80) + '\n');
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

async function checkNodeVersion() {
  log('Checking Node.js version...', 'check');
  const version = process.version;
  const majorVersion = parseInt(version.split('.')[0].substring(1));

  if (majorVersion >= 14) {
    log(`Node.js ${version} - OK`, 'success');
    return true;
  } else {
    log(`Node.js ${version} - TOO OLD (need >= 14.x)`, 'error');
    return false;
  }
}

async function checkMemoryLimit() {
  log('Checking Node.js memory configuration...', 'check');

  const heapStats = process.memoryUsage();
  const heapLimitMB = Math.round(heapStats.heapTotal / 1024 / 1024);

  log(`Current heap limit: ${heapLimitMB}MB`, 'info');

  if (heapLimitMB < 500) {
    log('Memory limit is LOW - Consider increasing with --max-old-space-size=2048', 'warn');
    return false;
  } else {
    log('Memory limit is OK', 'success');
    return true;
  }
}

async function checkDependencies() {
  log('Checking dependencies...', 'check');

  const requiredPackages = [
    'firebase-admin',
    '@google/generative-ai'
  ];

  let allInstalled = true;

  for (const pkg of requiredPackages) {
    try {
      require.resolve(pkg);
      log(`${pkg} - Installed`, 'success');
    } catch (e) {
      log(`${pkg} - NOT FOUND`, 'error');
      allInstalled = false;
    }
  }

  if (!allInstalled) {
    log('Run: npm install', 'warn');
  }

  return allInstalled;
}

async function checkFirebaseConfig() {
  log('Checking Firebase configuration...', 'check');

  const serviceAccountPath = path.join(__dirname, '../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

  if (!fs.existsSync(serviceAccountPath)) {
    log('Firebase service account file NOT FOUND', 'error');
    log(`Expected at: ${serviceAccountPath}`, 'info');
    return false;
  }

  try {
    const serviceAccount = require(serviceAccountPath);
    log(`Firebase project: ${serviceAccount.project_id}`, 'info');
    log('Service account file - OK', 'success');
    return true;
  } catch (error) {
    log(`Failed to read service account: ${error.message}`, 'error');
    return false;
  }
}

async function checkFirebaseConnection() {
  log('Testing Firebase connection...', 'check');

  try {
    const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }

    const db = admin.firestore();

    // Try to read a single document
    const snapshot = await db.collection('podcasts')
      .limit(1)
      .get();

    log('Firebase connection - OK', 'success');
    log(`Found ${snapshot.size} podcast(s) (test query)`, 'info');
    return true;

  } catch (error) {
    log(`Firebase connection failed: ${error.message}`, 'error');
    return false;
  }
}

async function checkPodcastData() {
  log('Checking podcast data availability...', 'check');

  try {
    const db = admin.firestore();

    // Count total podcasts
    const allSnapshot = await db.collection('podcasts').count().get();
    const totalCount = allSnapshot.data().count;

    log(`Total podcasts in database: ${totalCount.toLocaleString()}`, 'info');

    // Count podcasts to process (not completed)
    const toProcessSnapshot = await db.collection('podcasts')
      .where('aiCategorizationStatus', '!=', 'completed')
      .count()
      .get();

    const toProcessCount = toProcessSnapshot.data().count;

    log(`Podcasts to process: ${toProcessCount.toLocaleString()}`, 'info');

    // Count already completed
    const completedSnapshot = await db.collection('podcasts')
      .where('aiCategorizationStatus', '==', 'completed')
      .count()
      .get();

    const completedCount = completedSnapshot.data().count;

    log(`Already completed: ${completedCount.toLocaleString()}`, 'info');

    if (toProcessCount === 0) {
      log('No podcasts to process! All are already completed.', 'warn');
      return false;
    }

    if (toProcessCount > 100000) {
      log('Large dataset detected - Recommend using parallel script', 'warn');
    }

    return true;

  } catch (error) {
    log(`Failed to check podcast data: ${error.message}`, 'error');
    return false;
  }
}

async function checkGeminiAPIKey() {
  log('Checking Gemini API key...', 'check');

  const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4';

  if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
    log('Gemini API key NOT configured', 'error');
    log('Set GEMINI_API_KEY environment variable', 'warn');
    return false;
  }

  log(`API key found: ${apiKey.substring(0, 10)}...`, 'info');
  return true;
}

async function testGeminiAPI() {
  log('Testing Gemini API connection...', 'check');

  try {
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBDRKIQEEDiEkX0GkOYSSZkuesG-QIsyr4';
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

    const startTime = Date.now();
    const result = await model.generateContent('Say "OK" if you can hear me.');
    const elapsed = Date.now() - startTime;

    const response = await result.response;
    const text = response.text();

    log(`Gemini API - OK (${elapsed}ms)`, 'success');
    log(`Response: ${text.substring(0, 50)}`, 'info');
    return true;

  } catch (error) {
    log(`Gemini API test failed: ${error.message}`, 'error');

    if (error.message.includes('API_KEY_INVALID')) {
      log('API key is invalid - Check your key at https://aistudio.google.com/app/apikey', 'warn');
    } else if (error.message.includes('quota')) {
      log('API quota exceeded - Check your Gemini tier limits', 'warn');
    }

    return false;
  }
}

async function checkCheckpointFile() {
  log('Checking for existing checkpoint...', 'check');

  const checkpointPath = path.join(__dirname, '../.checkpoint.json');

  if (fs.existsSync(checkpointPath)) {
    try {
      const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, 'utf8'));
      log('Checkpoint file found:', 'warn');
      log(`  Last processed: ${checkpoint.lastProcessedId}`, 'info');
      log(`  Processed count: ${checkpoint.processed}`, 'info');
      log(`  Timestamp: ${new Date(checkpoint.timestamp).toLocaleString()}`, 'info');
      log('The script will RESUME from this checkpoint', 'warn');
      log('To start fresh, delete .checkpoint.json', 'info');
      return true;
    } catch (error) {
      log('Checkpoint file exists but is invalid', 'error');
      return false;
    }
  } else {
    log('No checkpoint file - Will start from beginning', 'info');
    return true;
  }
}

async function getSamplePodcast() {
  log('Fetching sample podcast...', 'check');

  try {
    const db = admin.firestore();

    const snapshot = await db.collection('podcasts')
      .where('aiCategorizationStatus', '!=', 'completed')
      .limit(1)
      .get();

    if (snapshot.empty) {
      log('No uncompleted podcasts found', 'warn');
      return null;
    }

    const doc = snapshot.docs[0];
    const podcast = { ...doc.data(), itunesId: doc.id };

    log(`Sample podcast: "${podcast.title}"`, 'info');
    log(`  iTunes ID: ${podcast.itunesId}`, 'info');
    log(`  Episodes: ${podcast.episodeCount || 0}`, 'info');
    log(`  Apple Rating: ${podcast.apple_rating || 'N/A'}`, 'info');
    log(`  YT Subscribers: ${podcast.yt_subscribers || 0}`, 'info');

    return podcast;

  } catch (error) {
    log(`Failed to fetch sample: ${error.message}`, 'error');
    return null;
  }
}

// ============================================================================
// MAIN VALIDATION
// ============================================================================

async function main() {
  console.clear();

  header('🔍 SETUP VALIDATION - Parallel Scoring V2.0');

  const results = {
    nodeVersion: false,
    memoryLimit: false,
    dependencies: false,
    firebaseConfig: false,
    firebaseConnection: false,
    podcastData: false,
    geminiApiKey: false,
    geminiApi: false,
    checkpointFile: false
  };

  // Run all checks
  results.nodeVersion = await checkNodeVersion();
  await sleep(300);

  results.memoryLimit = await checkMemoryLimit();
  await sleep(300);

  results.dependencies = await checkDependencies();
  await sleep(300);

  results.firebaseConfig = await checkFirebaseConfig();
  await sleep(300);

  if (results.firebaseConfig) {
    results.firebaseConnection = await checkFirebaseConnection();
    await sleep(300);

    if (results.firebaseConnection) {
      results.podcastData = await checkPodcastData();
      await sleep(300);

      await getSamplePodcast();
      await sleep(300);
    }
  }

  results.geminiApiKey = await checkGeminiAPIKey();
  await sleep(300);

  if (results.geminiApiKey) {
    results.geminiApi = await testGeminiAPI();
    await sleep(300);
  }

  results.checkpointFile = await checkCheckpointFile();

  // =========================================================================
  // FINAL SUMMARY
  // =========================================================================

  header('📊 VALIDATION SUMMARY');

  const checks = [
    { name: 'Node.js Version', status: results.nodeVersion, critical: true },
    { name: 'Memory Limit', status: results.memoryLimit, critical: false },
    { name: 'Dependencies', status: results.dependencies, critical: true },
    { name: 'Firebase Config', status: results.firebaseConfig, critical: true },
    { name: 'Firebase Connection', status: results.firebaseConnection, critical: true },
    { name: 'Podcast Data', status: results.podcastData, critical: true },
    { name: 'Gemini API Key', status: results.geminiApiKey, critical: true },
    { name: 'Gemini API Test', status: results.geminiApi, critical: true },
    { name: 'Checkpoint Check', status: results.checkpointFile, critical: false }
  ];

  checks.forEach(check => {
    const icon = check.status ? '✅' : (check.critical ? '❌' : '⚠️');
    const status = check.status ? 'PASS' : (check.critical ? 'FAIL' : 'WARN');
    console.log(`${icon} ${check.name.padEnd(25)} ${status}`);
  });

  const criticalFailed = checks.filter(c => c.critical && !c.status).length;
  const allPassed = checks.filter(c => c.status).length;

  console.log('\n' + '='.repeat(80));

  if (criticalFailed === 0) {
    log(`✅ ALL CRITICAL CHECKS PASSED (${allPassed}/${checks.length} total)`, 'success');
    console.log('\n🚀 You are ready to run the parallel scoring script!');
    console.log('\nNext steps:');
    console.log('  1. Test with 1000 podcasts:');
    console.log('     node scripts/parallel_scoring_v2.js --limit=1000');
    console.log('\n  2. Dry-run (no Firestore writes):');
    console.log('     node scripts/parallel_scoring_v2.js --dry-run');
    console.log('\n  3. Production (30K wave):');
    console.log('     node scripts/parallel_scoring_v2.js --offset=0 --limit=30000');
  } else {
    log(`❌ VALIDATION FAILED (${criticalFailed} critical issues)`, 'error');
    console.log('\nPlease fix the issues above before running the script.');
    console.log('\nCommon fixes:');
    console.log('  - Missing dependencies: npm install');
    console.log('  - Invalid API key: Check GEMINI_API_KEY');
    console.log('  - Firebase issues: Verify service account JSON file');
  }

  console.log('='.repeat(80) + '\n');

  process.exit(criticalFailed > 0 ? 1 : 0);
}

main().catch(error => {
  console.error('❌ Validation script error:', error);
  process.exit(1);
});
