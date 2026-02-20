const fs = require('fs');
const path = require('path');

/**
 * Parse CSV properly handling multiline fields
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
 * Export missing data to CSV (can be opened in Excel)
 */
function exportMissingDataToExcel(csvFile) {
  console.log('📂 Reading CSV file...\n');

  const content = fs.readFileSync(csvFile, 'utf-8');
  const cleanContent = content.replace(/^\uFEFF/, '');

  const allRows = parseCSVProper(cleanContent);
  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  // Convert to objects
  const rows = dataRows.map(values => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    return row;
  });

  // Find rows without iTunes ID
  const missingItunesId = [];
  const missingShowName = [];

  rows.forEach((row, index) => {
    const itunesId = row['iTunes ID'];
    const showName = row['Show Name Clean'];
    const originalShowName = row['Show Name (from Show Name)'];
    const client = row['Client'];
    const showLink = row['Show link'];

    if (!itunesId || itunesId.trim() === '') {
      missingItunesId.push({
        rowNumber: index + 2, // +2 because Excel starts at 1 and we skip header
        client: client,
        showName: showName || originalShowName || '(empty)',
        showLink: showLink,
        hostEmail: row['Host Email'] || '',
        hostLinkedIn: row['Host LinkedIn'] || '',
        notes: row['Notes'] || ''
      });
    }

    if (!showName || showName.trim() === '') {
      missingShowName.push({
        rowNumber: index + 2,
        client: client,
        originalShowName: originalShowName || '(empty)',
        showLink: showLink,
        itunesId: itunesId || ''
      });
    }
  });

  console.log(`📝 Found ${missingItunesId.length} rows without iTunes ID`);
  console.log(`⚠️  Found ${missingShowName.length} rows without Show Name\n`);

  // Create CSV for missing iTunes IDs
  const missingItunesIdCSV = [
    'Row Number,Client,Show Name,Show Link,Host Email,Host LinkedIn,Notes,Action Needed',
    ...missingItunesId.map(row => {
      return [
        row.rowNumber,
        escapeCSV(row.client),
        escapeCSV(row.showName),
        escapeCSV(row.showLink),
        escapeCSV(row.hostEmail),
        escapeCSV(row.hostLinkedIn),
        escapeCSV(row.notes),
        'Find iTunes ID manually'
      ].join(',');
    })
  ].join('\n');

  // Create CSV for missing Show Names
  const missingShowNameCSV = [
    'Row Number,Client,Original Show Name,Show Link,iTunes ID,Action Needed',
    ...missingShowName.map(row => {
      return [
        row.rowNumber,
        escapeCSV(row.client),
        escapeCSV(row.originalShowName),
        escapeCSV(row.showLink),
        escapeCSV(row.itunesId),
        'Add show name manually'
      ].join(',');
    })
  ].join('\n');

  // Write files
  const outputDir = path.dirname(csvFile);
  const missingItunesIdFile = path.join(outputDir, 'MISSING_ITUNES_IDS.csv');
  const missingShowNameFile = path.join(outputDir, 'MISSING_SHOW_NAMES.csv');

  fs.writeFileSync(missingItunesIdFile, '\uFEFF' + missingItunesIdCSV, 'utf-8'); // Add BOM for Excel
  fs.writeFileSync(missingShowNameFile, '\uFEFF' + missingShowNameCSV, 'utf-8');

  console.log('✅ Files created:');
  console.log(`   📄 ${missingItunesIdFile}`);
  console.log(`   📄 ${missingShowNameFile}`);
  console.log('\n💡 You can open these files directly in Excel!');
  console.log('📝 Fill in the missing data and update Firestore manually.\n');

  // Print summary
  console.log('='.repeat(60));
  console.log('📊 SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total rows in CSV: ${rows.length}`);
  console.log(`Missing iTunes ID: ${missingItunesId.length}`);
  console.log(`Missing Show Name: ${missingShowName.length}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Escape CSV field
 */
function escapeCSV(field) {
  if (!field) return '';
  const value = String(field).replace(/"/g, '""');
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value}"`;
  }
  return value;
}

// Main execution
const csvFile = path.join(__dirname, '..', 'outreach_final_2026_January_CLEANED_V2.csv');
exportMissingDataToExcel(csvFile);
