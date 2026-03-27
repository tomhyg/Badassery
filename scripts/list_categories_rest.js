/**
 * READ-ONLY — List distinct ai_primary_category (and ai_category) values
 * Uses Firestore REST API with the webapp's public API key.
 * No service account, no npm packages, no writes.
 */

const https = require('https');

const PROJECT_ID = 'brooklynn-61dc8';
const API_KEY    = 'AIzaSyAtzxhchv_2pmSNLXu-IZLYIqTnWop-Q7g';
const BASE_URL   = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`;

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname: 'firestore.googleapis.com',
      path: `/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery?key=${API_KEY}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(opts, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error('JSON parse error: ' + raw.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  const primaryCounts = {};
  const secondaryCounts = {};
  const categoryFieldCounts = {}; // for any field named "ai_category"
  let total = 0;
  let noCategory = 0;
  let pageToken = undefined;
  let page = 0;

  console.log('Querying Firestore REST API (read-only)...\n');

  while (true) {
    page++;
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'podcasts' }],
        select: {
          fields: [
            { fieldPath: 'ai_primary_category' },
            { fieldPath: 'ai_category' },          // in case field is named differently
            { fieldPath: 'ai_secondary_categories' },
            { fieldPath: 'title' },
          ]
        },
        limit: 300
      }
    };
    if (pageToken) query.structuredQuery.offset = pageToken;

    const results = await post(query);

    if (!Array.isArray(results)) {
      console.error('Unexpected response:', JSON.stringify(results).slice(0, 500));
      break;
    }

    // Filter out the "no document" sentinel at the end
    const docs = results.filter(r => r.document);

    if (docs.length === 0) break;

    docs.forEach(r => {
      total++;
      const fields = r.document.fields || {};

      // ai_primary_category
      const primary = fields.ai_primary_category?.stringValue || null;
      // ai_category (alternate field name)
      const alt = fields.ai_category?.stringValue || null;
      // ai_secondary_categories (array)
      const secondary = fields.ai_secondary_categories?.arrayValue?.values?.map(v => v.stringValue).filter(Boolean) || [];

      if (primary) {
        primaryCounts[primary] = (primaryCounts[primary] || 0) + 1;
      } else if (alt) {
        categoryFieldCounts[alt] = (categoryFieldCounts[alt] || 0) + 1;
      } else {
        noCategory++;
      }

      secondary.forEach(s => {
        secondaryCounts[s] = (secondaryCounts[s] || 0) + 1;
      });
    });

    process.stdout.write(`\r  Page ${page} — ${total} podcasts processed...`);

    // Firestore REST runQuery doesn't paginate via token — use offset
    if (docs.length < 300) break;
    pageToken = total; // use offset for next page
  }

  console.log(`\n\n${'='.repeat(70)}`);
  console.log(`  RÉSULTATS — ${total} podcasts scannés`);
  console.log('='.repeat(70));

  // ai_primary_category
  const sortedPrimary = Object.entries(primaryCounts).sort((a, b) => b[1] - a[1]);
  if (sortedPrimary.length > 0) {
    console.log(`\n📂 ai_primary_category — ${sortedPrimary.length} catégories distinctes :`);
    console.log(`${'─'.repeat(70)}`);
    sortedPrimary.forEach(([cat, count]) => {
      const bar = '█'.repeat(Math.round(count / (total || 1) * 40));
      console.log(`  ${String(count).padStart(5)}  ${cat.padEnd(45)} ${bar}`);
    });
  } else {
    console.log('\n  ⚠️  Aucune valeur trouvée pour ai_primary_category');
  }

  // ai_category (alternate)
  if (Object.keys(categoryFieldCounts).length > 0) {
    const sortedAlt = Object.entries(categoryFieldCounts).sort((a, b) => b[1] - a[1]);
    console.log(`\n📂 ai_category (champ alternatif) — ${sortedAlt.length} valeurs :`);
    console.log(`${'─'.repeat(70)}`);
    sortedAlt.forEach(([cat, count]) => {
      console.log(`  ${String(count).padStart(5)}  ${cat}`);
    });
  }

  // ai_secondary_categories
  if (Object.keys(secondaryCounts).length > 0) {
    const sortedSec = Object.entries(secondaryCounts).sort((a, b) => b[1] - a[1]);
    console.log(`\n📂 ai_secondary_categories — ${sortedSec.length} valeurs distinctes :`);
    console.log(`${'─'.repeat(70)}`);
    sortedSec.forEach(([cat, count]) => {
      console.log(`  ${String(count).padStart(5)}  ${cat}`);
    });
  }

  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  Sans catégorie : ${noCategory}`);
  console.log(`${'='.repeat(70)}\n`);
}

run().catch(err => { console.error('\nErreur:', err.message); process.exit(1); });
