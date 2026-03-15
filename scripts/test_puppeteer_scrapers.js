/**
 * test_puppeteer_scrapers.js
 *
 * Tests three Puppeteer scrapers:
 *   1. Spotify Charts (podcastcharts.byspotify.com)
 *   2. Spotify podcast show page (open.spotify.com/show/...)
 *   3. Instagram profile page (instagram.com/...)
 *
 * Usage:
 *   node scripts/test_puppeteer_scrapers.js           # headless
 *   node scripts/test_puppeteer_scrapers.js --visible # headless:false (see browser)
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const puppeteer = require('puppeteer');
const admin     = require('firebase-admin');

// ── Firebase ──────────────────────────────────────────────────────────────────

const sa = require('../serviceAccountKey.json');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const fsdb = admin.firestore();

// ── Config ────────────────────────────────────────────────────────────────────

const HEADLESS = !process.argv.includes('--visible');
const NAV_TIMEOUT = 30000;

// Realistic Chrome user agent
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function elapsed(t) { return ((Date.now() - t) / 1000).toFixed(2) + 's'; }
function truncate(s, n = 400) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
function hr() { console.log('─'.repeat(72)); }
function hrd() { console.log('═'.repeat(72)); }

// ── Load test podcast from Firestore ─────────────────────────────────────────

async function loadTestPodcast() {
  process.stdout.write('  Loading test podcast from Firestore (has Spotify + Instagram)… ');
  const snap = await fsdb.collection('podcasts')
    .where('website_spotify', '!=', '')
    .limit(500)
    .get();

  const match = snap.docs.find(d => {
    const p = d.data();
    if (!p.website_instagram || p.website_instagram === '') return false;
    if (!p.website_spotify   || p.website_spotify   === '') return false;
    const ig = p.website_instagram.toLowerCase();
    const sp = p.website_spotify.toLowerCase();
    if (ig.includes('spotify') || sp.includes('spotifyforcreators')) return false;
    // Must be a proper open.spotify.com/show/... URL
    if (!sp.includes('open.spotify.com/show/') && !sp.includes('spotify.com/show/')) return false;
    return true;
  });

  if (!match) throw new Error('No suitable podcast found.');
  const p = match.data();
  console.log('found.');
  return {
    itunesId  : match.id,
    title     : p.title,
    spotify   : p.website_spotify,
    instagram : p.website_instagram,
  };
}

// ── Browser factory ───────────────────────────────────────────────────────────

async function launchBrowser() {
  return puppeteer.launch({
    headless      : HEADLESS,
    args          : [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled', // hide webdriver flag
      '--disable-infobars',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
}

async function newStealthPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  // Mask navigator.webdriver
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  page.setDefaultNavigationTimeout(NAV_TIMEOUT);
  return page;
}

// ── 1. Spotify Charts ─────────────────────────────────────────────────────────

async function scrapeSpotifyCharts(browser) {
  hrd();
  console.log('  SCRAPER 1 — Spotify Podcast Charts');
  hrd();

  // Try both URLs
  const urls = [
    'https://podcastcharts.byspotify.com/',
    'https://charts.spotify.com/charts/overview/global',
  ];

  for (const url of urls) {
    hr();
    console.log(`  URL: ${url}`);
    const page = await newStealthPage(browser);
    const t0   = Date.now();

    try {
      console.log('  Navigating…');
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      console.log(`  HTTP status : ${resp?.status()}`);
      console.log(`  Final URL   : ${page.url()}`);
      console.log(`  Time to DOM : ${elapsed(t0)}`);

      // Wait up to 8s for any podcast list elements to appear
      const selectors = [
        '[class*="chart"]',
        '[class*="podcast"]',
        '[class*="rank"]',
        'table',
        '[data-testid]',
        'li',
        'h2', 'h3',
      ];

      let foundSel = null;
      for (const sel of selectors) {
        try {
          await page.waitForSelector(sel, { timeout: 3000 });
          foundSel = sel;
          break;
        } catch (_) {}
      }
      console.log(`  First matching selector: ${foundSel || 'none'}`);
      console.log(`  Time to content : ${elapsed(t0)}`);

      // Grab page title and meta
      const title = await page.title();
      console.log(`  Page title : ${title}`);

      // Dump raw HTML (first 2000 chars)
      const html = await page.content();
      console.log(`\n  Raw HTML (first 2000 chars):\n  ${truncate(html, 2000)}`);

      // Attempt to extract podcast ranks
      const entries = await page.evaluate(() => {
        // Try generic approaches to find ranked items
        const results = [];

        // Approach 1: Look for elements containing a rank number + title pattern
        const allText = Array.from(document.querySelectorAll('*'))
          .filter(el => el.children.length === 0 && el.textContent.trim().length > 1 && el.textContent.trim().length < 200)
          .map(el => el.textContent.trim());

        // Approach 2: Look for list items or table rows
        const rows = Array.from(document.querySelectorAll('tr, li, [class*="row"], [class*="item"], [class*="entry"]'))
          .slice(0, 30)
          .map(el => el.textContent.replace(/\s+/g, ' ').trim())
          .filter(t => t.length > 2 && t.length < 300);

        // Approach 3: Any element with a rank-looking number followed by text
        const ranked = allText.filter(t => /^\d{1,3}[\s\.\)]+\w/.test(t)).slice(0, 20);

        return { rows: rows.slice(0, 20), ranked: ranked.slice(0, 20), textSample: allText.slice(0, 50) };
      });

      console.log(`\n  Extracted rows (${entries.rows.length}):`);
      entries.rows.forEach((r, i) => console.log(`    ${i + 1}. ${truncate(r, 120)}`));

      console.log(`\n  Ranked entries found (${entries.ranked.length}):`);
      entries.ranked.forEach((r, i) => console.log(`    ${i + 1}. ${r}`));

      if (entries.rows.length === 0 && entries.ranked.length === 0) {
        console.log(`\n  Text sample (first 30 elements):`);
        entries.textSample.forEach((t, i) => console.log(`    ${i + 1}. ${truncate(t, 100)}`));
      }

      // Screenshot
      const screenshotPath = `/tmp/spotify_charts_${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`\n  Screenshot saved: ${screenshotPath}`);

    } catch (err) {
      console.log(`  ❌  Error: ${err.message} (${elapsed(t0)})`);
    } finally {
      await page.close();
    }
  }
}

// ── 2. Spotify Show Page ─────────────────────────────────────────────────────

async function scrapeSpotifyShow(browser, podcast) {
  hrd();
  console.log('  SCRAPER 2 — Spotify Show Page');
  hrd();
  console.log(`  Podcast : ${podcast.title}`);
  console.log(`  URL     : ${podcast.spotify}`);

  const url  = podcast.spotify.startsWith('http') ? podcast.spotify : 'https://' + podcast.spotify;
  const page = await newStealthPage(browser);
  const t0   = Date.now();

  try {
    console.log('\n  Navigating…');
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    console.log(`  HTTP status : ${resp?.status()}`);
    console.log(`  Final URL   : ${page.url()}`);
    console.log(`  Time to DOM : ${elapsed(t0)}`);

    // Wait for JS to hydrate — Spotify embeds content after React renders
    const spotifySelectors = [
      '[data-testid="show-header"]',
      '[data-testid="episodes-section"]',
      'h1',
      '[class*="Type__TypeElement"]',
      'span[class*="encore"]',
    ];

    let found = null;
    for (const sel of spotifySelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 5000 });
        found = sel;
        break;
      } catch (_) {}
    }
    console.log(`  Selector matched : ${found || 'none after 5s'}`);
    console.log(`  Time to content  : ${elapsed(t0)}`);

    // Extra wait for full hydration
    await new Promise(r => setTimeout(r, 2000));

    const title = await page.title();
    console.log(`  Page title : ${title}`);

    // Extract structured data
    const data = await page.evaluate(() => {
      const getText = sel => {
        const el = document.querySelector(sel);
        return el ? el.textContent.trim() : null;
      };
      const getAll = sel => Array.from(document.querySelectorAll(sel)).map(e => e.textContent.trim()).filter(Boolean);

      // JSON-LD structured data (Spotify often embeds this)
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => { try { return JSON.parse(s.textContent); } catch(_) { return null; } })
        .filter(Boolean);

      // Open Graph / meta
      const og = {};
      document.querySelectorAll('meta[property^="og:"], meta[name]').forEach(m => {
        const key = m.getAttribute('property') || m.getAttribute('name');
        const val = m.getAttribute('content');
        if (key && val) og[key] = val;
      });

      // Try to find follower/listener counts (Spotify shows "monthly listeners" not followers)
      const allText = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && el.textContent.trim().length > 0)
        .map(el => el.textContent.trim());

      const statsText = allText.filter(t =>
        /follower|listener|subscriber|episode|rating|review/i.test(t) ||
        /[\d,]+\s*(follower|listener|subscriber)/i.test(t)
      );

      // All h1/h2/h3 headings
      const headings = getAll('h1, h2, h3');

      // Specific Spotify data-testid selectors
      const testIds = {};
      document.querySelectorAll('[data-testid]').forEach(el => {
        const id = el.getAttribute('data-testid');
        const t  = el.textContent.trim();
        if (t && t.length < 300) testIds[id] = t;
      });

      return { jsonLd, og, statsText: statsText.slice(0, 20), headings: headings.slice(0, 10), testIds };
    });

    console.log(`\n  JSON-LD structured data (${data.jsonLd.length} blocks):`);
    data.jsonLd.forEach((j, i) => console.log(`    [${i}] ${truncate(JSON.stringify(j), 300)}`));

    console.log(`\n  Open Graph meta (${Object.keys(data.og).length} tags):`);
    Object.entries(data.og).slice(0, 15).forEach(([k, v]) => console.log(`    ${k}: ${truncate(v, 100)}`));

    console.log(`\n  Stats/count text found (${data.statsText.length}):`);
    data.statsText.forEach(t => console.log(`    • ${t}`));

    console.log(`\n  Headings: ${data.headings.join(' | ')}`);

    console.log(`\n  data-testid elements (${Object.keys(data.testIds).length}):`);
    Object.entries(data.testIds).slice(0, 30).forEach(([k, v]) => console.log(`    [${k}]: ${truncate(v, 100)}`));

    // Raw HTML snippet around key content area
    const bodySnippet = await page.evaluate(() => {
      const main = document.querySelector('main') || document.querySelector('#main') || document.body;
      return main ? main.innerHTML.substring(0, 3000) : document.body.innerHTML.substring(0, 3000);
    });
    console.log(`\n  Main content HTML (first 3000 chars):\n  ${truncate(bodySnippet, 3000)}`);

    const screenshotPath = `/tmp/spotify_show_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n  Screenshot saved: ${screenshotPath}`);

  } catch (err) {
    console.log(`  ❌  Error: ${err.message} (${elapsed(t0)})`);
  } finally {
    await page.close();
  }
}

// ── 3. Instagram Profile ──────────────────────────────────────────────────────

async function scrapeInstagram(browser, podcast) {
  hrd();
  console.log('  SCRAPER 3 — Instagram Profile');
  hrd();
  console.log(`  Podcast   : ${podcast.title}`);
  console.log(`  Instagram : ${podcast.instagram}`);

  const url  = podcast.instagram.startsWith('http') ? podcast.instagram : 'https://' + podcast.instagram;
  const page = await newStealthPage(browser);
  const t0   = Date.now();

  try {
    console.log('\n  Navigating…');
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    console.log(`  HTTP status : ${resp?.status()}`);
    console.log(`  Final URL   : ${page.url()}`);
    console.log(`  Time to DOM : ${elapsed(t0)}`);

    // Instagram is heavily JS-rendered — wait for content
    const igSelectors = [
      'header section',
      '[class*="_aa_"]',    // Instagram's obfuscated class names
      'main header',
      'article',
      'h2',
      '[aria-label*="follower"]',
      'meta[name="description"]', // Set in HTML before JS
    ];

    let found = null;
    for (const sel of igSelectors) {
      try {
        await page.waitForSelector(sel, { timeout: 4000 });
        found = sel;
        break;
      } catch (_) {}
    }
    console.log(`  Selector matched : ${found || 'none'}`);

    // Extra wait for hydration
    await new Promise(r => setTimeout(r, 3000));
    console.log(`  Time after wait  : ${elapsed(t0)}`);

    const title = await page.title();
    console.log(`  Page title : ${title}`);

    const data = await page.evaluate(() => {
      // Meta description often has "X Followers, Y Following, Z Posts" BEFORE login wall
      const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
      const metaTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '';
      const metaImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';

      // JSON-LD
      const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => { try { return JSON.parse(s.textContent); } catch(_) { return null; } })
        .filter(Boolean);

      // shared_data script (Instagram embeds profile data here on public pages)
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      let sharedData = null;
      let additionalData = null;
      for (const s of scripts) {
        const t = s.textContent || '';
        if (t.includes('window._sharedData')) {
          try { sharedData = JSON.parse(t.match(/window\._sharedData\s*=\s*({.+?});/)?.[1] || 'null'); } catch(_) {}
        }
        if (t.includes('"follower_count"') || t.includes('"edge_followed_by"')) {
          additionalData = t.substring(0, 2000);
        }
      }

      // Visible text
      const allText = Array.from(document.querySelectorAll('*'))
        .filter(el => el.children.length === 0 && el.textContent.trim().length > 0 && el.textContent.trim().length < 300)
        .map(el => el.textContent.trim());

      const statsText = allText.filter(t =>
        /follower|following|post/i.test(t) ||
        /\d[\d,\.]+[KkMm]?\s*(follower|following)/i.test(t)
      ).slice(0, 20);

      // Check if we're on a login wall
      const isLoginWall = !!document.querySelector('input[name="username"], [data-testid="royal_login_button"], form[id="loginForm"]');

      return {
        metaDesc, metaTitle, metaImage,
        jsonLd,
        sharedData: sharedData ? JSON.stringify(sharedData).substring(0, 1000) : null,
        additionalData,
        statsText,
        isLoginWall,
        bodyText: document.body?.innerText?.substring(0, 1000) || '',
      };
    });

    console.log(`\n  Login wall detected: ${data.isLoginWall}`);
    console.log(`  Meta title       : ${data.metaTitle}`);
    console.log(`  Meta description : ${data.metaDesc}`);
    console.log(`  OG image         : ${truncate(data.metaImage, 80)}`);

    if (data.metaDesc) {
      const m = data.metaDesc.match(/([\d,\.]+[KkMm]?)\s*[Ff]ollowers?/);
      if (m) console.log(`\n  ✅  Followers extracted from meta: ${m[1]}`);
      else   console.log('\n  ⚠️  No follower count in meta description.');
    }

    console.log(`\n  JSON-LD blocks (${data.jsonLd.length}):`);
    data.jsonLd.forEach((j, i) => console.log(`    [${i}] ${truncate(JSON.stringify(j), 300)}`));

    if (data.sharedData) {
      console.log(`\n  window._sharedData snippet:\n  ${truncate(data.sharedData, 500)}`);
    }
    if (data.additionalData) {
      console.log(`\n  Script with follower_count:\n  ${truncate(data.additionalData, 500)}`);
    }

    console.log(`\n  Stats text from DOM (${data.statsText.length}):`);
    data.statsText.forEach(t => console.log(`    • ${t}`));

    console.log(`\n  Body text (first 1000 chars):\n  ${truncate(data.bodyText, 1000)}`);

    const screenshotPath = `/tmp/instagram_${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\n  Screenshot saved: ${screenshotPath}`);

  } catch (err) {
    console.log(`  ❌  Error: ${err.message} (${elapsed(t0)})`);
  } finally {
    await page.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🤖  PUPPETEER SCRAPER TEST');
  console.log(`  Mode: ${HEADLESS ? 'headless' : 'VISIBLE (browser window will open)'}`);
  console.log('='.repeat(72));
  console.log('');

  const podcast = await loadTestPodcast();
  console.log(`  Test podcast: "${podcast.title}"`);
  console.log(`  Spotify    : ${podcast.spotify}`);
  console.log(`  Instagram  : ${podcast.instagram}`);
  console.log('');

  const browser = await launchBrowser();
  console.log('  Browser launched.\n');

  try {
    await scrapeSpotifyCharts(browser);
    await scrapeSpotifyShow(browser, podcast);
    await scrapeInstagram(browser, podcast);
  } finally {
    await browser.close();
    console.log('\n  Browser closed.');
    process.exit(0);
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
