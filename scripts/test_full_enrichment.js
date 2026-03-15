'use strict';

/**
 * test_full_enrichment.js
 *
 * Full enrichment pipeline test on 10 random SQLite candidates that are NOT
 * yet in Firestore (English, active 60d, ≥50 eps).
 *
 * Per podcast, tests:
 *   1. SQLite          — title, desc, episodeCount, popularityScore, updateFrequency,
 *                        oldestItemPubdate, itunesType, host, generator, url, link
 *   2. PodcastIndex    — 10 episodes: duration→median(min), transcriptUrls,
 *                        chaptersUrls, guest persons count, titles for guest filter
 *   3. iTunes API      — genres, trackCount, artwork, feedUrl (no auth)
 *   4. Spotify         — discover URL (RSS→DuckDuckGo), scrape rating + review count
 *   5. Reddit API      — mention count, top subreddits (no auth)
 *
 * Usage:
 *   node scripts/test_full_enrichment.js
 *   node scripts/test_full_enrichment.js --count=5   # test only 5 podcasts
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin    = require('firebase-admin');
const crypto   = require('crypto');
const https    = require('https');
const http     = require('http');
const Database = require('better-sqlite3');
const puppeteer = require('puppeteer');
const fs       = require('fs');
const path     = require('path');
const { DB_PATH } = require('./utils/sqliteDb');
const { scrapeSpotifyRating } = require('./utils/spotifyRating');

// ── Config ────────────────────────────────────────────────────────────────────

const COUNT_ARG = (process.argv.find(a => a.startsWith('--count=')) || '--count=10').split('=')[1];
const SAMPLE_SIZE  = Math.max(1, Math.min(20, parseInt(COUNT_ARG, 10) || 10));
const MIN_EPISODES = 50;
const CUTOFF_DAYS  = 60;

const PI_KEY    = process.env.PODCASTINDEX_API_KEY;
const PI_SECRET = process.env.PODCASTINDEX_API_SECRET;

// ── Firebase ──────────────────────────────────────────────────────────────────

const sa = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || ''} ${msg}`);
}

function truncate(s, n = 80) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function fetchUrl(urlStr, opts = {}) {
  const timeoutMs = opts.timeout || 15000;
  const fetchP = new Promise(resolve => {
    let parsed;
    try { parsed = new URL(urlStr); }
    catch (_) { return resolve({ status: 0, body: '', error: 'invalid_url' }); }

    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get({
      hostname: parsed.hostname,
      path    : parsed.pathname + parsed.search,
      headers : {
        'User-Agent'     : opts.userAgent || 'Mozilla/5.0 (compatible; BadasseryBot/1.0)',
        'Accept'         : 'text/html,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {}),
      },
    }, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        resolve(fetchUrl(res.headers.location, opts));
        res.resume();
        return;
      }
      let body = '';
      res.on('data', c => {
        body += c;
        if (body.length > (opts.maxBytes || 300_000)) req.destroy();
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', e => resolve({ status: 0, body: '', error: e.message }));
    req.setTimeout(timeoutMs, () => req.destroy());
  });
  const hardTimeout = new Promise(r =>
    setTimeout(() => r({ status: 0, body: '', error: 'timeout' }), timeoutMs + 2000)
  );
  return Promise.race([fetchP, hardTimeout]);
}

function fetchJson(urlStr, opts = {}) {
  return fetchUrl(urlStr, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } })
    .then(r => {
      try { return { ...r, json: JSON.parse(r.body) }; }
      catch (_) { return { ...r, json: null }; }
    });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── PodcastIndex API — full episode fetch ─────────────────────────────────────

function piAuthHeaders() {
  const epochTime = Math.floor(Date.now() / 1000);
  const hash = crypto.createHash('sha1')
    .update(PI_KEY + PI_SECRET + String(epochTime))
    .digest('hex');
  return {
    'X-Auth-Date'  : String(epochTime),
    'X-Auth-Key'   : PI_KEY,
    'Authorization': hash,
    'User-Agent'   : 'BadasseryPR-EnrichmentTest/1.0',
    'Accept'       : 'application/json',
  };
}

async function fetchEpisodesFull(feedId, max = 10) {
  return fetchJson(
    `https://api.podcastindex.org/api/1.0/episodes/byfeedid?id=${feedId}&max=${max}`,
    { headers: piAuthHeaders(), timeout: 15000 }
  ).then(r => r.json?.items || []);
}

// ── Guest signal detection (same keywords as phase3_filter.js) ────────────────

const GUEST_KW = [
  'interview', ' with ', 'feat', 'featuring', 'guest',
  'joined by', 'talks to', 'speaks with', "today's guest",
  'sits down with', 'in conversation with', 'my guest',
  'welcomes', 'special guest', 'chatting with',
];
const DESC_KW = ['interview', 'interviews', 'guest', 'guests', 'featuring'];

function isGuestEpisode(title) {
  const l = (title || '').toLowerCase();
  return GUEST_KW.some(kw => l.includes(kw));
}
function descLooksGuest(desc) {
  const l = (desc || '').toLowerCase();
  return DESC_KW.some(kw => l.includes(kw));
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  if (s.length === 0) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ── Step 1: Load candidates from SQLite + Firestore dedup ─────────────────────

async function loadCandidates() {
  log('Step 1: Loading SQLite candidates (English, active 60d, ≥50 eps)...', 'PHASE');

  const cutoffTs = Math.floor(Date.now() / 1000) - CUTOFF_DAYS * 86400;
  const sqlite   = new Database(DB_PATH, { readonly: true });

  // Use ORDER BY RANDOM() to get a diverse set across the full 82K pool
  const rows = sqlite.prepare(`
    SELECT
      id            AS feedId,
      url,
      link,
      title,
      description,
      itunesId,
      episodeCount,
      popularityScore,
      updateFrequency,
      newestItemPubdate,
      oldestItemPubdate,
      itunesType,
      host,
      generator,
      language
    FROM podcasts
    WHERE language LIKE 'en%'
      AND newestItemPubdate > ?
      AND episodeCount >= ?
      AND itunesId IS NOT NULL
      AND CAST(itunesId AS TEXT) != ''
      AND CAST(itunesId AS TEXT) != '0'
      AND dead = 0
    ORDER BY RANDOM()
    LIMIT 500
  `).all(cutoffTs, MIN_EPISODES);

  sqlite.close();
  log(`SQLite: ${rows.length} random candidates (from the ~82K pool)`);

  // Dedup against Firestore (load all existing IDs)
  log('Loading existing Firestore IDs...');
  const existingIds = new Set();
  let last = null;
  while (true) {
    let q = db.collection('podcasts')
      .select()
      .orderBy(admin.firestore.FieldPath.documentId())
      .limit(5000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    snap.docs.forEach(d => existingIds.add(d.id));
    last = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r  Loaded ${existingIds.size} Firestore IDs...`);
    if (snap.docs.length < 5000) break;
  }
  process.stdout.write('\n');
  log(`Firestore: ${existingIds.size.toLocaleString()} existing podcasts`);

  // Filter to not-in-Firestore, pick first SAMPLE_SIZE
  const candidates = rows
    .filter(r => !existingIds.has(String(r.itunesId)))
    .slice(0, SAMPLE_SIZE);

  log(`Selected ${candidates.length} new candidates (not in Firestore)`, 'SUCCESS');
  return candidates;
}

// ── Step 2: PodcastIndex episode data ────────────────────────────────────────

async function enrichPodcastIndex(pod, idx) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  [${idx}] SOURCE: PodcastIndex API — "${truncate(pod.title, 50)}"`);
  console.log(`${'─'.repeat(72)}`);
  console.log(`  feedId: ${pod.feedId}  itunesId: ${pod.itunesId}`);

  if (!PI_KEY || !PI_SECRET) {
    console.log('  ⚠️  PODCASTINDEX_API_KEY not set — skipping.');
    return { success: false, reason: 'no_credentials' };
  }

  const episodes = await fetchEpisodesFull(pod.feedId, 10);
  if (!episodes.length) {
    console.log('  ❌  No episodes returned from PI API.');
    return { success: false, reason: 'no_episodes' };
  }

  // Durations → median in minutes
  const durations = episodes.map(e => e.duration || 0).filter(d => d > 0);
  const medianDurSec = median(durations);
  const medianDurMin = medianDurSec !== null ? Math.round(medianDurSec / 60 * 10) / 10 : null;

  // Transcript / chapters / guest counts
  const withTranscript = episodes.filter(e => e.transcriptUrl || (e.transcripts?.length > 0)).length;
  const withChapters   = episodes.filter(e => e.chaptersUrl).length;
  const guestPersons   = episodes.reduce((sum, e) => {
    return sum + (e.persons || []).filter(p => p.role?.toLowerCase() === 'guest').length;
  }, 0);
  const guestTitleHits = episodes.filter(e => isGuestEpisode(e.title)).length;
  const descGuest      = descLooksGuest(pod.description);

  console.log(`  Episodes fetched     : ${episodes.length}`);
  console.log(`  Median duration      : ${medianDurMin !== null ? medianDurMin + ' min' : 'N/A (no duration data)'}`);
  console.log(`  Individual durations : ${durations.map(d => Math.round(d/60) + 'm').join(', ') || 'none'}`);
  console.log(`  With transcript URL  : ${withTranscript}/${episodes.length}`);
  console.log(`  With chapters URL    : ${withChapters}/${episodes.length}`);
  console.log(`  Guest persons tags   : ${guestPersons} (via <podcast:person role="guest">)`);
  console.log(`  Guest title signals  : ${guestTitleHits}/${episodes.length} episode titles`);
  console.log(`  Description keywords : ${descGuest ? 'yes (interview/guest)' : 'no'}`);
  console.log(`  Guest-friendly guess : ${guestPersons > 0 || guestTitleHits >= 2 || descGuest ? '✅ likely' : '❌ unlikely'}`);
  console.log(`\n  Episode titles:`);
  episodes.forEach((e, i) => {
    const tags = [];
    if (e.transcriptUrl || e.transcripts?.length > 0) tags.push('📝 transcript');
    if (e.chaptersUrl) tags.push('📚 chapters');
    if ((e.persons || []).some(p => p.role?.toLowerCase() === 'guest')) tags.push('🎤 guest');
    const dur = e.duration ? `[${Math.round(e.duration/60)}m]` : '';
    console.log(`    ${String(i+1).padStart(2)}. ${dur} ${truncate(e.title, 55)} ${tags.join(' ')}`);
  });

  return {
    success       : true,
    episodeCount  : episodes.length,
    medianDurMin,
    withTranscript,
    withChapters,
    guestPersons,
    guestTitleHits,
    descGuest,
    guestFriendly : guestPersons > 0 || guestTitleHits >= 2 || descGuest,
  };
}

// ── Step 3: iTunes API ────────────────────────────────────────────────────────

async function enrichItunes(pod, idx) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  [${idx}] SOURCE: iTunes API (free, no auth)`);
  console.log(`${'─'.repeat(72)}`);
  console.log(`  itunesId: ${pod.itunesId}`);

  const url = `https://itunes.apple.com/lookup?id=${pod.itunesId}&entity=podcast&country=us`;
  const r = await fetchJson(url, { timeout: 12000 });

  if (r.status !== 200 || !r.json?.results?.[0]) {
    console.log(`  ❌  No data (HTTP ${r.status || 'timeout'})`);
    return { success: false };
  }

  const res = r.json.results[0];
  const genres = (res.genres || []).filter(g => g !== 'Podcasts');

  console.log(`  trackName            : ${res.trackName}`);
  console.log(`  artistName           : ${res.artistName}`);
  console.log(`  primaryGenreName     : ${res.primaryGenreName}`);
  console.log(`  genres               : ${genres.join(', ') || '(none beyond Podcasts)'}`);
  console.log(`  trackCount           : ${res.trackCount} episodes`);
  console.log(`  country              : ${res.country}`);
  console.log(`  contentAdvisoryRating: ${res.contentAdvisoryRating || 'N/A'}`);
  console.log(`  releaseDate          : ${res.releaseDate || 'N/A'}`);
  console.log(`  feedUrl              : ${truncate(res.feedUrl, 80)}`);
  console.log(`  artworkUrl600        : ${(res.artworkUrl600 || '').slice(0, 70)}…`);
  console.log(`\n  ℹ️  iTunes API does NOT return star ratings or review counts.`);
  console.log(`     apple_rating comes from the Python enricher scraping Apple Podcasts pages.`);

  // Check if any rating fields happen to be present (some regions include them)
  if (res.averageUserRating !== undefined) {
    console.log(`  ✅  averageUserRating    : ${res.averageUserRating}`);
    console.log(`  ✅  userRatingCount      : ${res.userRatingCount}`);
  }

  return {
    success     : true,
    trackName   : res.trackName,
    genres,
    primaryGenre: res.primaryGenreName,
    trackCount  : res.trackCount,
    country     : res.country,
    artworkUrl  : res.artworkUrl600,
    feedUrl     : res.feedUrl,
    rating      : res.averageUserRating ?? null,
    ratingCount : res.userRatingCount   ?? null,
  };
}

// ── Step 4: Spotify — URL discovery + rating scrape ───────────────────────────

/**
 * Try to find a Spotify show URL for this podcast via two strategies:
 *   1. Fetch the RSS feed and grep for open.spotify.com/show/ links
 *      (many podcasts embed their own Spotify link in the RSS feed)
 *   2. DuckDuckGo HTML search: site:open.spotify.com/show "podcast title"
 */
async function findSpotifyUrl(pod) {
  // ── Strategy 1: RSS feed scan ────────────────────────────────────────────
  if (pod.url) {
    const rss = await fetchUrl(pod.url, {
      timeout : 10000,
      maxBytes: 80_000,
      userAgent: 'Mozilla/5.0 (compatible; BadasseryBot/1.0)',
    });
    if (rss.status === 200 && rss.body) {
      // Look for Spotify show URL in RSS XML or description
      const m = rss.body.match(/open\.spotify\.com\/show\/([A-Za-z0-9]+)/);
      if (m) {
        const spotifyUrl = `https://open.spotify.com/show/${m[1]}`;
        console.log(`    📡 Found in RSS feed: ${spotifyUrl}`);
        return spotifyUrl;
      }
      // Also look for podcast:id platform="spotify"
      const pid = rss.body.match(/platform=["']spotify["'][^>]*id=["']([^"']+)/i)
               || rss.body.match(/<podcast:id[^>]*platform=["']spotify["'][^>]*>([^<]+)/i);
      if (pid) {
        const spotifyUrl = `https://open.spotify.com/show/${pid[1].trim()}`;
        console.log(`    📡 Found via podcast:id in RSS: ${spotifyUrl}`);
        return spotifyUrl;
      }
    }
  }

  // ── Strategy 2: DuckDuckGo search ────────────────────────────────────────
  const query = `site:open.spotify.com/show "${pod.title.replace(/"/g, '')}"`;
  const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  await sleep(1500); // respectful rate limit

  const ddg = await fetchUrl(ddgUrl, {
    timeout  : 12000,
    maxBytes : 80_000,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  });

  if (ddg.status === 200 && ddg.body) {
    // DuckDuckGo wraps result URLs as: uddg=https%3A%2F%2Fopen.spotify.com%2Fshow%2FXXX
    const m = ddg.body.match(/uddg=https?%3A%2F%2Fopen\.spotify\.com%2Fshow%2F([A-Za-z0-9]+)/i)
           || ddg.body.match(/open\.spotify\.com\/show\/([A-Za-z0-9]+)/i);
    if (m) {
      const spotifyUrl = `https://open.spotify.com/show/${m[1]}`;
      console.log(`    🔍 Found via DuckDuckGo: ${spotifyUrl}`);
      return spotifyUrl;
    }
  }

  return null;
}

async function enrichSpotify(pod, idx, browser) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  [${idx}] SOURCE: Spotify (URL discovery + Puppeteer rating scrape)`);
  console.log(`${'─'.repeat(72)}`);
  console.log(`  Searching for Spotify URL for: "${truncate(pod.title, 55)}"`);

  const spotifyUrl = await findSpotifyUrl(pod);

  if (!spotifyUrl) {
    console.log('  ❌  Could not find Spotify URL (not in RSS, not indexed by DuckDuckGo)');
    return { success: false, reason: 'url_not_found' };
  }

  console.log(`  Spotify URL: ${spotifyUrl}`);
  console.log('  Scraping rating...');

  const result = await scrapeSpotifyRating(spotifyUrl, browser);

  if (!result) {
    console.log('  ⚠️  Rating not found on page (podcast may have no ratings yet)');
    return { success: true, urlFound: true, rating: null, reviewCount: null, spotifyUrl };
  }

  console.log(`  ✅  Rating: ${result.rating} ⭐  (${result.reviewCount?.toLocaleString() ?? 'N/A'} reviews)`);
  return { success: true, urlFound: true, ...result, spotifyUrl };
}

// ── Step 5: Reddit API ────────────────────────────────────────────────────────

async function enrichReddit(pod, idx) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(`  [${idx}] SOURCE: Reddit API (no auth)`);
  console.log(`${'─'.repeat(72)}`);
  console.log(`  Searching for: "${truncate(pod.title, 55)}"`);

  const query = encodeURIComponent(`"${pod.title.replace(/"/g, '')}"`);
  const url   = `https://www.reddit.com/search.json?q=${query}&type=link&sort=relevance&limit=25&t=all`;

  const r = await fetchJson(url, {
    userAgent: 'BadasseryPR-EnrichmentTest/1.0 (by u/BadasseryBot)',
    timeout  : 15000,
  });

  if (r.status !== 200 || !r.json?.data?.children) {
    console.log(`  ❌  Reddit error or rate limit (status ${r.status})`);
    return { success: false, reason: `status_${r.status}` };
  }

  const posts = r.json.data.children.map(c => c.data);
  const subreddits = {};
  let totalScore = 0, totalComments = 0;
  posts.forEach(p => {
    subreddits[p.subreddit] = (subreddits[p.subreddit] || 0) + 1;
    totalScore    += p.score || 0;
    totalComments += p.num_comments || 0;
  });

  const topSubs = Object.entries(subreddits).sort((a, b) => b[1] - a[1]).slice(0, 5);

  console.log(`  Posts found : ${posts.length}`);
  console.log(`  Total upvotes: ${totalScore.toLocaleString()}`);
  console.log(`  Total comments: ${totalComments.toLocaleString()}`);
  if (topSubs.length) {
    console.log(`  Top subreddits:`);
    topSubs.forEach(([sub, n]) => console.log(`    r/${sub}: ${n} post(s)`));
  }
  if (posts.length > 0) {
    console.log(`  Top 3 posts:`);
    posts.slice(0, 3).forEach((p, i) =>
      console.log(`    ${i+1}. [${p.score}↑ ${p.num_comments}💬] r/${p.subreddit} — "${truncate(p.title, 60)}"`)
    );
  }

  return { success: true, postCount: posts.length, totalScore, totalComments, topSubs };
}

// ── Per-podcast report block ───────────────────────────────────────────────────

function printPodcastHeader(pod, idx) {
  console.log('\n' + '═'.repeat(72));
  console.log(`  PODCAST ${idx}/${SAMPLE_SIZE}`);
  console.log('═'.repeat(72));

  const newestDate = pod.newestItemPubdate
    ? new Date(pod.newestItemPubdate * 1000).toISOString().slice(0, 10)
    : 'N/A';
  const oldestDate = pod.oldestItemPubdate
    ? new Date(pod.oldestItemPubdate * 1000).toISOString().slice(0, 10)
    : 'N/A';

  console.log(`  Title            : ${pod.title}`);
  console.log(`  Description      : ${truncate(pod.description, 120)}`);
  console.log(`  itunesId         : ${pod.itunesId}`);
  console.log(`  feedId (PI)      : ${pod.feedId}`);
  console.log(`  episodeCount     : ${pod.episodeCount}`);
  console.log(`  popularityScore  : ${pod.popularityScore ?? 'N/A'}`);
  console.log(`  updateFrequency  : ${pod.updateFrequency ?? 'N/A'} eps/week`);
  console.log(`  newestItemPubdate: ${newestDate}`);
  console.log(`  oldestItemPubdate: ${oldestDate}`);
  console.log(`  itunesType       : ${pod.itunesType || 'N/A'}`);
  console.log(`  host             : ${pod.host || 'N/A'}`);
  console.log(`  generator        : ${pod.generator || 'N/A'}`);
  console.log(`  RSS url          : ${truncate(pod.url, 80)}`);
  console.log(`  website link     : ${truncate(pod.link, 80)}`);
}

// ── Summary table ─────────────────────────────────────────────────────────────

function printSummaryTable(results) {
  console.log('\n\n' + '═'.repeat(90));
  console.log('  SUMMARY TABLE — Data availability across all tested podcasts');
  console.log('═'.repeat(90));

  const header = `  ${'#'.padEnd(3)} ${'Title'.padEnd(35)} ${'PI'.padEnd(8)} ${'iTunes'.padEnd(10)} ${'Spotify'.padEnd(12)} ${'Reddit'.padEnd(10)} ${'Guest?'.padEnd(8)}`;
  console.log(header);
  console.log('  ' + '─'.repeat(87));

  results.forEach((r, i) => {
    const title  = truncate(r.pod.title, 33).padEnd(35);
    const pi     = r.pi.success
      ? `✅${r.pi.episodeCount}ep${r.pi.medianDurMin ? '/' + r.pi.medianDurMin + 'm' : ''}`.padEnd(8)
      : '❌'.padEnd(8);
    const itunes = r.itunes.success
      ? `✅${(r.itunes.primaryGenre || '').slice(0,8)}`.padEnd(10)
      : '❌'.padEnd(10);
    const spotifyUrl = r.spotify.urlFound;
    const spotifyRat = r.spotify.rating;
    const spotifyStr = !spotifyUrl
      ? '❌ no URL'.padEnd(12)
      : spotifyRat ? `✅ ${spotifyRat}⭐`.padEnd(12) : '✅ no rating'.padEnd(12);
    const reddit     = r.reddit.success
      ? `✅${r.reddit.postCount}posts`.padEnd(10)
      : '❌'.padEnd(10);
    const guest      = r.pi.guestFriendly
      ? '✅ yes  '
      : '❌ no   ';

    console.log(`  ${String(i+1).padStart(2)}. ${title} ${pi} ${itunes} ${spotifyStr} ${reddit} ${guest}`);
  });

  console.log('\n  ' + '─'.repeat(87));

  // Availability rates
  const piOk       = results.filter(r => r.pi.success).length;
  const itunesOk   = results.filter(r => r.itunes.success).length;
  const spotUrlOk  = results.filter(r => r.spotify.urlFound).length;
  const spotRatOk  = results.filter(r => r.spotify.rating !== null && r.spotify.rating !== undefined).length;
  const redditOk   = results.filter(r => r.reddit.success).length;
  const guestOk    = results.filter(r => r.pi.guestFriendly).length;
  const n          = results.length;
  const pct        = v => `${v}/${n} (${Math.round(v/n*100)}%)`;

  console.log(`\n  Data availability:`);
  console.log(`    PodcastIndex episodes : ${pct(piOk)}`);
  console.log(`    iTunes API            : ${pct(itunesOk)}`);
  console.log(`    Spotify URL found     : ${pct(spotUrlOk)}`);
  console.log(`    Spotify rating found  : ${pct(spotRatOk)}`);
  console.log(`    Reddit mentions       : ${pct(redditOk)}`);
  console.log(`    Guest-friendly signal : ${pct(guestOk)}`);

  // Episode signal breakdown
  const withTranscripts = results.filter(r => r.pi.withTranscript > 0).length;
  const withChapters    = results.filter(r => r.pi.withChapters > 0).length;
  const withPersons     = results.filter(r => r.pi.guestPersons > 0).length;
  const durAvg = (() => {
    const durs = results.map(r => r.pi.medianDurMin).filter(d => d !== null && d !== undefined);
    return durs.length ? Math.round(durs.reduce((a, b) => a + b) / durs.length * 10) / 10 : null;
  })();

  console.log(`\n  PodcastIndex 2.0 feature adoption (among ${n} podcasts):`);
  console.log(`    With transcript URLs  : ${pct(withTranscripts)}`);
  console.log(`    With chapters URLs    : ${pct(withChapters)}`);
  console.log(`    With guest person tags: ${pct(withPersons)}`);
  console.log(`    Avg median duration   : ${durAvg !== null ? durAvg + ' min' : 'N/A'}`);

  console.log('\n' + '═'.repeat(90));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔬  FULL ENRICHMENT TEST — SQLite candidates not in Firestore');
  console.log('='.repeat(72));
  console.log(`  Sample size  : ${SAMPLE_SIZE}`);
  console.log(`  SQLite DB    : ${DB_PATH}`);
  console.log(`  Criteria     : English, active ${CUTOFF_DAYS}d, ≥${MIN_EPISODES} eps, not in Firestore`);
  console.log('='.repeat(72));
  console.log('');

  const startMs = Date.now();

  // ── Load candidates ────────────────────────────────────────────────────────
  const candidates = await loadCandidates();

  if (candidates.length === 0) {
    log('No candidates found — check that SQLite DB exists and Firestore has documents.', 'ERROR');
    process.exit(1);
  }

  // ── Launch a single Puppeteer browser for all Spotify scrapes ──────────────
  // Spotify requires headless:false to avoid bot detection
  log('Launching Puppeteer browser (headless:false, for Spotify)...');
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });

  // ── Process each podcast ───────────────────────────────────────────────────
  const results = [];

  for (let i = 0; i < candidates.length; i++) {
    const pod = candidates[i];
    const idx = i + 1;

    printPodcastHeader(pod, idx);

    const piResult      = await enrichPodcastIndex(pod, idx);
    await sleep(1100); // PI API rate limit: 1 req/s

    const itunesResult  = await enrichItunes(pod, idx);
    await sleep(500);

    const spotifyResult = await enrichSpotify(pod, idx, browser);
    await sleep(500);

    const redditResult  = await enrichReddit(pod, idx);
    await sleep(1500); // Reddit rate limit

    results.push({
      pod,
      pi     : piResult,
      itunes : itunesResult,
      spotify: spotifyResult,
      reddit : redditResult,
    });

    log(`Podcast ${idx}/${candidates.length} complete.`, 'SUCCESS');
  }

  await browser.close();

  // ── Summary ────────────────────────────────────────────────────────────────
  printSummaryTable(results);

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`\n  Total time: ${elapsed}s`);
  process.exit(0);
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
