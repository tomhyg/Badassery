'use strict';

/**
 * Spotify Podcast Charts Scraper — Puppeteer
 *
 * Scrapes the US Top 200 podcast charts per category from
 * podcastcharts.byspotify.com/us, navigating each category via
 * the page's dropdown selector.
 *
 * Returns an index keyed by Spotify show ID:
 *   { showId → { bestRank, bestGenre, title, genres: { CategoryName: rank } } }
 *
 * Usage:
 *   const { scrapeAllSpotifyCharts } = require('./spotifyChartsScraper');
 *   const index = await scrapeAllSpotifyCharts();
 */

const puppeteer = require('puppeteer');

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://podcastcharts.byspotify.com/us';

// podcastcharts.byspotify.com hard-caps each category at exactly 50 items.
// There is no pagination, no load-more button, and no infinite scroll.
const MAX_PER_CATEGORY = 50;

// Actual category labels as they appear in ul.categories-ul on the page.
// These are discovered dynamically at runtime; this list is the hardcoded fallback.
// NOTE: "Trending Podcasts" and "Top Episodes" are chart-type views, not genres —
// they are included because they contain rankable podcast data.
const SPOTIFY_CHART_CATEGORIES = [
  'Top Podcasts',
  'Trending Podcasts',
  'Top Episodes',
  'Arts',
  'Business',
  'Comedy',
  'Education',
  'Fiction',
  'Health & Fitness',
  'History',
  'Leisure',
  'Music',
  'News',
  'Religion & Spirituality',
  'Science',
  'Society & Culture',
  'Sports',
  'Technology',
  'True Crime',
  'TV & Film',
];

// Category labels already match Apple Charts names — identity map kept for
// any future renames without breaking callers that depend on canonical names.
const CATEGORY_NAME_MAP = {
  'Top Podcasts'           : 'Top Podcasts',
  'Trending Podcasts'      : 'Trending Podcasts',
  'Top Episodes'           : 'Top Episodes',
  'Arts'                   : 'Arts',
  'Business'               : 'Business',
  'Comedy'                 : 'Comedy',
  'Education'              : 'Education',
  'Fiction'                : 'Fiction',
  'Health & Fitness'       : 'Health & Fitness',
  'History'                : 'History',
  'Leisure'                : 'Leisure',
  'Music'                  : 'Music',
  'News'                   : 'News',
  'Religion & Spirituality': 'Religion & Spirituality',
  'Science'                : 'Science',
  'Society & Culture'      : 'Society & Culture',
  'Sports'                 : 'Sports',
  'Technology'             : 'Technology',
  'True Crime'             : 'True Crime',
  'TV & Film'              : 'TV & Film',
};

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

// ── Browser helpers ───────────────────────────────────────────────────────────

async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args    : [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900',
    ],
    defaultViewport: { width: 1280, height: 900 },
  });
}

async function newPage(browser) {
  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  );
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  page.setDefaultNavigationTimeout(30_000);
  return page;
}

// ── Category discovery ────────────────────────────────────────────────────────

/**
 * Read category labels directly from ul.categories-ul on the page.
 *
 * The category list is ALWAYS present in the DOM (inside a hidden dropdown
 * wrapper with opacity:0 / pointer-events:none). We read its <span> text
 * without needing to "open" the dropdown at all.
 */
async function discoverCategories(page) {
  try {
    const categories = await page.evaluate(() => {
      // There are TWO ul.categories-ul on the page:
      //   [0] = language selector (div items: Nederlands, English…)
      //   [1] = category selector (button items: Top Podcasts, Business…)
      const uls = document.querySelectorAll('ul.categories-ul');
      const ul  = uls[1] || uls[0]; // always prefer the second (category) list
      if (!ul) return null;
      return Array.from(ul.querySelectorAll('li button span'))
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0)
        .filter((t, i, arr) => arr.indexOf(t) === i); // deduplicate
    });

    if (categories && categories.length >= 5) {
      log(`Discovered ${categories.length} categories: ${categories.join(', ')}`, 'SUCCESS');
      return categories;
    }
  } catch (e) {
    log(`Category discovery error: ${e.message}`, 'WARN');
  }

  log('Category ul not found — using hardcoded category list.', 'WARN');
  return SPOTIFY_CHART_CATEGORIES;
}

// ── Category navigation ───────────────────────────────────────────────────────

/**
 * Click a category button inside ul.categories-ul.
 *
 * The category list lives in a visually-hidden dropdown wrapper
 * (opacity:0 / pointer-events:none on the outer div). CSS pointer-events
 * only blocks real user mouse events — programmatic .click() via evaluate()
 * bypasses it entirely, so we never need to visually "open" the dropdown.
 *
 * Returns true if the button was found and clicked.
 */
async function selectCategory(page, categoryLabel) {
  return page.evaluate((target) => {
    // ul[0] = language selector, ul[1] = category selector
    const uls = document.querySelectorAll('ul.categories-ul');
    const ul  = uls[1] || uls[0];
    if (!ul) return false;

    const buttons = Array.from(ul.querySelectorAll('li button'));
    const btn = buttons.find(b => {
      const span = b.querySelector('span');
      return span && span.textContent.trim() === target;
    });

    if (btn) { btn.click(); return true; }
    return false;
  }, categoryLabel);
}

// ── Chart item extraction ─────────────────────────────────────────────────────

/**
 * Count current chart items on page (those with valid Spotify show links or rank numbers).
 */
async function countChartItems(page) {
  return page.evaluate(() => {
    // Strategy 1: count links to Spotify shows
    const showLinks = document.querySelectorAll('a[href*="open.spotify.com/show/"]');
    if (showLinks.length > 0) return showLinks.length;

    // Strategy 2: count elements that look like ranked entries
    const rankEls = document.querySelectorAll(
      '[class*="ChartEntry"], [class*="chart-entry"], [class*="chart-row"], [class*="chartEntry"]'
    );
    if (rankEls.length > 0) return rankEls.length;

    // Strategy 3: count list items inside any chart container
    const chartContainer = document.querySelector(
      '[class*="chart-list"], [class*="ChartList"], [class*="chartList"], [class*="chart_list"], ol, [role="list"]'
    );
    if (chartContainer) return chartContainer.querySelectorAll('li').length;

    return 0;
  });
}

/**
 * Extract all chart entries visible on the current page.
 *
 * DOM structure (as of 2025): each row is a <button class="Show_show__...">
 *   <img alt="Podcast Title">          ← title (most reliable source)
 *   <div class="Rank_rank__...">1</div> ← rank number
 *   <a href="open.spotify.com/show/ID">Follow</a> ← Spotify show ID
 *
 * Returns [{ spotifyId, title, rank }]
 */
async function extractChartEntries(page, categoryName) {
  return page.evaluate(() => {
    const entries = [];
    const seenIds = new Set();

    // ── Primary strategy: Show_show__ button rows ───────────────────────────
    const rows = Array.from(document.querySelectorAll('button[class*="Show_show"]'));

    if (rows.length > 0) {
      rows.forEach((row, index) => {
        // Spotify ID from the "Follow" anchor inside the row
        const followLink = row.querySelector('a[href*="open.spotify.com/show/"]');
        const spotifyId = followLink?.href.match(/show\/([A-Za-z0-9]+)/)?.[1] || null;

        const key = spotifyId || `idx:${index}`;
        if (seenIds.has(key)) return;
        seenIds.add(key);

        // Rank from the Rank_rank__ div
        const rankEl = row.querySelector('[class*="Rank_rank"]');
        const rank = rankEl ? (parseInt(rankEl.textContent.trim()) || index + 1) : index + 1;

        // Title from img alt attribute (the thumbnail always has alt = podcast title)
        const img = row.querySelector('img[alt]');
        const title = (img?.getAttribute('alt') || '').trim().slice(0, 150);

        entries.push({ spotifyId, title, rank });
      });

      if (entries.length > 0) {
        return entries.sort((a, b) => a.rank - b.rank);
      }
    }

    // ── Fallback: any anchor linking to a Spotify show ──────────────────────
    const showLinks = Array.from(document.querySelectorAll('a[href*="open.spotify.com/show/"]'));
    const seenFallback = new Set();

    showLinks.forEach((link, index) => {
      const spotifyId = link.href.match(/show\/([A-Za-z0-9]+)/)?.[1];
      if (!spotifyId || seenFallback.has(spotifyId)) return;
      seenFallback.add(spotifyId);

      // Walk up to find the row container, then get rank and title
      const row = link.closest('button') || link.closest('li') || link.parentElement?.parentElement;
      const rankEl = row?.querySelector('[class*="Rank_rank"], [class*="rank"]');
      const rank = rankEl ? (parseInt(rankEl.textContent.trim()) || index + 1) : index + 1;

      const img = row?.querySelector('img[alt]');
      const title = (img?.getAttribute('alt') || link.getAttribute('aria-label') || '').trim().slice(0, 150);

      entries.push({ spotifyId, title, rank });
    });

    return entries.sort((a, b) => a.rank - b.rank);
  });
}

// ── Single category scrape ────────────────────────────────────────────────────

/**
 * Scrape one category's top charts.
 *
 * Navigation strategy:
 *   - First category: navigate fresh to BASE_URL (page initialises on "Top Podcasts")
 *   - "Top Podcasts" on first load: skip selectCategory — it is already the default
 *     active view; re-clicking it triggers a React loading flash that clears content.
 *   - All other categories: click the button in ul.categories-ul via evaluate(),
 *     bypassing CSS pointer-events:none reliably.
 *
 * @param {{ categoryLabel: string, canonicalName: string, page: object, isFirst: boolean }}
 * @returns {Promise<Array<{ spotifyId: string|null, title: string, rank: number, category: string }>>}
 */
async function scrapeSpotifyCharts({ categoryLabel, canonicalName, page, isFirst }) {
  log(`Scraping Spotify Charts [US] ${canonicalName}…`);

  if (isFirst) {
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    // Wait for the category list to be rendered by React
    await page.waitForSelector('ul.categories-ul', { timeout: 10_000 });
    await new Promise(r => setTimeout(r, 500));
  }

  // "Top Podcasts" is the default view immediately after navigating to BASE_URL.
  // Re-clicking it when it is already the active category triggers a React loading
  // flash that briefly clears content from the DOM — causing waitForFunction to time
  // out. Skip the click entirely; the content is already present.
  const isAlreadyActive = isFirst && categoryLabel === 'Top Podcasts';

  if (!isAlreadyActive) {
    // Click the category button directly in the hidden-but-DOM-present list.
    // CSS pointer-events:none only blocks user interaction — .click() in evaluate()
    // always fires regardless.
    const selected = await selectCategory(page, categoryLabel);
    if (!selected) {
      log(`Category button not found in ul.categories-ul for "${categoryLabel}" — skipping.`, 'WARN');
      return [];
    }
  }

  // Brief pause to let React start the category transition before we poll for content.
  if (!isAlreadyActive) await new Promise(r => setTimeout(r, 500));

  // ── Wait for at least one Spotify show link to confirm content loaded ────────
  let contentReady = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(
        () => document.querySelectorAll('a[href*="open.spotify.com/show/"]').length > 0,
        { timeout: 6000 }
      );
      contentReady = true;
      break;
    } catch (_) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!contentReady) {
    log(`No chart content detected for ${canonicalName} — skipping.`, 'WARN');
    return [];
  }

  // Spotify hard-caps at 50 items per category — no scrolling or pagination needed.
  const finalCount = await countChartItems(page);

  // ── Extract entries ───────────────────────────────────────────────────────────
  const entries = await extractChartEntries(page, canonicalName);
  const capped  = entries.slice(0, MAX_PER_CATEGORY);

  log(`${capped.length} entries (${finalCount} detected in DOM) — ${canonicalName}`, 'SUCCESS');
  return capped.map(e => ({ ...e, category: canonicalName }));
}

// ── Scrape all categories ─────────────────────────────────────────────────────

/**
 * Scrape Spotify Charts for all categories.
 * Launches a single browser and reuses one page.
 *
 * @returns {Promise<Object>} Index: { spotifyId → { bestRank, bestGenre, title, genres: { Cat: rank } } }
 */
async function scrapeAllSpotifyCharts() {
  log(`Spotify Charts — scraping all categories (US Top 200 each)…`, 'PHASE');

  const browser = await launchBrowser();
  const page    = await newPage(browser);
  const index   = {};

  try {
    // ── Load page once, then discover actual category names from DOM ──────────
    log('Loading base page to discover categories…');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise(r => setTimeout(r, 1500));

    const discovered = await discoverCategories(page);
    log(`Using ${discovered.length} categories: ${discovered.slice(0, 5).join(', ')}…`);

    // ── Iterate categories ───────────────────────────────────────────────────
    let isFirst = true;
    for (const rawLabel of discovered) {
      const canonicalName = CATEGORY_NAME_MAP[rawLabel] || rawLabel;

      const entries = await scrapeSpotifyCharts({
        categoryLabel  : rawLabel,
        canonicalName,
        page,
        isFirst,
      });

      isFirst = false;

      for (const entry of entries) {
        const key = entry.spotifyId || `title:${entry.title.toLowerCase().replace(/\s+/g, '_')}`;

        if (!index[key]) {
          index[key] = {
            spotifyId  : entry.spotifyId,
            title      : entry.title,
            bestRank   : entry.rank,
            bestGenre  : canonicalName,
            genres     : {},
          };
        }

        index[key].genres[canonicalName] = entry.rank;

        if (entry.rank < index[key].bestRank) {
          index[key].bestRank  = entry.rank;
          index[key].bestGenre = canonicalName;
        }
      }

      // Brief pause between categories to avoid rate limiting
      if (!isFirst) await new Promise(r => setTimeout(r, 1500));
    }
  } finally {
    await browser.close();
  }

  const total = Object.keys(index).length;
  log(`Spotify Charts index: ${total} unique podcasts across all categories.`, 'SUCCESS');
  return index;
}

/**
 * Scrape Spotify Charts for a specific subset of categories.
 * Convenience wrapper around scrapeAllSpotifyCharts for testing or partial runs.
 *
 * @param {string[]} categoryLabels  - Category names matching SPOTIFY_CHART_CATEGORIES entries
 * @returns {Promise<Object>} Same index format as scrapeAllSpotifyCharts
 */
async function scrapeSpotifyChartsForCategories(categoryLabels) {
  log(`Spotify Charts — scraping ${categoryLabels.length} categories: ${categoryLabels.join(', ')}…`, 'PHASE');

  const browser = await launchBrowser();
  const page    = await newPage(browser);
  const index   = {};

  try {
    let isFirst = true;
    for (const rawLabel of categoryLabels) {
      const canonicalName = CATEGORY_NAME_MAP[rawLabel] || rawLabel;

      const entries = await scrapeSpotifyCharts({
        categoryLabel: rawLabel,
        canonicalName,
        page,
        isFirst,
      });

      isFirst = false;

      for (const entry of entries) {
        const key = entry.spotifyId || `title:${entry.title.toLowerCase().replace(/\s+/g, '_')}`;

        if (!index[key]) {
          index[key] = {
            spotifyId : entry.spotifyId,
            title     : entry.title,
            bestRank  : entry.rank,
            bestGenre : canonicalName,
            genres    : {},
          };
        }

        index[key].genres[canonicalName] = entry.rank;

        if (entry.rank < index[key].bestRank) {
          index[key].bestRank  = entry.rank;
          index[key].bestGenre = canonicalName;
        }
      }

      if (!isFirst) await new Promise(r => setTimeout(r, 1500));
    }
  } finally {
    await browser.close();
  }

  const total = Object.keys(index).length;
  log(`Spotify Charts index: ${total} unique podcasts.`, 'SUCCESS');
  return index;
}

module.exports = {
  scrapeAllSpotifyCharts,
  scrapeSpotifyCharts,
  scrapeSpotifyChartsForCategories,
  SPOTIFY_CHART_CATEGORIES,
  CATEGORY_NAME_MAP,
};
