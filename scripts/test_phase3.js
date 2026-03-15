/**
 * test_phase3.js — Sample 10 random SQLite candidates, fetch their episodes
 * from PodcastIndex, and run the guest-keyword filter used in Phase 3.
 *
 * PASS if EITHER:
 *   - ≥2/10 episode titles match a guest pattern, OR
 *   - podcast description contains a description keyword
 *
 * Usage: node scripts/test_phase3.js
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path     = require('path');
const Database = require('better-sqlite3');
const { PodcastIndexClient } = require('./utils/podcastIndexClient');

const DB_PATH = path.join(__dirname, '../data/podcastindex_feeds.db');

// ── Episode title detection ───────────────────────────────────────────────────

const GUEST_KEYWORDS = [
  'interview', ' with ', 'feat', 'featuring', 'guest',
  'joined by', 'talks to', 'speaks with', "today's guest",
  'sits down with', 'in conversation with', 'my guest',
  'welcomes', 'special guest', 'chatting with',
];

// "Beth McCoy on What Loyalty..." — proper name followed by " on " then capital
const RE_NAME_ON  = /[A-Z][a-z]+ [A-Z][a-z]+ on [A-Z]/;
// Title ending with a delimiter + proper name: "Topic - John Smith"
const RE_NAME_END = / [-|–] [A-Z][a-z]+ [A-Z][a-z]+$/;
// Capitalised name + " on " + capital (looser, single-word first name ok)
const RE_NAME_ON2 = /[A-Z][a-z]+ on [A-Z]/;

const MIN_SIGNALS = 2; // episode-title PASS threshold

// ── Description keyword check ─────────────────────────────────────────────────

const DESC_KEYWORDS = [
  'interview', 'interviews', 'guest', 'guests', 'featuring',
];

// Fixed feed IDs from previous run so results are directly comparable
const FIXED_FEED_IDS = [
  7055407,  // Not the Droids
  1086137,  // The Spud Goodman Show
  743657,   // The CU2.0 Podcast
  6771429,  // Mature Me w/ Rich Wilkerson Jr.
  7239226,  // Profit & Grit with Tyler
  1052918,  // On The Wing Podcast
  4297266,  // Two Chair Turn
  5732971,  // Articles – HoriZone Roundtable
  7155979,  // Hobby Nonsense
  6245897,  // I Doubt It Podcast
];

function detectTitleMatch(title) {
  const lower = title.toLowerCase();
  for (const kw of GUEST_KEYWORDS) {
    if (lower.includes(kw)) return { matched: true, reason: `keyword "${kw.trim()}"` };
  }
  if (RE_NAME_ON.test(title))  return { matched: true, reason: 'regex: Name on Topic' };
  if (RE_NAME_END.test(title)) return { matched: true, reason: 'regex: ends with Name' };
  if (RE_NAME_ON2.test(title)) return { matched: true, reason: 'regex: Name on Capital' };
  return { matched: false, reason: null };
}

function detectDescMatch(description) {
  const lower = (description || '').toLowerCase();
  for (const kw of DESC_KEYWORDS) {
    if (lower.includes(kw)) return { matched: true, keyword: kw };
  }
  return { matched: false, keyword: null };
}

// Return the 120-char window around the first occurrence of keyword in text
function descSnippet(description, keyword) {
  const lower = description.toLowerCase();
  const idx   = lower.indexOf(keyword);
  if (idx === -1) return '';
  const start = Math.max(0, idx - 40);
  const end   = Math.min(description.length, idx + keyword.length + 80);
  const snippet = description.slice(start, end).replace(/\n/g, ' ').trim();
  return (start > 0 ? '…' : '') + snippet + (end < description.length ? '…' : '');
}

async function main() {
  // ── Step 1: Load the same 10 podcasts from SQLite (now including description) ─
  const sqlite = new Database(DB_PATH, { readonly: true });
  const placeholders = FIXED_FEED_IDS.map(() => '?').join(',');
  const rows = sqlite.prepare(
    `SELECT id, title, episodeCount, description FROM podcasts WHERE id IN (${placeholders})`
  ).all(...FIXED_FEED_IDS);
  sqlite.close();

  rows.sort((a, b) => FIXED_FEED_IDS.indexOf(a.id) - FIXED_FEED_IDS.indexOf(b.id));

  console.log('='.repeat(72));
  console.log('  PHASE 3 FILTER v3 — EPISODE TITLES + DESCRIPTION CHECK');
  console.log('='.repeat(72));
  console.log(`  Title keywords : ${GUEST_KEYWORDS.length} strings + 3 regexes`);
  console.log(`  Desc keywords  : ${DESC_KEYWORDS.map(k => `"${k}"`).join(', ')}`);
  console.log(`  PASS if        : ≥${MIN_SIGNALS} title matches  OR  description keyword hit`);
  console.log('='.repeat(72));

  // ── Step 2: Fetch episodes and run both checks ────────────────────────────────
  const client = new PodcastIndexClient();
  let passed = 0;

  for (let i = 0; i < rows.length; i++) {
    const pod = rows[i];
    console.log(`\n[${i + 1}/10] ${pod.title}`);
    console.log(`       feedId: ${pod.id}  |  episodes in DB: ${pod.episodeCount}`);

    // Description check (no API call needed)
    const descResult = detectDescMatch(pod.description);

    // Episode title check
    let episodes = [];
    try {
      episodes = await client.getEpisodesByFeedId(pod.id, 10);
    } catch (err) {
      console.log(`       ⚠️  PodcastIndex error: ${err.message}`);
    }

    let matchCount = 0;
    if (episodes.length > 0) {
      console.log(`\n       Episode titles (${episodes.length} fetched):`);
      for (const ep of episodes) {
        const { matched, reason } = detectTitleMatch(ep.title);
        if (matched) matchCount++;
        const marker = matched ? `  ← ${reason}` : '';
        console.log(`         ${matched ? '✓' : '·'} ${ep.title}${marker}`);
      }
    } else {
      console.log('       No episodes returned by PodcastIndex API.');
    }

    const episodePass = matchCount >= MIN_SIGNALS;
    const descPass    = descResult.matched;
    const overallPass = episodePass || descPass;

    // Determine which check(s) triggered
    let trigger = [];
    if (episodePass) trigger.push(`episodes (${matchCount}/${episodes.length})`);
    if (descPass)    trigger.push(`description ("${descResult.keyword}")`);

    console.log(`\n       Episode matches : ${matchCount}/${episodes.length || 0}`);

    if (descPass) {
      console.log(`       Desc keyword    : "${descResult.keyword}"`);
      console.log(`       Desc snippet    : ${descSnippet(pod.description, descResult.keyword)}`);
    } else {
      console.log(`       Desc keyword    : no match`);
    }

    if (overallPass) passed++;
    const verdict = overallPass ? 'PASS ✅' : 'FAIL ❌';
    const triggerStr = trigger.length ? `triggered by: ${trigger.join(' + ')}` : '';
    console.log(`       Result          : ${verdict}${triggerStr ? `  [${triggerStr}]` : ''}`);
  }

  console.log('\n' + '='.repeat(72));
  console.log(`  Summary: ${passed}/${rows.length} podcasts passed Phase 3 filter`);
  console.log('='.repeat(72));
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
