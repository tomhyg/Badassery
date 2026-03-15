/**
 * test_data_enrichment.js
 *
 * Fetches ALL available enrichment data for 1 random Firestore podcast
 * that has both website_youtube and website_instagram populated.
 *
 * Sources tested:
 *   1. YouTube Data API v3  (requires YOUTUBE_API_KEY in .env)
 *   2. Instagram             public page scraping (no auth)
 *   3. Spotify               oEmbed + public page scraping
 *   4. Reddit API            search endpoint (no auth)
 *   5. iTunes/Apple API      lookup endpoint (no auth)
 *   6. PodcastIndex SQLite   local DB query
 *
 * Usage:
 *   node scripts/test_data_enrichment.js
 *
 * Optional env var:
 *   YOUTUBE_API_KEY — Google Cloud Console, YouTube Data API v3 (free quota: 10,000 units/day)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const admin    = require('firebase-admin');
const https    = require('https');
const http     = require('http');
const Database = require('better-sqlite3');
const { DB_PATH } = require('./utils/sqliteDb');

// ── Firebase ──────────────────────────────────────────────────────────────────

const sa = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const fsdb = admin.firestore();

// ── Config ────────────────────────────────────────────────────────────────────

const YT_KEY = process.env.YOUTUBE_API_KEY || '';
const YT_API = 'www.googleapis.com';

// ── Utilities ─────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function elapsed(startMs) {
  return ((Date.now() - startMs) / 1000).toFixed(2) + 's';
}

function truncate(s, n = 200) {
  s = (s || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/** Fetch a URL and return { status, body, ms }. Follows 1 redirect. */
function fetchUrl(urlStr, opts = {}) {
  const timeoutMs = opts.timeout || 15000;

  const fetchPromise = new Promise(resolve => {
    const start = Date.now();
    let parsed;
    try { parsed = new URL(urlStr); } catch (e) { return resolve({ status: 0, body: '', error: 'invalid url', ms: 0 }); }

    const lib     = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      path    : parsed.pathname + parsed.search,
      headers : {
        'User-Agent'     : opts.userAgent || 'Mozilla/5.0 (compatible; BadasseryBot/1.0)',
        'Accept'         : 'text/html,application/xhtml+xml,application/json,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {}),
      },
    };

    const req = lib.get(reqOpts, res => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        resolve(fetchUrl(res.headers.location, { ...opts, timeout: Math.max(1000, timeoutMs - (Date.now() - start)) }));
        res.resume();
        return;
      }
      let body = '';
      res.on('data', c => { body += c; if (body.length > (opts.maxBytes || 200_000)) req.destroy(); });
      res.on('end', () => resolve({ status: res.statusCode, body, ms: Date.now() - start }));
    });
    req.on('error', e => resolve({ status: 0, body: '', error: e.message, ms: Date.now() - start }));
    req.on('timeout', () => { req.destroy(); });
    req.setTimeout(timeoutMs);
  });

  // Hard external timeout to catch connections that hang before socket timeout fires
  const hardTimeout = new Promise(resolve =>
    setTimeout(() => resolve({ status: 0, body: '', error: 'hard_timeout', ms: timeoutMs }), timeoutMs + 2000)
  );

  return Promise.race([fetchPromise, hardTimeout]);
}

function fetchJson(urlStr, opts = {}) {
  return fetchUrl(urlStr, { ...opts, headers: { Accept: 'application/json', ...(opts.headers || {}) } })
    .then(r => {
      try { return { ...r, json: JSON.parse(r.body) }; }
      catch (_) { return { ...r, json: null }; }
    });
}

/** Normalise a messy social URL to a full https:// URL */
function normaliseUrl(raw) {
  if (!raw) return null;
  raw = raw.trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return 'https://' + raw;
}

/** Extract path segments from a URL */
function urlPath(raw) {
  try { return new URL(normaliseUrl(raw)).pathname; } catch (_) { return ''; }
}

// ── 1. Load candidate from Firestore ─────────────────────────────────────────

async function loadCandidate() {
  process.stdout.write('  Querying Firestore for podcast with YouTube + Instagram...');
  // Single inequality filter only (Firestore composite index not needed)
  const snap = await fsdb.collection('podcasts')
    .where('website_youtube', '!=', '')
    .limit(500)
    .get();

  const matches = snap.docs.filter(d => {
    const p = d.data();
    if (!p.website_instagram || p.website_instagram === '') return false;
    if (p.ai_guest_friendly !== true) return false;
    // Filter out Spotify's own template URLs (scraped from Spotify embed widget)
    const yt = (p.website_youtube || '').toLowerCase();
    const ig = (p.website_instagram || '').toLowerCase();
    if (yt.includes('spotifyforcreators') || ig.includes('spotifyforcreators')) return false;
    // Must have a real YouTube channel path
    if (!yt.includes('/@') && !yt.includes('/channel/') && !yt.includes('/c/') && !yt.includes('/user/')) return false;
    return true;
  });

  if (matches.length === 0) throw new Error('No matching podcasts found.');

  // Pick a random one from the matches
  const doc = matches[Math.floor(Math.random() * matches.length)];
  console.log(` found ${matches.length}, picked 1.`);
  return { itunesId: doc.id, ...doc.data() };
}

// ── 2. YouTube Data API v3 ────────────────────────────────────────────────────

async function enrichYouTube(podcast) {
  console.log('\n' + '─'.repeat(72));
  console.log('  SOURCE 1 — YouTube Data API v3');
  console.log('─'.repeat(72));

  if (!YT_KEY) {
    console.log('  ⚠️  YOUTUBE_API_KEY not set in .env — skipping.');
    console.log('  Add it: YOUTUBE_API_KEY=your_key');
    console.log('  Get one: console.cloud.google.com → APIs & Services → YouTube Data API v3');
    return { success: false, reason: 'no_api_key' };
  }

  const ytUrl = normaliseUrl(podcast.website_youtube);
  console.log(`  YouTube URL: ${ytUrl}`);

  // Extract channel ID or handle from URL
  let channelId = null;
  let handle    = null;

  try {
    const u    = new URL(ytUrl);
    const path = u.pathname;

    if (path.startsWith('/@')) {
      handle = path.slice(2).split('/')[0]; // "ChannelName"
      console.log(`  Detected @handle: @${handle}`);
    } else if (path.startsWith('/channel/')) {
      channelId = path.split('/')[2];
      console.log(`  Detected channel ID: ${channelId}`);
    } else if (path.startsWith('/c/') || path.startsWith('/user/')) {
      handle = path.split('/')[2];
      console.log(`  Detected legacy custom name: ${handle}`);
    } else {
      console.log(`  Unknown YouTube URL pattern: ${path}`);
    }
  } catch (e) {
    console.log(`  ❌  Invalid URL: ${e.message}`);
    return { success: false, reason: 'invalid_url' };
  }

  // Resolve handle → channel ID
  if (!channelId && handle) {
    const t0  = Date.now();
    // forHandle works for @-style handles; for /c/ legacy names we use search
    const apiUrl = handle.match(/^[A-Za-z0-9_-]+$/) && !podcast.website_youtube.includes('/@')
      ? `https://${YT_API}/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1&key=${YT_KEY}`
      : `https://${YT_API}/youtube/v3/channels?part=id,snippet,statistics&forHandle=${encodeURIComponent('@' + handle)}&key=${YT_KEY}`;

    console.log(`\n  [a] Resolving channel ID… (${elapsed(t0)})`);
    const res = await fetchJson(apiUrl);
    console.log(`  Status: ${res.status}  Time: ${elapsed(t0)}`);
    console.log(`  Raw: ${truncate(res.body, 300)}`);

    if (res.json && !res.json.error) {
      const items = res.json.items || [];
      if (items.length > 0) {
        channelId = items[0].id?.channelId || items[0].id;
        // If the channel response already has statistics, grab them
        if (items[0].statistics) {
          const s = items[0].statistics;
          console.log(`\n  ✅  Channel resolved directly with stats:`);
          console.log(`       Channel ID   : ${channelId}`);
          console.log(`       Subscribers  : ${s.subscriberCount ? Number(s.subscriberCount).toLocaleString() : 'hidden'}`);
          console.log(`       Total views  : ${s.viewCount ? Number(s.viewCount).toLocaleString() : 'N/A'}`);
          console.log(`       Video count  : ${s.videoCount || 'N/A'}`);

          // Fetch latest 10 videos
          return fetchLatestVideos(channelId, s);
        }
      }
    } else {
      console.log(`  ❌  API error: ${res.json?.error?.message || res.error || 'unknown'}`);
      return { success: false, reason: 'api_error', detail: res.json?.error?.message };
    }
  }

  if (!channelId) {
    console.log('  ❌  Could not resolve channel ID.');
    return { success: false, reason: 'no_channel_id' };
  }

  // Fetch channel statistics
  const t1   = Date.now();
  const cUrl = `https://${YT_API}/youtube/v3/channels?part=id,snippet,statistics&id=${channelId}&key=${YT_KEY}`;
  console.log(`\n  [b] Fetching channel statistics…`);
  const cRes = await fetchJson(cUrl);
  console.log(`  Status: ${cRes.status}  Time: ${elapsed(t1)}`);
  console.log(`  Raw: ${truncate(cRes.body, 300)}`);

  if (!cRes.json?.items?.[0]) {
    console.log('  ❌  No channel data returned.');
    return { success: false, reason: 'no_channel_data' };
  }

  const s = cRes.json.items[0].statistics;
  console.log(`\n  ✅  Channel stats:`);
  console.log(`       Channel ID   : ${channelId}`);
  console.log(`       Subscribers  : ${s.subscriberCount ? Number(s.subscriberCount).toLocaleString() : 'hidden'}`);
  console.log(`       Total views  : ${s.viewCount ? Number(s.viewCount).toLocaleString() : 'N/A'}`);
  console.log(`       Video count  : ${s.videoCount || 'N/A'}`);

  return fetchLatestVideos(channelId, s);
}

async function fetchLatestVideos(channelId, stats) {
  const t2   = Date.now();
  const vUrl = `https://${YT_API}/youtube/v3/search?part=id&channelId=${channelId}&type=video&order=date&maxResults=10&key=${YT_KEY}`;
  console.log(`\n  [c] Fetching latest 10 videos…`);
  const vRes = await fetchJson(vUrl);
  console.log(`  Status: ${vRes.status}  Time: ${elapsed(t2)}`);

  if (!vRes.json?.items?.length) {
    console.log('  ⚠️  No videos found (quota exceeded or empty channel).');
    return { success: true, stats, avgViews: null };
  }

  const videoIds = vRes.json.items.map(v => v.id.videoId).filter(Boolean).join(',');
  const t3       = Date.now();
  const sUrl     = `https://${YT_API}/youtube/v3/videos?part=statistics&id=${videoIds}&key=${YT_KEY}`;
  console.log(`  [d] Fetching video statistics (${vRes.json.items.length} videos)…`);
  const sRes     = await fetchJson(sUrl);
  console.log(`  Status: ${sRes.status}  Time: ${elapsed(t3)}`);

  if (!sRes.json?.items?.length) {
    console.log('  ⚠️  Could not fetch video stats.');
    return { success: true, stats, avgViews: null };
  }

  const viewCounts = sRes.json.items.map(v => parseInt(v.statistics?.viewCount || 0));
  const avgViews   = Math.round(viewCounts.reduce((a, b) => a + b, 0) / viewCounts.length);
  console.log(`\n  ✅  Latest ${viewCounts.length} video view counts: ${viewCounts.map(v => v.toLocaleString()).join(', ')}`);
  console.log(`       Avg views/video : ${avgViews.toLocaleString()}`);

  if (stats.subscriberCount) {
    const ratio = (avgViews / parseInt(stats.subscriberCount) * 100).toFixed(1);
    console.log(`       Engagement ratio: ${ratio}% of subscribers`);
  }

  return { success: true, stats, avgViews, viewCounts };
}

// ── 3. Instagram ──────────────────────────────────────────────────────────────

async function enrichInstagram(podcast) {
  console.log('\n' + '─'.repeat(72));
  console.log('  SOURCE 2 — Instagram (public scraping)');
  console.log('─'.repeat(72));

  const igUrl = normaliseUrl(podcast.website_instagram);
  if (!igUrl) { console.log('  No Instagram URL.'); return { success: false }; }

  const path     = urlPath(podcast.website_instagram);
  const username = path.replace(/^\//, '').replace(/\/$/, '').split('/')[0];
  console.log(`  Instagram URL  : ${igUrl}`);
  console.log(`  Username       : ${username}`);

  // Attempt 1: i.instagram.com web_profile_info (semi-public JSON endpoint)
  console.log('\n  [a] Trying i.instagram.com/api/v1/users/web_profile_info/…');
  const t0 = Date.now();
  const r0 = await fetchJson(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`, {
    headers: {
      'x-ig-app-id': '936619743392459',
      'User-Agent' : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    },
    timeout: 10000,
  });
  console.log(`  Status: ${r0.status}  Time: ${elapsed(t0)}`);
  console.log(`  Raw (400 chars): ${truncate(r0.body, 400)}`);

  if (r0.status === 200 && r0.json?.data?.user) {
    const u = r0.json.data.user;
    console.log(`\n  ✅  Retrieved via web_profile_info:`);
    console.log(`       Followers   : ${Number(u.edge_followed_by?.count || 0).toLocaleString()}`);
    console.log(`       Following   : ${Number(u.edge_follow?.count || 0).toLocaleString()}`);
    console.log(`       Posts       : ${Number(u.edge_owner_to_timeline_media?.count || 0).toLocaleString()}`);
    console.log(`       Verified    : ${u.is_verified || false}`);
    console.log(`       Bio         : ${truncate(u.biography, 100)}`);
    return { success: true, source: 'web_profile_info', followers: u.edge_followed_by?.count };
  }

  // Attempt 2: Standard page scrape for meta tags
  console.log('\n  [b] Trying standard page scrape…');
  const t1 = Date.now();
  const r1 = await fetchUrl(igUrl, {
    userAgent: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    timeout  : 12000,
    maxBytes : 50_000,
  });
  console.log(`  Status: ${r1.status}  Time: ${elapsed(t1)}`);

  if (r1.status === 200 && r1.body) {
    // Extract follower count from meta description: "X Followers, Y Following, Z Posts"
    const m = r1.body.match(/(\d[\d,]+)\s*Followers/i);
    const desc = (r1.body.match(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i) || [])[1] || '';
    console.log(`  Meta description: ${truncate(desc, 200)}`);
    if (m) {
      console.log(`\n  ✅  Followers from page: ${m[1]}`);
      return { success: true, source: 'page_scrape', followersRaw: m[1] };
    } else {
      console.log('  ⚠️  Could not extract follower count — Instagram is blocking or page is private.');
    }
  } else {
    console.log('  ❌  Page returned non-200 or empty body (login wall / rate limit).');
  }

  return { success: false, reason: 'blocked' };
}

// ── 4. Spotify ────────────────────────────────────────────────────────────────

async function enrichSpotify(podcast) {
  console.log('\n' + '─'.repeat(72));
  console.log('  SOURCE 3 — Spotify (oEmbed + page scraping)');
  console.log('─'.repeat(72));

  const spotifyUrl = normaliseUrl(podcast.website_spotify);
  if (!spotifyUrl) { console.log('  No Spotify URL.'); return { success: false, reason: 'no_url' }; }
  console.log(`  Spotify URL: ${spotifyUrl}`);

  // Attempt 1: oEmbed (free, no auth)
  console.log('\n  [a] Trying oEmbed endpoint…');
  const t0   = Date.now();
  const oemUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(spotifyUrl)}`;
  const r0   = await fetchJson(oemUrl);
  console.log(`  Status: ${r0.status}  Time: ${elapsed(t0)}`);
  console.log(`  Raw: ${truncate(r0.body, 300)}`);

  if (r0.status === 200 && r0.json) {
    const j = r0.json;
    console.log(`\n  ✅  oEmbed response:`);
    console.log(`       Title         : ${j.title || 'N/A'}`);
    console.log(`       Provider      : ${j.provider_name || 'N/A'}`);
    console.log(`       Thumbnail URL : ${j.thumbnail_url ? j.thumbnail_url.substring(0, 80) + '…' : 'N/A'}`);
    console.log(`  ℹ️  oEmbed only returns title/thumbnail — no follower count or ratings.`);
  }

  // Attempt 2: Public show page for episode count, description
  console.log('\n  [b] Trying public show page scrape…');
  const t1 = Date.now();
  const r1 = await fetchUrl(spotifyUrl, {
    userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    timeout  : 12000,
    maxBytes : 80_000,
  });
  console.log(`  Status: ${r1.status}  Time: ${elapsed(t1)}`);
  console.log(`  Body (500 chars): ${truncate(r1.body, 500)}`);

  // Spotify shows page is heavily JS-rendered; unlikely to get structured data
  const episodeMatch = r1.body.match(/(\d+)\s+episodes?/i);
  if (episodeMatch) {
    console.log(`\n  ✅  Episodes found in page: ${episodeMatch[1]}`);
  } else {
    console.log('  ⚠️  Spotify pages are JS-rendered — no structured data without a headless browser.');
  }

  return { success: r0.status === 200, oEmbed: r0.json };
}

// ── 5. Reddit API ─────────────────────────────────────────────────────────────

async function enrichReddit(podcast) {
  console.log('\n' + '─'.repeat(72));
  console.log('  SOURCE 4 — Reddit API (no auth)');
  console.log('─'.repeat(72));

  const title = podcast.title || '';
  console.log(`  Searching for: "${title}"`);

  const query = encodeURIComponent(`"${title}"`);

  // Search posts mentioning the podcast
  console.log('\n  [a] Searching posts…');
  const t0  = Date.now();
  const url = `https://www.reddit.com/search.json?q=${query}&type=link&sort=relevance&limit=25&t=all`;
  const r0  = await fetchJson(url, {
    userAgent: 'BadasseryPR-EnrichmentTest/1.0 (by u/BadasseryBot)',
    timeout  : 15000,
  });
  console.log(`  Status: ${r0.status}  Time: ${elapsed(t0)}`);
  console.log(`  Raw (400 chars): ${truncate(r0.body, 400)}`);

  if (r0.status !== 200 || !r0.json?.data?.children) {
    console.log(`  ❌  Reddit API error or rate limit (status ${r0.status}).`);
    return { success: false, reason: `status_${r0.status}` };
  }

  const posts = r0.json.data.children.map(c => c.data);
  console.log(`\n  ✅  Posts found: ${posts.length}`);

  const subreddits = {};
  let totalScore   = 0;
  let totalComments = 0;
  posts.forEach(p => {
    subreddits[p.subreddit] = (subreddits[p.subreddit] || 0) + 1;
    totalScore    += p.score || 0;
    totalComments += p.num_comments || 0;
  });

  const topSubs = Object.entries(subreddits).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`  Total upvotes (all posts) : ${totalScore.toLocaleString()}`);
  console.log(`  Total comments            : ${totalComments.toLocaleString()}`);
  console.log(`  Top subreddits:`);
  topSubs.forEach(([sub, count]) => console.log(`       r/${sub}: ${count} post(s)`));

  if (posts.length > 0) {
    console.log(`\n  Top 3 posts:`);
    posts.slice(0, 3).forEach((p, i) => {
      console.log(`    ${i + 1}. [${p.score}↑ ${p.num_comments} comments] r/${p.subreddit}`);
      console.log(`       "${truncate(p.title, 100)}"`);
    });
  }

  // Also search subreddits
  console.log('\n  [b] Searching subreddits (communities about this podcast)…');
  const t1   = Date.now();
  const srUrl = `https://www.reddit.com/search.json?q=${query}&type=sr&limit=5`;
  const r1   = await fetchJson(srUrl, {
    userAgent: 'BadasseryPR-EnrichmentTest/1.0 (by u/BadasseryBot)',
    timeout  : 10000,
  });
  console.log(`  Status: ${r1.status}  Time: ${elapsed(t1)}`);

  if (r1.status === 200 && r1.json?.data?.children?.length > 0) {
    const srs = r1.json.data.children.map(c => c.data);
    srs.forEach(s => {
      console.log(`  → r/${s.display_name}: ${Number(s.subscribers || 0).toLocaleString()} subscribers`);
    });
  } else {
    console.log('  No dedicated subreddits found.');
  }

  return { success: true, postCount: posts.length, totalScore, totalComments, topSubs };
}

// ── 6. iTunes / Apple API ─────────────────────────────────────────────────────

async function enrichItunes(podcast) {
  console.log('\n' + '─'.repeat(72));
  console.log('  SOURCE 5 — iTunes / Apple Podcasts API (no auth)');
  console.log('─'.repeat(72));

  const itunesId = podcast.itunesId || podcast.itunes_id;
  if (!itunesId) { console.log('  No itunesId.'); return { success: false }; }
  console.log(`  itunesId: ${itunesId}`);

  const url = `https://itunes.apple.com/lookup?id=${itunesId}&entity=podcast`;
  console.log(`  Endpoint: ${url}`);

  const t0 = Date.now();
  const r  = await fetchJson(url, { timeout: 12000 });
  console.log(`  Status: ${r.status}  Time: ${elapsed(t0)}`);
  console.log(`  Raw: ${truncate(r.body, 500)}`);

  if (r.status !== 200 || !r.json?.results?.[0]) {
    console.log(`  ❌  No data returned.`);
    return { success: false };
  }

  const result = r.json.results[0];
  console.log(`\n  ✅  iTunes API response:`);
  console.log(`       trackName          : ${result.trackName}`);
  console.log(`       artistName         : ${result.artistName}`);
  console.log(`       primaryGenreName   : ${result.primaryGenreName}`);
  console.log(`       genres             : ${(result.genres || []).join(', ')}`);
  console.log(`       trackCount         : ${result.trackCount} (episodes)`);
  console.log(`       country            : ${result.country}`);
  console.log(`       contentAdvisoryRating: ${result.contentAdvisoryRating || 'N/A'}`);
  console.log(`       artworkUrl600      : ${(result.artworkUrl600 || '').substring(0, 80)}…`);
  console.log(`       feedUrl            : ${result.feedUrl || 'N/A'}`);
  console.log(`       releaseDate        : ${result.releaseDate || 'N/A'}`);
  console.log(`\n  ℹ️  Note: iTunes API does NOT return star ratings or review counts.`);
  console.log(`       Those are only available via Apple Podcasts scraping (apple_rating_scraped field).`);

  return {
    success: true,
    trackName: result.trackName,
    genres: result.genres,
    trackCount: result.trackCount,
    country: result.country,
    artworkUrl: result.artworkUrl600,
    feedUrl: result.feedUrl,
    releaseDate: result.releaseDate,
  };
}

// ── 7. PodcastIndex SQLite ────────────────────────────────────────────────────

function enrichSQLite(podcast) {
  console.log('\n' + '─'.repeat(72));
  console.log('  SOURCE 6 — PodcastIndex SQLite (local DB)');
  console.log('─'.repeat(72));

  const feedId   = podcast.feedId || podcast.id;
  const itunesId = podcast.itunesId || podcast.itunes_id;

  if (!feedId && !itunesId) {
    console.log('  No feedId or itunesId to look up.');
    return { success: false };
  }

  const t0 = Date.now();
  let sqlite;
  try {
    sqlite = new Database(DB_PATH, { readonly: true });
  } catch (e) {
    console.log(`  ❌  Could not open SQLite: ${e.message}`);
    return { success: false, reason: e.message };
  }

  try {
    let row = null;

    // Try feedId first (PodcastIndex internal ID = 'id' column)
    if (feedId) {
      row = sqlite.prepare('SELECT * FROM podcasts WHERE id = ?').get(feedId);
    }
    // Fallback to itunesId
    if (!row && itunesId) {
      row = sqlite.prepare('SELECT * FROM podcasts WHERE itunesId = ?').get(String(itunesId));
    }

    const ms = Date.now() - t0;
    console.log(`  Lookup time: ${ms}ms`);

    if (!row) {
      console.log(`  ⚠️  Podcast not found in SQLite (feedId: ${feedId}, itunesId: ${itunesId}).`);
      return { success: false, reason: 'not_found' };
    }

    // Compute derived metrics
    const now       = Math.floor(Date.now() / 1000);
    const ageMonths = row.oldestItemPubdate
      ? ((now - row.oldestItemPubdate) / 2592000).toFixed(1)
      : null;
    const avgEpsPerMonth = (row.episodeCount && row.oldestItemPubdate && row.newestItemPubdate)
      ? (row.episodeCount / ((row.newestItemPubdate - row.oldestItemPubdate) / 2592000)).toFixed(2)
      : null;

    const categories = [];
    for (let i = 1; i <= 10; i++) {
      if (row[`category${i}`]) categories.push(row[`category${i}`]);
    }

    console.log(`\n  ✅  SQLite row found:`);
    console.log(`       id (PI feed ID)     : ${row.id}`);
    console.log(`       itunesId            : ${row.itunesId}`);
    console.log(`       popularityScore     : ${row.popularityScore ?? 'N/A'}`);
    console.log(`       updateFrequency     : ${row.updateFrequency ?? 'N/A'}  (episodes/week)`);
    console.log(`       itunesType          : ${row.itunesType || 'not set'}`);
    console.log(`       episodeCount        : ${row.episodeCount}`);
    console.log(`       newestItemPubdate   : ${row.newestItemPubdate ? new Date(row.newestItemPubdate * 1000).toISOString().slice(0, 10) : 'N/A'}`);
    console.log(`       oldestItemPubdate   : ${row.oldestItemPubdate ? new Date(row.oldestItemPubdate * 1000).toISOString().slice(0, 10) : 'N/A'}`);
    console.log(`       Derived: podcast age: ${ageMonths ? ageMonths + ' months' : 'N/A'}`);
    console.log(`       Derived: avg eps/mo : ${avgEpsPerMonth ?? 'N/A'}`);
    console.log(`       categories          : ${categories.join(', ') || 'none'}`);
    console.log(`       language            : ${row.language}`);
    console.log(`       dead                : ${row.dead}`);
    console.log(`       host                : ${row.host || 'N/A'}`);
    console.log(`       generator           : ${row.generator || 'N/A'}`);
    console.log(`       priority            : ${row.priority ?? 'N/A'}`);

    return {
      success: true,
      popularityScore  : row.popularityScore,
      updateFrequency  : row.updateFrequency,
      itunesType       : row.itunesType,
      oldestItemPubdate: row.oldestItemPubdate,
      ageMonths,
      avgEpsPerMonth,
      categories,
      host             : row.host,
      generator        : row.generator,
      priority         : row.priority,
    };
  } finally {
    sqlite.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔬  DATA ENRICHMENT SOURCE TEST');
  console.log('='.repeat(72));
  console.log('');

  // ── Load candidate
  const podcast = await loadCandidate();

  console.log('\n' + '='.repeat(72));
  console.log('  🎙️  SELECTED PODCAST');
  console.log('='.repeat(72));
  console.log(`  Title         : ${podcast.title}`);
  console.log(`  itunesId      : ${podcast.itunesId || podcast.itunes_id}`);
  console.log(`  feedId        : ${podcast.feedId || podcast.id || 'N/A'}`);
  console.log(`  Score         : ${podcast.ai_badassery_score ?? 'N/A'}`);
  console.log(`  Category      : ${podcast.ai_primary_category || 'N/A'}`);
  console.log(`  YouTube       : ${podcast.website_youtube}`);
  console.log(`  Instagram     : ${podcast.website_instagram}`);
  console.log(`  Spotify       : ${podcast.website_spotify || '(none)'}`);
  console.log(`  YT subs (DB)  : ${podcast.yt_subscribers ?? '(not enriched)'}`);
  console.log(`  Apple rating  : ${podcast.apple_rating || podcast.apple_rating_scraped || 'N/A'} (${podcast.apple_rating_count ?? 0} reviews)`);

  // ── Run all sources (sequential to avoid rate-limit confusion in output)
  const ytResult      = await enrichYouTube(podcast);
  const igResult      = await enrichInstagram(podcast);
  const spotifyResult = await enrichSpotify(podcast);
  const redditResult  = await enrichReddit(podcast);
  const itunesResult  = await enrichItunes(podcast);
  const sqliteResult  = enrichSQLite(podcast);

  // ── Summary
  console.log('\n' + '='.repeat(72));
  console.log('  📊  SUMMARY');
  console.log('='.repeat(72));

  const rows = [
    ['YouTube Data API v3',    ytResult,      'subscribers, avgViews, engagement ratio'],
    ['Instagram scraping',     igResult,      'follower count'],
    ['Spotify scraping',       spotifyResult, 'title only via oEmbed; no stats'],
    ['Reddit API',             redditResult,  'mention count, subreddits, engagement'],
    ['iTunes API',             itunesResult,  'genres, episode count, artwork'],
    ['PodcastIndex SQLite',    sqliteResult,  'popularityScore, updateFrequency, itunesType, age'],
  ];

  rows.forEach(([name, result, available]) => {
    const status = result?.success ? '✅' : '❌';
    const why    = result?.success ? `Available: ${available}` : `Reason: ${result?.reason || 'failed'}`;
    console.log(`  ${status}  ${name.padEnd(28)} ${why}`);
  });

  console.log('\n  Key insights for the pipeline:');
  if (!YT_KEY) {
    console.log('  ⚠️  YouTube API key missing — most valuable source for subscriber/view data.');
    console.log('      Get a free key (10K units/day) at: console.cloud.google.com');
  }
  console.log('  ⚠️  Instagram blocks scraping — no reliable free path to follower count.');
  console.log('  ⚠️  Spotify has no public stats API — oEmbed returns title/artwork only.');
  console.log('  ✅  Reddit API (no auth) works well for mention/engagement signals.');
  console.log('  ✅  iTunes API (no auth) works reliably for metadata; NO ratings though.');
  console.log('  ✅  SQLite is instant and free — popularityScore + updateFrequency are useful.');
  console.log('='.repeat(72));

  process.exit(0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
