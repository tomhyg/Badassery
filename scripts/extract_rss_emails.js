/**
 * extract_rss_emails.js — Extract contact emails from podcast RSS feeds
 *
 * Queries Firestore for podcasts missing contact_email, fetches each RSS feed,
 * parses <itunes:email>, <managingEditor>, or author email, and writes back:
 *   contact_email, contact_email_source, contact_email_extracted_at
 *
 * Usage:
 *   node scripts/extract_rss_emails.js            # full run
 *   node scripts/extract_rss_emails.js --dry-run  # count only, no writes or fetches
 *   node scripts/extract_rss_emails.js --reset    # ignore checkpoint, start fresh
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const admin = require('firebase-admin');

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN    = process.argv.includes('--dry-run');
const RESET      = process.argv.includes('--reset');
const CKPT_PATH  = path.join(__dirname, '../checkpoints/rss_emails.json');
const BATCH_SIZE = 400;
const LOG_EVERY  = 500;
const REQ_DELAY  = 500;   // ms between fetches (2 req/s)
const FETCH_TIMEOUT_MS = 10000;

// ── Firebase ──────────────────────────────────────────────────────────────────

const serviceAccount = require('../serviceAccountKey.json');
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

function eta(processed, total, startMs) {
  if (processed === 0) return '—';
  const elapsed = (Date.now() - startMs) / 1000;
  const rate = processed / elapsed;
  const remaining = (total - processed) / rate;
  const h = Math.floor(remaining / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── RSS fetch ─────────────────────────────────────────────────────────────────

function fetchRSS(url) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), FETCH_TIMEOUT_MS);
    const lib = url.startsWith('https') ? https : http;

    const request = (reqUrl, redirects = 0) => {
      if (redirects > 3) {
        clearTimeout(timeout);
        return reject(new Error('Too many redirects'));
      }
      lib.get(reqUrl, { headers: { 'User-Agent': 'BadasseryPR/1.0' } }, res => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const loc = res.headers.location;
          res.resume();
          return request(loc, redirects + 1);
        }
        if (res.statusCode !== 200) {
          clearTimeout(timeout);
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          clearTimeout(timeout);
          resolve(Buffer.concat(chunks).toString('utf8'));
        });
        res.on('error', err => { clearTimeout(timeout); reject(err); });
      }).on('error', err => { clearTimeout(timeout); reject(err); });
    };

    request(url);
  });
}

// ── Email extraction ──────────────────────────────────────────────────────────

const RE_EMAIL = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

function extractEmail(xml) {
  // 1. <itunes:email>...</itunes:email>
  const itunesMatch = xml.match(/<itunes:email>\s*([^<]+?)\s*<\/itunes:email>/i);
  if (itunesMatch) {
    const email = itunesMatch[1].trim();
    if (RE_EMAIL.test(email)) return { email, source: 'itunes:email' };
  }

  // 2. <managingEditor>...</managingEditor>
  const editorMatch = xml.match(/<managingEditor>\s*([^<]+?)\s*<\/managingEditor>/i);
  if (editorMatch) {
    const raw = editorMatch[1].trim();
    const emailMatch = raw.match(RE_EMAIL);
    if (emailMatch) return { email: emailMatch[0], source: 'managingEditor' };
  }

  // 3. <author> containing an @ sign (channel-level only — first occurrence)
  const authorMatch = xml.match(/<author>\s*([^<]+?)\s*<\/author>/i);
  if (authorMatch) {
    const raw = authorMatch[1].trim();
    const emailMatch = raw.match(RE_EMAIL);
    if (emailMatch) return { email: emailMatch[0], source: 'author' };
  }

  return null;
}

// ── Step 1: Load Firestore podcasts missing contact_email ─────────────────────

async function loadPodcastsToProcess() {
  log('Scanning Firestore for podcasts missing contact_email...', 'PHASE');

  const docs = [];
  let lastDoc = null;

  while (true) {
    // Firestore can't query for "field does not exist" directly —
    // fetch all and filter client-side for missing contact_email
    let q = db.collection('podcasts')
      .select('contact_email', 'rss_url', 'url', 'title')
      .limit(5000);
    if (lastDoc) q = q.startAfter(lastDoc);

    const snap = await q.get();
    if (snap.empty) break;

    snap.docs.forEach(d => {
      const data = d.data();
      if (data.contact_email == null || data.contact_email === '') {
        const feedUrl = data.rss_url || data.url || null;
        if (feedUrl) {
          docs.push({ id: d.id, feedUrl, title: data.title || '' });
        }
      }
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Scanned ${snap.docs.size || snap.docs.length} docs batch, ${docs.length.toLocaleString()} queued...`);

    if (snap.docs.length < 5000) break;
  }

  process.stdout.write('\n');
  log(`${docs.length.toLocaleString()} podcasts need contact_email extraction.`, 'SUCCESS');
  return docs;
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function loadCheckpoint() {
  if (RESET) return null;
  try {
    const raw = fs.readFileSync(CKPT_PATH, 'utf8');
    const ckpt = JSON.parse(raw);
    log(`Resuming from checkpoint: ${ckpt.processedCount.toLocaleString()} already processed.`);
    return ckpt;
  } catch {
    return null;
  }
}

function saveCheckpoint(data) {
  const dir = path.dirname(CKPT_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CKPT_PATH, JSON.stringify(data, null, 2));
}

// ── Main extraction loop ──────────────────────────────────────────────────────

async function run(docs) {
  if (DRY_RUN) {
    log(`[DRY-RUN] Would process ${docs.length.toLocaleString()} podcasts. No fetches or writes.`, 'WARN');
    return;
  }

  if (docs.length === 0) {
    log('All podcasts already have contact_email — nothing to do.', 'SUCCESS');
    return;
  }

  const ckpt = loadCheckpoint();
  const processedIds = new Set(ckpt ? ckpt.processedIds : []);
  const remaining = docs.filter(d => !processedIds.has(d.id));

  log(`Remaining after checkpoint: ${remaining.length.toLocaleString()} podcasts.`, 'INFO');

  let batch      = db.batch();
  let batchCount = 0;
  let processed  = processedIds.size;
  let found      = ckpt?.found || 0;
  let notFound   = ckpt?.notFound || 0;
  let errors     = 0;
  const startMs  = Date.now();

  for (const doc of remaining) {
    let contactEmail = null;
    let source = null;

    try {
      const xml = await fetchRSS(doc.feedUrl);
      const result = extractEmail(xml);
      if (result) {
        contactEmail = result.email;
        source = result.source;
        found++;
      } else {
        notFound++;
      }
    } catch {
      errors++;
      notFound++;
    }

    processedIds.add(doc.id);
    processed++;

    const docRef = db.collection('podcasts').doc(doc.id);
    batch.set(docRef, {
      contact_email             : contactEmail || '',
      contact_email_source      : contactEmail ? 'rss' : null,
      contact_email_extracted_at: admin.firestore.Timestamp.now(),
    }, { merge: true });
    batchCount++;

    if (batchCount >= BATCH_SIZE) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }

    if (processed % LOG_EVERY === 0) {
      const rate = found + notFound > 0
        ? ((found / (found + notFound)) * 100).toFixed(1)
        : '0.0';
      const etaStr = eta(processed - (ckpt?.processedCount || 0), remaining.length, startMs);
      log(
        `Progress: ${processed.toLocaleString()} processed | ` +
        `${found.toLocaleString()} found (${rate}%) | ` +
        `${errors} errors | ETA: ${etaStr}`
      );
      saveCheckpoint({ processedCount: processed, processedIds: [...processedIds], found, notFound, errors, savedAt: new Date().toISOString() });
    }

    await new Promise(r => setTimeout(r, REQ_DELAY));
  }

  if (batchCount > 0) {
    await batch.commit();
  }

  saveCheckpoint({ processedCount: processed, processedIds: [...processedIds], found, notFound, errors, completedAt: new Date().toISOString() });

  const rate = found + notFound > 0 ? ((found / (found + notFound)) * 100).toFixed(1) : '0.0';
  log(
    `Done: ${found.toLocaleString()} emails found (${rate}%), ` +
    `${notFound.toLocaleString()} not found, ${errors} fetch errors.`,
    'SUCCESS'
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  📧  RSS EMAIL EXTRACTOR');
  console.log('='.repeat(72));
  if (DRY_RUN) console.log('  ⚠️  DRY-RUN — no fetches or writes');
  if (RESET)   console.log('  ⚠️  --reset — ignoring checkpoint');
  console.log(`  Checkpoint : ${CKPT_PATH}`);
  console.log(`  Rate limit : ${REQ_DELAY}ms / request (2 req/s)`);
  console.log(`  Extracts   : <itunes:email> → <managingEditor> → <author>`);
  console.log('='.repeat(72));
  console.log('');

  const startTime = Date.now();

  const docs = await loadPodcastsToProcess();
  await run(docs);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('');
  console.log('='.repeat(72));
  console.log(`  Total time: ${elapsed}s`);
  console.log('='.repeat(72));
  process.exit(0);
}

main().catch(err => {
  log(`Fatal error: ${err.message}`, 'ERROR');
  console.error(err.stack);
  process.exit(1);
});
