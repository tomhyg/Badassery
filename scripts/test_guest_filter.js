/**
 * test_guest_filter.js
 *
 * Tests the two-step guest-friendly detection cascade on 10 random SQLite
 * candidates (English, active 60d, ≥50 eps, not already in Firestore).
 *
 * Step 1 — persons[] check (PodcastIndex API)
 *   Fetch last 10 episodes via /episodes/byfeedid.
 *   If ≥2 have persons[] with role:"guest" → resolved, skip Step 2.
 *
 * Step 2 — AI analysis (Gemini 2.5 Flash Lite)
 *   Send prompt to Gemini 2.5 Flash Lite.
 *   Parse JSON response for { guest_friendly, confidence, reason }.
 *
 * Usage:
 *   node scripts/test_guest_filter.js
 *
 * Requires in .env:
 *   PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET
 *   GEMINI_API_KEY
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin    = require('firebase-admin');
const Database = require('better-sqlite3');
const crypto   = require('crypto');
const https    = require('https');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { DB_PATH } = require('./utils/sqliteDb');

// ── Firebase ─────────────────────────────────────────────────────────────────

const sa = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const fsdb = admin.firestore();

// ── Credentials ───────────────────────────────────────────────────────────────

const PI_KEY    = process.env.PODCASTINDEX_API_KEY;
const PI_SECRET = process.env.PODCASTINDEX_API_SECRET;
const GEM_KEY   = process.env.GEMINI_API_KEY;

if (!PI_KEY || !PI_SECRET) { console.error('❌  Missing PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET'); process.exit(1); }
if (!GEM_KEY)              { console.error('❌  Missing GEMINI_API_KEY'); process.exit(1); }

// ── Config ────────────────────────────────────────────────────────────────────

const MIN_EPISODES = 50;
const CUTOFF_TS    = Math.floor(Date.now() / 1000) - 60 * 86400;
const SAMPLE_POOL  = 200;   // SQLite random sample to draw from
const SAMPLE_SIZE  = 10;    // final candidates to test

// Approximate pricing per 1M tokens (verify at vendor docs)
const PRICE = {
  gemini : { in: 0.075, out: 0.30  },   // Gemini 2.5 Flash Lite
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function estimateTokens(text) { return Math.ceil((text || '').length / 4); }
function truncate(s, n) { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }

// ── PodcastIndex (rate-limited at ~0.9 req/s) ────────────────────────────────

let _piLastCall = 0;
async function piThrottle() {
  const wait = 1150 - (Date.now() - _piLastCall);
  if (wait > 0) await sleep(wait);
  _piLastCall = Date.now();
}

function piRequest(urlPath) {
  return new Promise((resolve, reject) => {
    const epoch = Math.floor(Date.now() / 1000);
    const hash  = crypto.createHash('sha1').update(PI_KEY + PI_SECRET + epoch).digest('hex');
    const req   = https.get(
      {
        hostname: 'api.podcastindex.org',
        path    : '/api/1.0' + urlPath,
        headers : {
          'X-Auth-Date'  : String(epoch),
          'X-Auth-Key'   : PI_KEY,
          'Authorization': hash,
          'User-Agent'   : 'BadasseryPR-GuestFilterTest/1.0',
        },
      },
      res => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          try { resolve(JSON.parse(body)); }
          catch (e) { reject(new Error('PI JSON: ' + e.message)); }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('PI timeout')));
  });
}

async function fetchEpisodes(feedId, max = 10) {
  await piThrottle();
  const data = await piRequest(`/episodes/byfeedid?id=${feedId}&max=${max}`);
  return (data.items || []).map(ep => ({
    title       : ep.title       || '',
    description : ep.description || '',
    persons     : ep.persons     || [],
  }));
}

// ── Gemini ────────────────────────────────────────────────────────────────────

const gemModel = new GoogleGenerativeAI(GEM_KEY).getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

async function callGemini(prompt) {
  const result  = await gemModel.generateContent(prompt);
  const text    = result.response.text();
  return { text, outToks: estimateTokens(text) };
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildPrompt(podcast, episodes) {
  const epText = episodes.map((e, i) =>
    `Episode ${i + 1}:\nTitle: ${e.title}\nDescription: ${e.description || '(no description)'}`
  ).join('\n\n');

  return `You are evaluating whether a podcast regularly features external guests for interviews or conversations.

Podcast title: ${podcast.title}
Podcast description: ${podcast.description || '(no description)'}

Last 10 episodes:
${epText}

Answer ONLY with a JSON object:
{
  "guest_friendly": true/false,
  "confidence": "high/medium/low",
  "reason": "one sentence explanation"
}`;
}

function parseJSON(text) {
  try {
    const m = (text || '').match(/\{[\s\S]*?\}/);
    if (m) return JSON.parse(m[0]);
  } catch (_) {}
  return null;
}

// ── Load candidates ───────────────────────────────────────────────────────────

async function loadCandidates() {
  // Random sample from SQLite
  const sqlite = new Database(DB_PATH, { readonly: true });
  const rows = sqlite.prepare(`
    SELECT id, itunesId, title, description, episodeCount, newestItemPubdate
    FROM podcasts
    WHERE language LIKE 'en%'
      AND newestItemPubdate > ?
      AND episodeCount >= ?
      AND itunesId IS NOT NULL
      AND CAST(itunesId AS TEXT) != ''
      AND CAST(itunesId AS TEXT) != '0'
    ORDER BY RANDOM()
    LIMIT ?
  `).all(CUTOFF_TS, MIN_EPISODES, SAMPLE_POOL);
  sqlite.close();

  // Load all Firestore IDs for dedup
  process.stdout.write(`  Loading Firestore IDs for dedup...`);
  const existing = new Set();
  let last = null;
  while (true) {
    let q = fsdb.collection('podcasts')
      .select()
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(5000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach(d => existing.add(d.id));
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 5000) break;
  }
  console.log(` ${existing.size.toLocaleString()} existing IDs loaded.\n`);

  // Dedup and take first SAMPLE_SIZE
  const candidates = [];
  for (const row of rows) {
    if (existing.has(String(row.itunesId))) continue;
    candidates.push({ ...row, itunesId: String(row.itunesId) });
    if (candidates.length >= SAMPLE_SIZE) break;
  }
  return candidates;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔍  GUEST FILTER CASCADE TEST — 10 random SQLite candidates');
  console.log('='.repeat(72));
  console.log('');

  const candidates = await loadCandidates();
  if (candidates.length === 0) { console.error('No candidates found.'); process.exit(1); }
  console.log(`  Testing ${candidates.length} candidates.\n`);

  // Accumulators
  let resolvedByPersons = 0, resolvedByAI = 0;
  let gemTotalIn = 0, gemTotalOut = 0;

  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];

    console.log('═'.repeat(72));
    console.log(`[${i + 1}/${candidates.length}] ${p.title}`);
    console.log(`  itunesId: ${p.itunesId}  |  feedId: ${p.id}  |  episodes in DB: ${p.episodeCount}`);
    console.log(`  Description: ${truncate(p.description, 160)}`);
    console.log('');

    // ── Step 1: persons[] check ─────────────────────────────────────────────

    console.log('  STEP 1 — persons[] check');
    let episodes = [];

    try {
      episodes = await fetchEpisodes(p.id, 10);
      const withPersons = episodes.filter(e => e.persons.length > 0);
      const withGuests  = episodes.filter(e => e.persons.some(x => x.role === 'guest'));
      console.log(`  Episodes fetched: ${episodes.length}`);
      console.log(`  With persons[]  : ${withPersons.length}`);
      console.log(`  With role:guest : ${withGuests.length}`);

      if (withGuests.length >= 2) {
        console.log(`  ✅  RESOLVED by persons[] → guest_friendly: true`);
        withGuests.forEach(e => {
          const names = e.persons.filter(x => x.role === 'guest').map(x => x.name).join(', ');
          console.log(`      "${truncate(e.title, 70)}" → ${names}`);
        });
        resolvedByPersons++;
        console.log('');
        continue;
      }
      console.log(`  → Insufficient guest persons[], proceeding to Step 2`);
    } catch (err) {
      console.log(`  Step 1 error: ${err.message} — proceeding to Step 2`);
    }

    // ── Step 2: AI analysis ──────────────────────────────────────────────────

    console.log('\n  STEP 2 — AI analysis (Gemini 2.5 Flash Lite)');
    console.log('  Episodes sent:');
    for (let j = 0; j < episodes.length; j++) {
      const e = episodes[j];
      console.log(`    ${j + 1}. "${truncate(e.title, 60)}"`);
      if (e.description) console.log(`       ${truncate(e.description, 100)}`);
    }

    const prompt = buildPrompt(p, episodes.slice(0, 10));
    const inToks = estimateTokens(prompt);
    console.log(`\n  Prompt size: ~${inToks} tokens`);

    const gemRaw   = await callGemini(prompt).catch(e => ({ error: e.message }));
    const gemParsed = parseJSON(gemRaw?.text || '');
    if (gemRaw?.error) {
      console.log(`  ERROR: ${gemRaw.error}`);
    } else if (gemParsed) {
      console.log(`  guest_friendly : ${gemParsed.guest_friendly}`);
      console.log(`  confidence     : ${gemParsed.confidence}`);
      console.log(`  reason         : ${gemParsed.reason}`);
      const outT = gemRaw.outToks || 0;
      console.log(`  tokens         : ~${inToks} in / ~${outT} out`);
      gemTotalIn  += inToks;
      gemTotalOut += outT;
    } else {
      console.log(`  (could not parse JSON) raw: ${truncate(gemRaw?.text, 200)}`);
    }

    resolvedByAI++;
    console.log('');
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  const gemCost    = (gemTotalIn * PRICE.gemini.in + gemTotalOut * PRICE.gemini.out) / 1_000_000;
  const aiCount    = resolvedByAI; // those that went through AI
  const totalTested = resolvedByPersons + resolvedByAI;

  // Extrapolate to 82,642 candidates
  const scale    = aiCount > 0 ? 82_642 / aiCount : 0;
  const gemScale = (gemCost * scale).toFixed(4);

  console.log('='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Total tested             : ${totalTested}`);
  console.log(`  Resolved by persons[]    : ${resolvedByPersons}`);
  console.log(`  Reached AI (Step 2)      : ${resolvedByAI}`);
  console.log('');
  console.log('  Gemini 2.5 Flash Lite');
  console.log(`    Input tokens           : ${gemTotalIn.toLocaleString()}`);
  console.log(`    Output tokens          : ${gemTotalOut.toLocaleString()}`);
  console.log(`    Cost (${aiCount} pods)           : $${gemCost.toFixed(6)}`);
  if (scale > 0) console.log(`    Extrapolated (82,642)  : ~$${gemScale}`);
  console.log('');
  console.log('  * Pricing is approximate — verify at:');
  console.log('    https://ai.google.dev/gemini-api/docs/models  (Gemini)');
  console.log('='.repeat(72));

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
