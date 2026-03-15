'use strict';

/**
 * test_enrichment.js — End-to-end enrichment test
 *
 * Pulls 10 Firestore podcasts with known social presence,
 * builds minimal feed objects (itunesId + url + link only — no social URLs),
 * runs enrichPodcast() on each, then prints a results table comparing
 * discovered vs expected fields.
 *
 * Usage:
 *   node scripts/test_enrichment.js
 *   node scripts/test_enrichment.js --no-spotify   # skip Puppeteer (faster)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin = require('firebase-admin');
const { enrichPodcast } = require('./utils/enrichPodcast');

const SKIP_SPOTIFY = process.argv.includes('--no-spotify');
const N = 10;

// ── Firebase ──────────────────────────────────────────────────────────────────
const sa = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(val) {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') return val.toLocaleString();
  if (typeof val === 'boolean') return val ? 'yes' : 'no';
  const s = String(val);
  return s.length > 40 ? s.slice(0, 38) + '…' : s;
}

function checkmark(val) {
  return (val !== null && val !== undefined && val !== '') ? '✓' : '✗';
}

function domainOf(url) {
  if (!url) return '—';
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return url.slice(0, 20); }
}

// ── Load test podcasts from Firestore ─────────────────────────────────────────

async function loadTestPodcasts() {
  console.log('Loading test podcasts from Firestore…');

  // Want podcasts that have: url (RSS), link (homepage), and preferably social presence
  // Query for docs with website_instagram set (known social presence) + url set
  const snap = await db.collection('podcasts')
    .where('website_instagram', '!=', '')
    .select('title', 'url', 'link', 'itunesId',
            'website_instagram', 'website_twitter', 'website_linkedin',
            'website_youtube', 'website_spotify', 'website_facebook',
            'apple_rating', 'apple_rating_count')
    .limit(100)
    .get();

  const candidates = snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(d => d.url && d.url.startsWith('http'));

  if (candidates.length === 0) {
    throw new Error('No suitable test podcasts found in Firestore');
  }

  // Shuffle and take N
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const selected = candidates.slice(0, N);

  console.log(`Selected ${selected.length} test podcasts.\n`);
  return selected;
}

// ── Run enrichment on one podcast ─────────────────────────────────────────────

async function testOne(doc) {
  // Build a minimal feed object — strip social URLs to simulate a brand-new podcast
  const feed = {
    itunesId : doc.id,
    url      : doc.url   || '',
    link     : doc.link  || '',
    title    : doc.title || '',
  };

  const known = {
    website_instagram : doc.website_instagram  || '',
    website_twitter   : doc.website_twitter    || '',
    website_linkedin  : doc.website_linkedin   || '',
    website_youtube   : doc.website_youtube    || '',
    website_spotify   : doc.website_spotify    || '',
    apple_rating      : doc.apple_rating       ?? null,
    apple_rating_count: doc.apple_rating_count ?? null,
  };

  const startMs = Date.now();

  // If skipping Spotify, patch out the Spotify step temporarily
  if (SKIP_SPOTIFY) {
    // Pre-set website_spotify to empty so enrichSpotify is a no-op
    feed._skipSpotify = true;
  }

  await enrichPodcast(feed, []);

  const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);

  return { feed, known, elapsed };
}

// ── Print results table ───────────────────────────────────────────────────────

function printTable(results) {
  const COL = {
    title       : 22,
    itunesId    : 12,
    appleRating : 10,
    appleCount  : 10,
    email       : 18,
    instagram   : 10,
    twitter     : 10,
    linkedin    : 10,
    youtube     : 10,
    spotify     : 10,
    spotifyRtg  : 10,
    ytSubs      : 10,
    igFollowers : 12,
    elapsed     : 6,
  };

  const pad = (s, n) => String(s ?? '').padEnd(n).slice(0, n);
  const divider = '─'.repeat(
    Object.values(COL).reduce((a, b) => a + b + 1, 0)
  );

  console.log('\n' + '='.repeat(divider.length));
  console.log('  ENRICHMENT TEST RESULTS');
  console.log('='.repeat(divider.length));
  if (SKIP_SPOTIFY) console.log('  (Spotify Puppeteer skipped — run without --no-spotify for full test)');
  console.log('');

  // Header
  console.log(
    pad('Title',         COL.title)      + ' ' +
    pad('itunesId',      COL.itunesId)   + ' ' +
    pad('AppleRtg',      COL.appleRating)+ ' ' +
    pad('AppleN',        COL.appleCount) + ' ' +
    pad('Email',         COL.email)      + ' ' +
    pad('IG',            COL.instagram)  + ' ' +
    pad('TW',            COL.twitter)    + ' ' +
    pad('LI',            COL.linkedin)   + ' ' +
    pad('YT',            COL.youtube)    + ' ' +
    pad('SP',            COL.spotify)    + ' ' +
    pad('SpRtg',         COL.spotifyRtg) + ' ' +
    pad('YTSubs',        COL.ytSubs)     + ' ' +
    pad('IGFollowers',   COL.igFollowers)+ ' ' +
    pad('Sec',           COL.elapsed)
  );
  console.log(divider);

  // Per-podcast rows
  for (const { feed, known, elapsed } of results) {
    const appleMatch = (feed.apple_rating !== null)
      ? (known.apple_rating !== null && Math.abs(feed.apple_rating - known.apple_rating) < 0.2 ? '✓' : '~')
      : '✗';

    const igMatch = feed.website_instagram
      ? (known.website_instagram && domainOf(feed.website_instagram) === domainOf(known.website_instagram) ? '✓' : '~')
      : '✗';

    const twMatch = feed.website_twitter ? (known.website_twitter ? '✓' : '~') : '✗';
    const liMatch = feed.website_linkedin ? (known.website_linkedin ? '✓' : '~') : '✗';
    const ytMatch = feed.website_youtube  ? (known.website_youtube  ? '✓' : '~') : '✗';
    const spMatch = feed.website_spotify  ? (known.website_spotify  ? '✓' : '~') : '✗';

    console.log(
      pad((feed.title || '').slice(0, COL.title),  COL.title)       + ' ' +
      pad(feed.itunesId,                            COL.itunesId)    + ' ' +
      pad(feed.apple_rating !== null ? `${appleMatch}${feed.apple_rating}` : '✗', COL.appleRating) + ' ' +
      pad(feed.apple_rating_count !== null ? `${feed.apple_rating_count}` : '✗',  COL.appleCount)  + ' ' +
      pad(feed.rss_owner_email ? `✓ ${feed.rss_owner_email.slice(0, 14)}` : '✗',   COL.email)      + ' ' +
      pad(`${igMatch}${feed.website_instagram ? domainOf(feed.website_instagram).slice(0, 7) : ''}`, COL.instagram) + ' ' +
      pad(`${twMatch}${feed.website_twitter   ? domainOf(feed.website_twitter).slice(0, 7)   : ''}`, COL.twitter)   + ' ' +
      pad(`${liMatch}${feed.website_linkedin  ? domainOf(feed.website_linkedin).slice(0, 7)  : ''}`, COL.linkedin)  + ' ' +
      pad(`${ytMatch}${feed.website_youtube   ? domainOf(feed.website_youtube).slice(0, 7)   : ''}`, COL.youtube)   + ' ' +
      pad(`${spMatch}${feed.website_spotify   ? 'spotify'                                    : ''}`, COL.spotify)   + ' ' +
      pad(feed.spotify_rating !== null ? String(feed.spotify_rating) : '—', COL.spotifyRtg)         + ' ' +
      pad(feed.yt_subscribers !== null ? feed.yt_subscribers.toLocaleString() : '—', COL.ytSubs)    + ' ' +
      pad(feed.instagram_followers !== null ? feed.instagram_followers.toLocaleString() : '—', COL.igFollowers) + ' ' +
      pad(elapsed, COL.elapsed)
    );
  }

  console.log(divider);

  // Summary stats
  const total  = results.length;
  const counts = {
    apple_rating        : results.filter(r => r.feed.apple_rating      !== null).length,
    apple_rating_count  : results.filter(r => r.feed.apple_rating_count !== null).length,
    rss_owner_email     : results.filter(r => r.feed.rss_owner_email    !== '').length,
    website_instagram   : results.filter(r => r.feed.website_instagram  !== '').length,
    website_twitter     : results.filter(r => r.feed.website_twitter    !== '').length,
    website_linkedin    : results.filter(r => r.feed.website_linkedin   !== '').length,
    website_youtube     : results.filter(r => r.feed.website_youtube    !== '').length,
    website_spotify     : results.filter(r => r.feed.website_spotify    !== '').length,
    spotify_rating      : results.filter(r => r.feed.spotify_rating     !== null).length,
    yt_subscribers      : results.filter(r => r.feed.yt_subscribers     !== null).length,
    instagram_followers : results.filter(r => r.feed.instagram_followers !== null).length,
  };

  const pct = n => `${n}/${total} (${Math.round(n / total * 100)}%)`;

  console.log('');
  console.log('  FIELD COVERAGE SUMMARY');
  console.log('  ' + '─'.repeat(44));
  console.log(`  apple_rating          : ${pct(counts.apple_rating)}`);
  console.log(`  apple_rating_count    : ${pct(counts.apple_rating_count)}`);
  console.log(`  rss_owner_email       : ${pct(counts.rss_owner_email)}`);
  console.log(`  website_instagram     : ${pct(counts.website_instagram)}`);
  console.log(`  website_twitter       : ${pct(counts.website_twitter)}`);
  console.log(`  website_linkedin      : ${pct(counts.website_linkedin)}`);
  console.log(`  website_youtube       : ${pct(counts.website_youtube)}`);
  console.log(`  website_spotify       : ${pct(counts.website_spotify)}`);
  if (!SKIP_SPOTIFY) {
    const withSpotify = results.filter(r => r.feed.website_spotify !== '').length;
    console.log(`  spotify_rating        : ${counts.spotify_rating}/${withSpotify} of those with Spotify URL`);
  }
  console.log(`  yt_subscribers        : ${pct(counts.yt_subscribers)}${!process.env.YOUTUBE_API_KEY ? ' (no YOUTUBE_API_KEY — always 0)' : ''}`);
  console.log(`  instagram_followers   : ${pct(counts.instagram_followers)}`);

  console.log('');
  console.log('  Legend: ✓ = found & matches known  ~ = found but differs  ✗ = not found');
  console.log('='.repeat(divider.length));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔬  ENRICHMENT PIPELINE TEST');
  console.log('='.repeat(72));
  if (SKIP_SPOTIFY) console.log('  Mode: --no-spotify (Puppeteer Spotify scrape skipped)');
  console.log('');

  const docs    = await loadTestPodcasts();
  const results = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    process.stdout.write(`  [${i + 1}/${docs.length}] Enriching "${(doc.title || doc.id).slice(0, 50)}"… `);
    try {
      const result = await testOne(doc);
      results.push(result);
      process.stdout.write(`done (${result.elapsed}s)\n`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      results.push({
        feed    : { itunesId: doc.id, title: doc.title },
        known   : {},
        elapsed : '0',
      });
    }

    // 1s gap between podcasts (iTunes rate limit)
    if (i < docs.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  printTable(results);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
