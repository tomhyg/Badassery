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
 * Extract unique client names from CSV
 */
function extractClientNames(csvFile) {
  console.log('📂 Reading CSV file...\n');

  const content = fs.readFileSync(csvFile, 'utf-8');
  const cleanContent = content.replace(/^\uFEFF/, '');

  const allRows = parseCSVProper(cleanContent);
  const headers = allRows[0];
  const dataRows = allRows.slice(1);

  // Find Client column index
  const clientIndex = headers.indexOf('Client');
  if (clientIndex === -1) {
    console.error('❌ Column "Client" not found in CSV!');
    process.exit(1);
  }

  // Extract unique client names
  const clientNames = new Set();
  dataRows.forEach(row => {
    const clientName = row[clientIndex];
    if (clientName && clientName.trim()) {
      clientNames.add(clientName.trim());
    }
  });

  // Sort alphabetically
  const sortedClients = Array.from(clientNames).sort();

  console.log('='.repeat(60));
  console.log('📊 UNIQUE CLIENT NAMES FOUND');
  console.log('='.repeat(60));
  console.log(`Total unique clients: ${sortedClients.length}\n`);

  sortedClients.forEach((name, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${name}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('🔧 SUGGESTED MAPPING FOR import_outreach_to_firestore.js');
  console.log('='.repeat(60));
  console.log('\nconst CLIENT_NAME_TO_ID = {');
  sortedClients.forEach(name => {
    // Generate a suggested ID based on the name
    const suggestedId = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    console.log(`  '${name}': 'client_${suggestedId}',`);
  });
  console.log('};\n');

  console.log('='.repeat(60));
  console.log('📝 NEXT STEPS');
  console.log('='.repeat(60));
  console.log('1. Copy the mapping above');
  console.log('2. Match each client name with their actual Firestore ID');
  console.log('3. Update the CLIENT_NAME_TO_ID in import_outreach_to_firestore.js');
  console.log('4. Example from your Firestore:');
  console.log('   "Product Tranquility" → "4FEAWs03kOjBQLrn2Hd7O"');
  console.log('='.repeat(60) + '\n');
}

// Main execution
const csvFile = path.join(__dirname, '..', 'outreach_final_2026_January_CLEANED_V2.csv');

extractClientNames(csvFile);
