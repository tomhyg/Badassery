'use strict';

/**
 * enrichPodcast.js — Phase 4 enrichment orchestrator
 *
 * Enriches a single in-memory feed object with audience and contact data.
 * Mutates `feed` in place and returns it. Never throws — each step is
 * individually try/caught.
 *
 * Execution order:
 *   4a  RSS + homepage (plain fetch — sets all social URLs incl. website_twitter)
 *   4d  YouTube API   (plain fetch — runs after 4a so website_youtube is set)
 *   4b  Apple rating          (Puppeteer, 15s timeout, 2s sleep after)
 *   4c  Spotify rating        (Puppeteer, 30s timeout, 2s sleep after — only if website_spotify)
 *   4e  Instagram followers   (Puppeteer, 15s timeout, 3s sleep after — only if website_instagram)
 *
 * Fields added to feed:
 *   rss_owner_email, website_instagram, website_twitter, website_linkedin,
 *   website_youtube, website_spotify, website_facebook, website_tiktok,
 *   apple_rating, apple_rating_count,
 *   spotify_rating, spotify_review_count,
 *   yt_subscribers, yt_total_views, yt_video_count, yt_avg_views_per_video,
 *   instagram_followers
 */

const { scrapeAppleRating }        = require('./appleRatingScraper');
const { scrapeSpotifyRating }      = require('./spotifyRating');
const { scrapeInstagramFollowers } = require('./instagramScraper');
const { scrapeTwitterFollowers }   = require('./twitterScraper');
const { getBrowser }               = require('./browserManager');

// ── Puppeteer concurrency limiter ─────────────────────────────────────────────
// Apple + Spotify + Instagram all share one browser. Cap simultaneous Puppeteer
// pages at 3 to avoid Spotify/Instagram bot-detection under heavy concurrency.
let _puppeteerSlots = 3;
const _puppeteerQueue = [];
function acquirePuppeteerSlot() {
  if (_puppeteerSlots > 0) { _puppeteerSlots--; return Promise.resolve(); }
  return new Promise(resolve => _puppeteerQueue.push(resolve));
}
function releasePuppeteerSlot() {
  if (_puppeteerQueue.length > 0) {
    _puppeteerQueue.shift()();
  } else {
    _puppeteerSlots++;
  }
}

const YT_KEY = process.env.YOUTUBE_API_KEY || null;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchText(url, timeoutMs = 10000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal : ctrl.signal,
      headers: {
        'User-Agent'     : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept'         : 'text/html,application/xhtml+xml,application/rss+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Social link extraction ─────────────────────────────────────────────────────

// Matches full profile URLs; g flag requires lastIndex reset before each use
const SOCIAL_MATCHERS = [
  {
    field: 'website_instagram',
    // Profile path only — skip /p/, /reel/, /explore/, /accounts/, /stories/
    re: /https?:\/\/(?:www\.)?instagram\.com\/(?!(?:p|reel|explore|accounts|stories|tv|ar|about|legal|privacy|press|blog|directory|contact|help|developer|challenge|oauth|admin)(?:\/|$))([\w.]+)\/?/gi,
  },
  {
    field: 'website_twitter',
    // Skip /intent/, /share, /hashtag, /search, /i/, /home
    re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!(?:intent|share|hashtag|search|i|home|login|signup|notifications|messages|settings|help|about|privacy|tos|explore|who_to_follow|compose)(?:\/|$|\?))([\w]+)\/?/gi,
  },
  {
    field: 'website_linkedin',
    re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:in|company)\/[A-Za-z0-9_%-]+\/?/gi,
  },
  {
    field: 'website_youtube',
    // @handle, /channel/UCxxx, /c/name, /user/name — NOT /watch /results /shorts /playlist
    re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.-]+|channel\/UC[\w-]{10,}|(?:c|user)\/[\w][\w.-]*)/gi,
  },
  {
    field: 'website_spotify',
    re: /https?:\/\/open\.spotify\.com\/show\/[A-Za-z0-9]+/gi,
  },
  {
    field: 'website_facebook',
    re: /https?:\/\/(?:www\.)?facebook\.com\/(?!(?:sharer|share\.php|login|signup|dialog|plugins|photo|watch|events|groups|pages\/create|l\.php|ajax)(?:\/|$|\?))[A-Za-z0-9_.\-]{3,100}\/?/gi,
  },
  {
    field: 'website_tiktok',
    re: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+\/?/gi,
  },
];

const BLACKLIST_RE = [
  /spotifyforcreators/i,
  /spotify\.com\/for-the-record/i,
  /twitter\.com\/share\b/i,
  /twitter\.com\/intent\//i,
  /facebook\.com\/sharer/i,
  /linkedin\.com\/share\?/i,
  /youtube\.com\/watch\b/i,
  /youtube\.com\/results\b/i,
  /youtube\.com\/shorts\b/i,
  /youtube\.com\/playlist\b/i,
  /instagram\.com\/p\//i,
];

/**
 * Strip episode <item>/<entry> blocks from RSS text.
 * Prevents extracting YouTube URLs from guest episode shownotes.
 * Only keeps the RSS channel-level header section.
 */
function stripRssItems(text) {
  if (!text) return text;
  const itemIdx  = text.search(/<item[\s>]/i);
  const entryIdx = text.search(/<entry[\s>]/i);
  let cutoff = -1;
  if (itemIdx >= 0 && entryIdx >= 0) cutoff = Math.min(itemIdx, entryIdx);
  else if (itemIdx >= 0)  cutoff = itemIdx;
  else if (entryIdx >= 0) cutoff = entryIdx;
  return cutoff >= 0 ? text.slice(0, cutoff) : text;
}

/**
 * Validate that a YouTube channel name plausibly belongs to this podcast.
 * Returns false if no meaningful word overlap with podcast title/author.
 */
function validateYouTubeChannelName(channelName, feed) {
  if (!channelName) return true; // no title to compare — allow
  const normalize = s => (s || '').toLowerCase().split(/[\s\W]+/).filter(w => w.length > 3);
  const podWords  = normalize(`${feed.title} ${feed.author || ''} ${feed.ownerName || ''}`);
  const chanWords = normalize(channelName);
  return podWords.some(w => chanWords.includes(w));
}

/**
 * Extract the bare handle from a social URL.
 */
function extractSocialHandle(url, platform) {
  if (!url) return null;
  switch (platform) {
    case 'instagram': return (url.match(/instagram\.com\/([\w.]+)/i) || [])[1] || null;
    case 'twitter':   return (url.match(/(?:twitter|x)\.com\/([\w]+)/i) || [])[1] || null;
    case 'tiktok':    return (url.match(/tiktok\.com\/@([\w_.]+)/i) || [])[1] || null;
    default:          return null;
  }
}

/**
 * Validate that a social handle plausibly belongs to the podcast.
 * Returns false if no meaningful word overlap with podcast title/author.
 * Prevents matching guest accounts scraped from episode shownotes.
 */
function validateSocialHandle(url, platform, feed) {
  const handle = extractSocialHandle(url, platform);
  if (!handle) return true; // can't validate — allow
  const normalize = s => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 3);
  const podWords    = normalize(`${feed.title} ${feed.author || ''} ${feed.ownerName || ''}`);
  const handleParts = handle.toLowerCase().split(/[\._\-]+/);
  return podWords.some(w => handleParts.some(hw => hw.includes(w) || w.includes(hw)));
}

// ── Platform detection ────────────────────────────────────────────────────────

// Hosting platforms that show a generic podcast page — no owner email/socials there
const HOSTING_PLATFORM_RE = /buzzsprout\.com|anchor\.fm|podbean\.com|acast\.com|simplecast\.com|transistor\.fm|captivate\.fm|spreaker\.com|soundcloud\.com|libsyn\.com|blubrry\.com|megaphone\.fm|omnycontent\.com|podcastics\.com|redcircle\.com|art19\.com|audacy\.com|iheart\.com|iheartradio\.com|spotify\.com|pinecast\.com|podchaser\.com/i;

function isHostingPlatformUrl(url) {
  return url ? HOSTING_PLATFORM_RE.test(url) : false;
}

// Link aggregators — bio pages that consolidate all social links
// Pattern: extract the first matching URL from text
const LINK_AGGREGATOR_RE = /https?:\/\/(?:linktr\.ee|beacons\.ai|bio\.link|allmylinks\.com|taplink\.cc|campsite\.bio|linktree\.tr|lnk\.bio|msha\.ke|direct\.me|solo\.to)\/[\w.\-@]+/gi;

/**
 * Find a link aggregator URL in page text and fetch its content.
 * Returns the fetched page text or null.
 */
async function fetchLinkAggregatorPage(text) {
  if (!text) return null;
  LINK_AGGREGATOR_RE.lastIndex = 0;
  const m = LINK_AGGREGATOR_RE.exec(text);
  if (!m) return null;
  const url = m[0].replace(/['">\s)]+$/, '');
  return fetchText(url, 8000);
}

const EMAIL_VALID_RE = /^[\w.+%-]+@[\w.-]+\.[a-z]{2,}$/i;
const EMAIL_NOISE_RE = /noreply|no-reply|@mg\.|@sentry\.|@mailgun\.|@sendgrid\.|example\.com|@bounce\.|unsubscribe|@em\d+\./i;
const EMAIL_EXT_RE   = /\.(png|jpg|jpeg|gif|svg|webp|pdf|css|js|woff|ttf)$/i;

/**
 * Extract email addresses from HTML/text.
 * Prefers explicit mailto: links (intentionally placed), then plain text.
 */
function extractEmailsFromText(html) {
  if (!html) return [];
  const found = new Set();

  // 1. mailto: links — most reliable (site owner explicitly linked them)
  const mailtoRe = /href=["']mailto:([^"'?&#\s]+)/gi;
  let m;
  while ((m = mailtoRe.exec(html)) !== null) {
    const e = m[1].trim().toLowerCase();
    if (EMAIL_VALID_RE.test(e) && !EMAIL_NOISE_RE.test(e) && !EMAIL_EXT_RE.test(e)) found.add(e);
  }

  // 2. Plain text emails — only scan if no mailto found (higher false-positive risk)
  if (found.size === 0) {
    const plainRe = /[\w.+%-]{2,}@[\w.-]+\.[a-z]{2,}/gi;
    while ((m = plainRe.exec(html)) !== null) {
      const e = m[0].trim().toLowerCase();
      if (EMAIL_VALID_RE.test(e) && !EMAIL_NOISE_RE.test(e) && !EMAIL_EXT_RE.test(e)) {
        found.add(e);
        if (found.size >= 5) break; // cap — avoid scanning huge pages
      }
    }
  }

  return [...found];
}

function pickBestEmail(emails) {
  if (!emails.length) return null;
  // Prefer non-noreply already filtered above; just return first found
  return emails[0];
}

function extractSocialLinks(text) {
  const found = {};
  for (const { field, re } of SOCIAL_MATCHERS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
      const url = m[0].replace(/['">\s,;)]+$/, '').replace(/\/$/, '');
      if (BLACKLIST_RE.some(b => b.test(url))) continue;
      found[field] = url;
      break; // first non-blacklisted match per field
    }
  }
  return found;
}

function extractRssEmail(rssText) {
  // 1. Standard <itunes:email> tag
  const m1 = rssText.match(/<itunes:email>\s*([^<\s]+)\s*<\/itunes:email>/i);
  if (m1) {
    const e = m1[1].trim();
    if (EMAIL_VALID_RE.test(e) && !EMAIL_NOISE_RE.test(e)) return e;
  }

  // 2. <managingEditor> tag
  const m2 = rssText.match(/<managingEditor>\s*([^<]+)\s*<\/managingEditor>/i);
  if (m2) {
    const e = m2[1].match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/i);
    if (e && EMAIL_VALID_RE.test(e[0]) && !EMAIL_NOISE_RE.test(e[0])) return e[0].trim();
  }

  // 3. Fallback: scan channel-level RSS header for any email (e.g. in <description>)
  const channelHeader = stripRssItems(rssText);
  const fallbackEmails = extractEmailsFromText(channelHeader);
  const best = pickBestEmail(fallbackEmails);
  if (best) return best;

  return '';
}

// ── Step 4a — RSS + homepage ──────────────────────────────────────────────────

async function step4a_rssHomepage(feed) {
  const result = {
    rss_owner_email  : '',
    website_email    : '',
    website_instagram: '',
    website_twitter  : '',
    website_linkedin : '',
    website_youtube  : '',
    website_spotify  : '',
    website_facebook : '',
    website_tiktok   : '',
  };

  const isHostingPage = isHostingPlatformUrl(feed.homepageUrl);

  const [rssText, homeText] = await Promise.all([
    feed.rssUrl      ? fetchText(feed.rssUrl,      10000) : Promise.resolve(null),
    feed.homepageUrl ? fetchText(feed.homepageUrl, 10000) : Promise.resolve(null),
  ]);

  // ── Social links from homepage (lower priority — RSS overwrites) ──────────
  if (homeText) Object.assign(result, extractSocialLinks(homeText));

  // ── RSS email + socials ───────────────────────────────────────────────────
  if (rssText) {
    const email = extractRssEmail(rssText);
    if (email) result.rss_owner_email = email;

    // All socials: channel-level RSS header ONLY (strip episode items first)
    const rssChannelText = stripRssItems(rssText);
    const rssLinks = extractSocialLinks(rssChannelText);
    for (const [field, val] of Object.entries(rssLinks)) {
      if (val) result[field] = val;
    }
  }

  // ── Email from homepage ───────────────────────────────────────────────────
  if (!isHostingPage && homeText) {
    const homeEmails = extractEmailsFromText(homeText);
    const email = pickBestEmail(homeEmails);
    if (email && email !== result.rss_owner_email) result.website_email = email;
  }

  // ── Secondary social discovery — only if primary sources missed socials ───
  // Tracks which platforms still need to be found
  const missingPlatforms = () => ['instagram', 'twitter', 'tiktok', 'youtube', 'linkedin', 'facebook']
    .filter(p => !result[`website_${p}`]);

  // Pass 2 — Link aggregator (Linktree, Beacons.ai, etc.)
  // Many indie podcasters centralize all social links on a bio page
  if (missingPlatforms().length > 0 && homeText) {
    const aggText = await fetchLinkAggregatorPage(homeText);
    if (aggText) {
      process.stdout.write(`\n  [P4a-pass2] Link aggregator found for "${(feed.title||'').slice(0,30)}"\n`);
      const aggLinks = extractSocialLinks(aggText);
      for (const [field, val] of Object.entries(aggLinks)) {
        if (val && !result[field]) {
          result[field] = val;
          process.stdout.write(`    → ${field}: ${val}\n`);
        }
      }
      // Also try to find email on the aggregator page
      if (!result.website_email) {
        const aggEmails = extractEmailsFromText(aggText);
        const email = pickBestEmail(aggEmails);
        if (email && email !== result.rss_owner_email) {
          result.website_email = email;
          process.stdout.write(`    → website_email: ${email}\n`);
        }
      }
    }
  }

  // Pass 3 — /about subpage (social links often only in footer/about)
  if (missingPlatforms().length > 0 && !isHostingPage && feed.homepageUrl) {
    const base = feed.homepageUrl.replace(/\/+$/, '');
    const aboutText = await fetchText(`${base}/about`, 8000);
    if (aboutText) {
      const aboutLinks = extractSocialLinks(aboutText);
      const found = [];
      for (const [field, val] of Object.entries(aboutLinks)) {
        if (val && !result[field]) {
          result[field] = val;
          found.push(`${field}: ${val}`);
        }
      }
      if (found.length) process.stdout.write(`\n  [P4a-pass3] /about found for "${(feed.title||'').slice(0,30)}": ${found.join(', ')}\n`);
    }
  }

  // Pass 4 — Contact/links subpages (email + any remaining socials)
  const needsEmail   = !result.website_email && !isHostingPage && feed.homepageUrl;
  const needsSocials = missingPlatforms().length > 0 && !isHostingPage && feed.homepageUrl;
  if (needsEmail || needsSocials) {
    const base = feed.homepageUrl.replace(/\/+$/, '');
    for (const path of ['/contact', '/contact-us', '/links']) {
      const subText = await fetchText(`${base}${path}`, 8000);
      if (!subText) continue;
      const found = [];
      if (needsEmail && !result.website_email) {
        const emails = extractEmailsFromText(subText);
        const email  = pickBestEmail(emails);
        if (email && email !== result.rss_owner_email) {
          result.website_email = email;
          found.push(`website_email: ${email}`);
        }
      }
      const subLinks = extractSocialLinks(subText);
      for (const [field, val] of Object.entries(subLinks)) {
        if (val && !result[field]) {
          result[field] = val;
          found.push(`${field}: ${val}`);
        }
      }
      if (found.length) process.stdout.write(`\n  [P4a-pass4] ${path} found for "${(feed.title||'').slice(0,30)}": ${found.join(', ')}\n`);
      // Stop after first page that gave us something useful
      const gotSomething = !needsEmail || result.website_email;
      if (gotSomething && missingPlatforms().length < 3) break;
    }
  }

  // Pass 5 — Feed description field (channel-level, safe from guest pollution)
  // Some RSS descriptions contain "Follow us on instagram.com/xyz"
  if (missingPlatforms().length > 0 && feed.description) {
    const descLinks = extractSocialLinks(feed.description);
    const found = [];
    for (const [field, val] of Object.entries(descLinks)) {
      if (val && !result[field]) {
        result[field] = val;
        found.push(`${field}: ${val}`);
      }
    }
    if (found.length) process.stdout.write(`\n  [P4a-pass5] feed.description found for "${(feed.title||'').slice(0,30)}": ${found.join(', ')}\n`);
  }

  // ── Social handle validation ──────────────────────────────────────────────
  // Reject handles with no name overlap (defense against guest account confusion)
  for (const platform of ['instagram', 'twitter', 'tiktok']) {
    const field = `website_${platform}`;
    if (result[field] && !validateSocialHandle(result[field], platform, feed)) {
      process.stdout.write(
        `\n  [P4a] ${platform} rejected for "${(feed.title||'').slice(0,30)}": ${result[field]} → no name match\n`
      );
      result[`_rejected_${platform}`] = result[field];
      result[field] = '';
    }
  }

  return result;
}

// ── Step 4b — Apple rating (Puppeteer) ───────────────────────────────────────

async function step4b_apple(feed) {
  const empty = { apple_rating: null, apple_rating_count: null };
  if (!feed.itunesId) return empty;

  try {
    const browser = await getBrowser();
    const result  = await scrapeAppleRating(feed.itunesId, browser);
    return result ?? empty;
  } catch {
    return empty;
  }
}

// ── Step 4c — Spotify rating (Puppeteer) ─────────────────────────────────────

async function step4c_spotify(feed) {
  const empty = { spotify_rating: null, spotify_review_count: null };
  if (!feed.website_spotify) return empty;

  try {
    const browser = await getBrowser();
    const result  = await scrapeSpotifyRating(feed.website_spotify, browser);
    if (!result) return empty;
    return {
      spotify_rating       : result.rating      ?? null,
      spotify_review_count : result.reviewCount  ?? null,
    };
  } catch {
    return empty;
  }
}

// ── Step 4d — YouTube stats (API) ────────────────────────────────────────────

function extractYtIdentifier(youtubeUrl) {
  if (!youtubeUrl) return { channelId: null, handle: null, username: null };

  const chanM   = youtubeUrl.match(/\/channel\/(UC[\w-]{10,})/);
  if (chanM)   return { channelId: chanM[1], handle: null, username: null };

  const handleM = youtubeUrl.match(/\/@([\w.-]+)/);
  if (handleM) return { channelId: null, handle: handleM[1], username: null };

  const userM   = youtubeUrl.match(/\/(?:c|user)\/([\w.-]+)/);
  if (userM)   return { channelId: null, handle: null, username: userM[1] };

  return { channelId: null, handle: null, username: null };
}

async function step4d_youtube(feed) {
  const empty = {
    yt_subscribers       : null,
    yt_total_views       : null,
    yt_video_count       : null,
    yt_avg_views_per_video: null,
  };

  if (!feed.website_youtube) return empty;
  if (!YT_KEY)               return empty;

  try {
    let { channelId, handle, username } = extractYtIdentifier(feed.website_youtube);

    // Resolve handle or username → channelId
    if (!channelId && (handle || username)) {
      const param  = handle   ? `forHandle=${encodeURIComponent('@' + handle)}`
                              : `forUsername=${encodeURIComponent(username)}`;
      const url    = `https://www.googleapis.com/youtube/v3/channels?part=id&${param}&key=${YT_KEY}`;
      const ctrl   = new AbortController();
      const timer  = setTimeout(() => ctrl.abort(), 8000);
      try {
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (res.status === 403 || res.status === 429) return empty; // quota
        if (!res.ok) return empty;
        const data = await res.json();
        channelId  = data.items?.[0]?.id ?? null;
      } finally {
        clearTimeout(timer);
      }
      if (!channelId) return empty;

      // Brief delay between YouTube API calls
      await sleep(100);
    }

    if (!channelId) return empty;

    // Fetch snippet + statistics (snippet gives channel title for validation)
    const statsUrl  = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}&key=${YT_KEY}`;
    const ctrl2     = new AbortController();
    const timer2    = setTimeout(() => ctrl2.abort(), 8000);
    let stats, channelTitle;
    try {
      const res2 = await fetch(statsUrl, { signal: ctrl2.signal });
      clearTimeout(timer2);
      if (res2.status === 403 || res2.status === 429) return empty;
      if (!res2.ok) return empty;
      const data2 = await res2.json();
      stats        = data2.items?.[0]?.statistics;
      channelTitle = data2.items?.[0]?.snippet?.title || null;
    } finally {
      clearTimeout(timer2);
    }

    if (!stats) return empty;

    // Validate: reject if channel name doesn't match podcast (guest channel protection)
    if (channelTitle && !validateYouTubeChannelName(channelTitle, feed)) {
      process.stdout.write(
        `\n  [P4d] YouTube rejected for "${(feed.title||'').slice(0,30)}": channel="${channelTitle}" → null\n`
      );
      return { ...empty, _rejected_youtube_channel: channelTitle };
    }

    const subs  = parseInt(stats.subscriberCount || '0', 10) || null;
    const views = parseInt(stats.viewCount       || '0', 10) || null;
    const vids  = parseInt(stats.videoCount      || '0', 10) || null;
    const avg   = (views && vids) ? Math.round(views / vids) : null;

    return {
      yt_subscribers        : subs,
      yt_total_views        : views,
      yt_video_count        : vids,
      yt_avg_views_per_video: avg,
    };
  } catch {
    return empty;
  }
}

// ── Step 4e — Instagram followers (Puppeteer) ─────────────────────────────────

async function step4e_instagram(feed) {
  const empty = { instagram_followers: null };
  if (!feed.website_instagram) return empty;

  try {
    const browser = await getBrowser();
    const result  = await scrapeInstagramFollowers(feed.website_instagram, browser);
    return result ?? empty;
  } catch {
    return empty;
  }
}

// ── Main orchestrator ─────────────────────────────────────────────────────────

/**
 * Enrich a single feed object with all Phase 4 data.
 * Mutates `feed` in place and returns it.
 * Never throws — every step is individually try/caught.
 *
 * @param {object} feed  Feed object from Phase 3b (mutated in place)
 * @returns {Promise<object>}
 */
async function enrichPodcast(feed) {
  // ── 4a: RSS + homepage (must run first — sets website_youtube for 4d) ────
  try { Object.assign(feed, await step4a_rssHomepage(feed)); } catch {}

  // ── 4d: YouTube API (runs after 4a so feed.website_youtube is populated) ─
  try { Object.assign(feed, await step4d_youtube(feed)); } catch {}

  // ── Sequential Puppeteer steps (max 3 concurrent across all workers) ─────

  // 4b — Apple (always — we have itunesId for every feed)
  await acquirePuppeteerSlot();
  try { Object.assign(feed, await step4b_apple(feed)); } catch {} finally { releasePuppeteerSlot(); }
  await sleep(1000);

  // 4c — Spotify (only if URL was found by 4a)
  if (feed.website_spotify) {
    await acquirePuppeteerSlot();
    try { Object.assign(feed, await step4c_spotify(feed)); } catch {} finally { releasePuppeteerSlot(); }
    await sleep(1000);
  }

  // 4e — Instagram (only if URL was found by 4a)
  if (feed.website_instagram) {
    await acquirePuppeteerSlot();
    try { Object.assign(feed, await step4e_instagram(feed)); } catch {} finally { releasePuppeteerSlot(); }
    await sleep(1000);
  }

  // 4f — Twitter followers (only if URL found by 4a; best-effort, low success rate)
  if (feed.website_twitter) {
    await acquirePuppeteerSlot();
    try {
      const browser = await getBrowser();
      const tw = await scrapeTwitterFollowers(feed.website_twitter, browser);
      if (tw) Object.assign(feed, tw);
    } catch {} finally { releasePuppeteerSlot(); }
  }

  return feed;
}

module.exports = { enrichPodcast };
