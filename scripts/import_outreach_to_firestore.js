const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

// Initialize Firebase Admin
const serviceAccount = require('../brooklynn-61dc8-firebase-adminsdk-fbsvc-e27129f5dc.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

/**
 * Parse CSV line respecting quotes and multiline fields
 */
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse entire CSV file properly handling multiline fields
 */
function parseCSVProper(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f !== '')) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      }
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some(f => f !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * Map client name to client ID
 * Maps CSV client names to Firestore client IDs
 */
const CLIENT_NAME_TO_ID = {
  'Andrew Stevens': '5FmD1t3dwze5uxQdbvvw',
  'Dan Balcauski': '4FEAWs03kOjBQLn2Nd7O',
  'Dominique Farrar': 'dTxnaoCmDgqiv44m9DSa',
  'Jeff Wetherhold': 'lgOWpHUzU6zm5offVf4f',
  'Nick Montalbine': 'EYWlI480wL8puOb44eHg',
  'Serin Silva': 'IlHuhEPYj262djv2rsvv',
  'Stephen Minix': 'GbvEfeqeL2yVnIcatdYM',
  'Sunaina Mehta': 'bABSJ9gVMPpp3cIkYcLV',
  'Tim Beattie': '7o3g2GPA1av0Zn1DkDQa',
  'Yosi Amram': 'aE8kdPDT6WaEho1uMHIy'
};

/**
 * Import CSV to Firestore Outreach collection
 * Each CSV row = 1 Firestore document with auto-generated ID
 */
async function importOutreachToFirestore(csvFile) {
  console.log('🔄 Starting Firestore import...');
  console.log('📝 Structure: 1 CSV row = 1 Firestore document (auto-generated ID)\n');

  // Read CSV file
  const content = fs.readFileSync(csvFile, 'utf-8');
  const cleanContent = content.replace(/^\uFEFF/, ''); // Remove BOM

  // Parse CSV
  const allRows = parseCSVProper(cleanContent);
  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  console.log(`📊 Found ${dataRows.length} rows to import`);
  console.log(`📋 Columns: ${headers.length}`);
  console.log(`🎯 Each row will get a unique auto-generated ID\n`);

  // Convert rows to objects
  const rows = dataRows.map(values => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });

  // Import to Firestore
  const db = admin.firestore();
  let batch = db.batch();
  let importCount = 0;
  let skipCount = 0;
  let batchCount = 0;
  let needsManualReviewCount = 0;
  const errors = [];

  for (const row of rows) {
    const itunesId = row['iTunes ID'] || ''; // Empty string if no iTunes ID
    const showName = row['Show Name Clean'];
    const clientName = row['Client'];

    // Skip if no show name at all
    if (!showName || !showName.trim()) {
      console.log(`⚠️  Skipping row - no show name`);
      skipCount++;
      continue;
    }

    try {
      // Map client name to ID
      const clientId = CLIENT_NAME_TO_ID[clientName] || clientName; // Fallback to name if no mapping

      // Create Firestore document with AUTO-GENERATED ID
      const docRef = db.collection('outreach').doc(); // ← AUTO ID!

      const outreachDoc = {
        // Document ID (for reference)
        id: docRef.id,

        // Basic Info
        itunesId: itunesId,
        showName: showName,
        showNameOriginal: row['Show Name (from Show Name)'] || '',
        showLink: row['Show link'] || '',

        // Client Reference (this is the link to your clients collection!)
        clientId: clientId,
        clientName: clientName,

        // Host Contact Info
        hostContactInfo: {
          linkedin: row['Host LinkedIn'] || '',
          email: row['Host Email'] || '',
          website: row['Host Website'] || '',
          raw: row['Host Contact Info'] || '' // Keep original for reference
        },

        // Status: 'needs_itunes_id' if no iTunes ID, otherwise 'identified'
        status: itunesId ? 'identified' : 'needs_itunes_id',

        // Flag for manual completion needed
        needsManualReview: !itunesId,

        // All other CSV columns (preserve everything)
        rawData: row,

        // Timestamps
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),

        // Import metadata
        importedFrom: path.basename(csvFile),
        importedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      batch.set(docRef, outreachDoc);
      importCount++;
      batchCount++;

      // Log if missing iTunes ID
      if (!itunesId) {
        needsManualReviewCount++;
        console.log(`📝 Imported without iTunes ID: ${showName} (${clientName})`);
      }

      // Commit batch every 500 documents (Firestore limit)
      if (batchCount >= 500) {
        await batch.commit();
        console.log(`✅ Imported ${importCount} documents...`);
        batch = db.batch(); // Create new batch
        batchCount = 0;
      }

    } catch (error) {
      errors.push({ itunesId, showName, clientName, error: error.message });
      console.error(`❌ Error importing ${showName} (${itunesId}) for ${clientName}:`, error.message);
    }
  }

  // Commit remaining documents
  if (batchCount > 0) {
    await batch.commit();
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 IMPORT SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successfully imported: ${importCount} documents`);
  console.log(`📝 Needs manual iTunes ID: ${needsManualReviewCount}`);
  console.log(`⚠️  Skipped (no show name): ${skipCount}`);
  console.log(`❌ Errors: ${errors.length}`);
  console.log(`\n💡 Each document has a unique auto-generated ID`);
  console.log(`🔗 Multiple clients can target the same podcast (same iTunes ID)`);
  console.log(`\n🔍 To find podcasts needing manual review:`);
  console.log(`   db.collection('outreach').where('needsManualReview', '==', true).get()`);

  if (errors.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ ERRORS:');
    console.log('='.repeat(60));
    errors.forEach(err => {
      console.log(`  - ${err.clientName} → ${err.showName} (${err.itunesId}): ${err.error}`);
    });
  }

  console.log('\n✨ Import complete!');
  console.log(`\n📍 Your data is now in Firestore collection: "outreach"`);
  console.log(`🔍 Query example: db.collection('outreach').where('clientId', '==', 'client_xyz')`);
}

// Main execution
const csvFile = path.join(__dirname, '..', 'outreach_final_2026_January_CLEANED_V2.csv');

importOutreachToFirestore(csvFile)
  .catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
