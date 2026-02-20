import * as fs from 'fs';
import * as path from 'path';

/**
 * Extract iTunes podcast ID from Apple Podcasts URL
 * Example: https://podcasts.apple.com/us/podcast/product-thinking/id1550800132 -> 1550800132
 */
function extractPodcastIdFromUrl(url: string): string {
  if (!url) return '';

  const match = url.match(/\/id(\d+)/);
  return match ? match[1] : '';
}

/**
 * Remove prefixes like [1%], [5%], [10%] from show names
 * Example: "[5%] Product Thinking" -> "Product Thinking"
 */
function cleanShowName(showName: string): string {
  if (!showName) return showName;

  // Remove [X%] prefix and trim
  return showName.replace(/^\[\d+%\]\s*/, '').trim();
}

/**
 * Parse Host Contact Info field into structured data
 */
function parseHostContactInfo(contactInfo: string): {
  host_linkedin: string;
  host_email: string;
  host_website: string;
} {
  const result = {
    host_linkedin: '',
    host_email: '',
    host_website: ''
  };

  if (!contactInfo) return result;

  // Extract LinkedIn
  const linkedinMatch = contactInfo.match(/LinkedIn\s+(https:\/\/[^\s\n]+)/);
  if (linkedinMatch) {
    result.host_linkedin = linkedinMatch[1].trim();
  }

  // Extract Email
  const emailMatch = contactInfo.match(/mailto:([^\s\n]+)/);
  if (emailMatch) {
    result.host_email = emailMatch[1].trim();
  }

  // Extract Website
  const websiteMatch = contactInfo.match(/Website\s+(https:\/\/[^\s\n]+)/);
  if (websiteMatch) {
    result.host_website = websiteMatch[1].trim();
  }

  return result;
}

/**
 * Simple CSV parser
 */
function parseCSV(content: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = content.split('\n');
  const headers = parseCSVLine(lines[0]);

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse a single CSV line respecting quotes
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      inQuotes = !inQuotes;
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
 * Convert object to CSV line
 */
function toCSVLine(obj: Record<string, string>, headers: string[]): string {
  return headers.map(header => {
    const value = obj[header] || '';
    // Escape quotes and wrap in quotes if contains comma or newline
    if (value.includes(',') || value.includes('\n') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }).join(',');
}

/**
 * Clean and enrich the outreach CSV file
 */
export function cleanOutreachCSV(inputFile: string, outputFile: string): void {
  console.log('🔄 Starting CSV cleaning process...');

  // Read input file
  const content = fs.readFileSync(inputFile, 'utf-8');

  // Remove BOM if present
  const cleanContent = content.replace(/^\uFEFF/, '');

  const { headers, rows } = parseCSV(cleanContent);

  // Add new columns
  const showNameIndex = headers.indexOf('Show Name (from Show Name)');
  const newHeaders = [...headers];
  newHeaders.splice(showNameIndex + 1, 0, 'Show Name Clean', 'iTunes ID');

  const hostInfoIndex = newHeaders.indexOf('Host Contact Info');
  newHeaders.splice(hostInfoIndex + 1, 0, 'Host LinkedIn', 'Host Email', 'Host Website');

  // Process rows
  const processedRows = rows.map(row => {
    const newRow = { ...row };

    // Clean show name
    const showNameFrom = row['Show Name (from Show Name)'] || '';
    newRow['Show Name Clean'] = cleanShowName(showNameFrom);

    // Extract iTunes ID
    const showLink = row['Show link'] || '';
    newRow['iTunes ID'] = extractPodcastIdFromUrl(showLink);

    // Parse host contact info
    const hostContactInfo = row['Host Contact Info'] || '';
    const hostData = parseHostContactInfo(hostContactInfo);
    newRow['Host LinkedIn'] = hostData.host_linkedin;
    newRow['Host Email'] = hostData.host_email;
    newRow['Host Website'] = hostData.host_website;

    return newRow;
  });

  // Write output file
  const outputLines = [
    newHeaders.join(','),
    ...processedRows.map(row => toCSVLine(row, newHeaders))
  ];

  fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf-8');

  console.log(`✅ Cleaned CSV saved to: ${outputFile}`);
  console.log(`📊 Total rows processed: ${processedRows.length}`);

  // Print sample
  if (processedRows.length > 0) {
    console.log('\n📋 Sample of cleaned data (first 3 rows):');
    processedRows.slice(0, 3).forEach((row, i) => {
      console.log(`\n--- Row ${i + 1} ---`);
      console.log(`Client: ${row['Client'] || ''}`);
      console.log(`Show Name Original: ${row['Show Name (from Show Name)'] || ''}`);
      console.log(`Show Name Clean: ${row['Show Name Clean'] || ''}`);
      console.log(`iTunes ID: ${row['iTunes ID'] || ''}`);
      console.log(`Host LinkedIn: ${row['Host LinkedIn'] || ''}`);
      console.log(`Host Email: ${row['Host Email'] || ''}`);
      console.log(`Host Website: ${row['Host Website'] || ''}`);
    });
  }

  console.log('\n✨ Done!');
}

// Main execution
if (require.main === module) {
  const inputFile = path.join(__dirname, '..', '..', '..', 'outreach_final_2026_January-Grid view.csv');
  const outputFile = path.join(__dirname, '..', '..', '..', 'outreach_final_2026_January_CLEANED.csv');

  cleanOutreachCSV(inputFile, outputFile);
}
