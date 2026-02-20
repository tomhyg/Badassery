/**
 * Diagnostic script to verify Firestore podcasts collection structure
 * Checks document IDs, iTunes IDs, and provides examples of failed podcasts
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function verifyFirestorePodcasts() {
  console.log('================================================================================');
  console.log('   🔍 FIRESTORE PODCASTS VERIFICATION');
  console.log('================================================================================\n');

  try {
    // Fetch first 50 podcasts to analyze
    console.log('📂 Fetching podcasts from Firestore...\n');
    const snapshot = await db.collection('podcasts').limit(50).get();

    if (snapshot.empty) {
      console.log('❌ No podcasts found in Firestore collection "podcasts"');
      return;
    }

    console.log(`✅ Found ${snapshot.size} podcasts (showing first 50)\n`);
    console.log('================================================================================');
    console.log('📊 DOCUMENT ANALYSIS');
    console.log('================================================================================\n');

    let validItunesId = 0;
    let invalidItunesId = 0;
    let missingItunesId = 0;
    let docIdMatchesItunesId = 0;
    let docIdMismatch = 0;

    const examples = {
      valid: [],
      invalid: [],
      missing: [],
      mismatch: []
    };

    snapshot.forEach(doc => {
      const data = doc.data();
      const docId = doc.id;
      const itunesId = data.itunesId;

      // Check if itunesId exists and is valid
      if (!itunesId || itunesId === '' || itunesId === 'undefined' || itunesId === 'null') {
        invalidItunesId++;
        if (examples.invalid.length < 5) {
          examples.invalid.push({
            docId: docId,
            title: data.title || 'No title',
            itunesId: itunesId || 'MISSING'
          });
        }
      } else if (typeof itunesId === 'undefined') {
        missingItunesId++;
        if (examples.missing.length < 5) {
          examples.missing.push({
            docId: docId,
            title: data.title || 'No title'
          });
        }
      } else {
        validItunesId++;
        if (examples.valid.length < 5) {
          examples.valid.push({
            docId: docId,
            title: data.title || 'No title',
            itunesId: String(itunesId)
          });
        }

        // Check if document ID matches itunesId
        if (docId === String(itunesId)) {
          docIdMatchesItunesId++;
        } else {
          docIdMismatch++;
          if (examples.mismatch.length < 5) {
            examples.mismatch.push({
              docId: docId,
              itunesId: String(itunesId),
              title: data.title || 'No title'
            });
          }
        }
      }
    });

    // Print summary
    console.log('📈 Summary:');
    console.log(`   Total podcasts analyzed: ${snapshot.size}`);
    console.log(`   ✅ Valid iTunes ID: ${validItunesId}`);
    console.log(`   ❌ Invalid iTunes ID (empty/undefined/null): ${invalidItunesId}`);
    console.log(`   ❓ Missing iTunes ID field: ${missingItunesId}`);
    console.log(`   🔗 Document ID matches iTunes ID: ${docIdMatchesItunesId}`);
    console.log(`   ⚠️  Document ID mismatch: ${docIdMismatch}\n`);

    // Print examples
    console.log('================================================================================');
    console.log('📝 EXAMPLES');
    console.log('================================================================================\n');

    if (examples.valid.length > 0) {
      console.log('✅ VALID iTunes ID (first 5):');
      examples.valid.forEach((ex, i) => {
        console.log(`\n   ${i + 1}. "${ex.title}"`);
        console.log(`      Document ID: ${ex.docId}`);
        console.log(`      iTunes ID: ${ex.itunesId}`);
        console.log(`      Match: ${ex.docId === ex.itunesId ? 'YES ✅' : 'NO ⚠️'}`);
      });
      console.log('');
    }

    if (examples.invalid.length > 0) {
      console.log('\n❌ INVALID iTunes ID (first 5):');
      examples.invalid.forEach((ex, i) => {
        console.log(`\n   ${i + 1}. "${ex.title}"`);
        console.log(`      Document ID: ${ex.docId}`);
        console.log(`      iTunes ID: ${ex.itunesId}`);
        console.log(`      ⚠️  This podcast would FAIL in AI categorization script`);
      });
      console.log('');
    }

    if (examples.missing.length > 0) {
      console.log('\n❓ MISSING iTunes ID field (first 5):');
      examples.missing.forEach((ex, i) => {
        console.log(`\n   ${i + 1}. "${ex.title}"`);
        console.log(`      Document ID: ${ex.docId}`);
        console.log(`      iTunes ID: FIELD MISSING`);
        console.log(`      ⚠️  This podcast would FAIL in AI categorization script`);
      });
      console.log('');
    }

    if (examples.mismatch.length > 0) {
      console.log('\n⚠️  Document ID MISMATCH (first 5):');
      examples.mismatch.forEach((ex, i) => {
        console.log(`\n   ${i + 1}. "${ex.title}"`);
        console.log(`      Document ID: ${ex.docId}`);
        console.log(`      iTunes ID: ${ex.itunesId}`);
        console.log(`      ⚠️  Document ID doesn't match iTunes ID`);
      });
      console.log('');
    }

    console.log('================================================================================');
    console.log('💡 DIAGNOSIS');
    console.log('================================================================================\n');

    if (invalidItunesId > 0 || missingItunesId > 0) {
      console.log('❌ PROBLEM IDENTIFIED:');
      console.log(`   ${invalidItunesId + missingItunesId} podcasts have invalid/missing iTunes IDs`);
      console.log('\n   This explains why the AI categorization script is failing.');
      console.log('   The script needs valid iTunes IDs to update documents in Firestore.\n');

      console.log('💡 POSSIBLE SOLUTIONS:\n');
      console.log('   Option 1: Use document ID instead of iTunes ID');
      console.log('   → Modify AI script to use doc.id instead of podcast.itunesId\n');

      console.log('   Option 2: Fix the upload script');
      console.log('   → Ensure all podcasts have valid iTunes IDs before upload\n');

      console.log('   Option 3: Use a combination approach');
      console.log('   → Try iTunes ID first, fall back to document ID if missing\n');
    } else if (docIdMismatch > 0) {
      console.log('⚠️  WARNING:');
      console.log(`   ${docIdMismatch} podcasts have document IDs that don't match their iTunes IDs`);
      console.log('\n   This is unusual and might indicate:');
      console.log('   - Documents were created with auto-generated IDs');
      console.log('   - iTunes IDs were added later as fields');
      console.log('   - Mixed upload methods were used\n');
    } else {
      console.log('✅ ALL GOOD:');
      console.log('   All podcasts have valid iTunes IDs that match their document IDs');
      console.log('   The AI categorization script should work correctly.\n');
    }

    console.log('================================================================================\n');

    // Check total count
    const collectionRef = db.collection('podcasts');
    const countSnapshot = await collectionRef.count().get();
    console.log(`📊 Total podcasts in collection: ${countSnapshot.data().count}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

verifyFirestorePodcasts();
