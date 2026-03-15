'use strict';

/**
 * Apple Podcasts Charts Scraper — Puppeteer
 *
 * Scrapes the real Top 200 Apple Podcast charts per genre (US store).
 * Technique: navigate to /us/charts?genre=<id>, click "Top Shows",
 * scroll .scrollable-page until 200 items load, extract hrefs.
 *
 * Usage:
 *   const { scrapeAllAppleCharts } = require('./appleChartsScraper');
 *   const index = await scrapeAllAppleCharts();
 *   // → { itunesId → { bestRank, bestGenre, genres: { Business: 3, Technology: 12 } } }
 */

const puppeteer = require('puppeteer');

// 19 genres that have standalone /us/charts?genre=<id> pages
const APPLE_CHART_GENRES = [
  { id: 1321, name: 'Business' },
  { id: 1489, name: 'News' },
  { id: 1303, name: 'Comedy' },
  { id: 1324, name: 'Society & Culture' },
  { id: 1488, name: 'True Crime' },
  { id: 1545, name: 'Sports' },
  { id: 1512, name: 'Health & Fitness' },
  { id: 1314, name: 'Religion & Spirituality' },
  { id: 1301, name: 'Arts' },
  { id: 1304, name: 'Education' },
  { id: 1487, name: 'History' },
  { id: 1309, name: 'TV & Film' },
  { id: 1533, name: 'Science' },
  { id: 1318, name: 'Technology' },
  { id: 1310, name: 'Music' },
  { id: 1305, name: 'Kids & Family' },
  { id: 1502, name: 'Leisure' },
  { id: 1483, name: 'Fiction' },
  { id: 1511, name: 'Government' },
];

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

/**
 * Scrape Top 200 Apple Charts for a single genre.
 * Reuses an existing Puppeteer page instance for efficiency.
 *
 * @param {{ genreId: number, genreName: string, page: import('puppeteer').Page }} opts
 * @returns {Promise<Array<{ rank: number, itunesId: string, title: string, genre: string }>>}
 */
async function scrapeAppleCharts({ genreId, genreName, page }) {
  const url = `https://podcasts.apple.com/us/charts?genre=${genreId}`;
  log(`Scraping Apple Charts [US] ${genreName} (genre ${genreId})...`);

  await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });

  // Click "Top Shows" tab (label varies slightly by genre)
  const clicked = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('a, button, [role="tab"], li'));
    const target = els.find(el => {
      const txt = el.textContent.trim().toLowerCase();
      return txt.includes('top shows') || txt === 'shows' || txt.startsWith('shows');
    });
    if (target) { target.click(); return true; }
    return false;
  });

  if (!clicked) {
    // Wait and retry — page sometimes loads slowly
    await new Promise(r => setTimeout(r, 2000));
    const retry = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('a, button, [role="tab"], li'));
      const target = els.find(el => {
        const txt = el.textContent.trim().toLowerCase();
        return txt.includes('shows') || txt.includes('top');
      });
      if (target) { target.click(); return true; }
      return false;
    });
    if (!retry) {
      log(`"Top Shows" button not found for ${genreName} — skipping.`, 'WARN');
      return [];
    }
  }

  await new Promise(r => setTimeout(r, 3000));

  // Scroll .scrollable-page until we have 200 podcasts or no more load
  let prevCount = 0;
  for (let round = 0; round < 10; round++) {
    await page.evaluate(async () => {
      const el = document.querySelector('.scrollable-page');
      if (!el) return;
      for (let i = 0; i < 50; i++) {
        el.scrollBy(0, 300);
        await new Promise(r => setTimeout(r, 150));
      }
    });
    await new Promise(r => setTimeout(r, 3000));

    const count = await page.evaluate(() =>
      document.querySelectorAll('a[href*="/us/podcast/"]').length
    );

    if (count >= 200) break;
    if (count === prevCount) break;
    prevCount = count;
  }

  // Extract podcast entries
  const podcasts = await page.evaluate((genre) => {
    const links = Array.from(document.querySelectorAll('a[href*="/us/podcast/"]'));
    const seen  = new Set();
    return links
      .map(a => ({
        title:    a.textContent.trim().split('\n')[0].trim(),
        itunesId: a.href.match(/id(\d+)/)?.[1] ?? null,
      }))
      .filter(p => {
        if (!p.itunesId || p.title.length < 2 || p.title.length > 150) return false;
        if (seen.has(p.itunesId)) return false;
        seen.add(p.itunesId);
        return true;
      })
      .map((p, i) => ({ rank: i + 1, itunesId: p.itunesId, title: p.title, genre }));
  }, genreName);

  log(`${podcasts.length} podcasts found in ${genreName}.`, 'SUCCESS');
  return podcasts;
}

/**
 * Scrape Top 200 Apple Charts for all genres.
 * Launches a single browser, reuses one page across all genres.
 *
 * @returns {Promise<Object>} Index: { itunesId → { bestRank, bestGenre, genres: { GenreName: rank } } }
 */
async function scrapeAllAppleCharts() {
  log(`Apple Charts — scraping ${APPLE_CHART_GENRES.length} genres (US Top 200 each)...`, 'PHASE');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  const chartIndex = {};

  try {
    for (const genre of APPLE_CHART_GENRES) {
      const chart = await scrapeAppleCharts({ genreId: genre.id, genreName: genre.name, page });

      for (const entry of chart) {
        const id = String(entry.itunesId);

        if (!chartIndex[id]) {
          chartIndex[id] = { bestRank: entry.rank, bestGenre: genre.name, title: entry.title, genres: {} };
        }

        chartIndex[id].genres[entry.genre] = entry.rank;

        if (entry.rank < chartIndex[id].bestRank) {
          chartIndex[id].bestRank  = entry.rank;
          chartIndex[id].bestGenre = genre.name;
        }
      }

      await new Promise(r => setTimeout(r, 2000)); // brief pause between genres
    }
  } finally {
    await browser.close();
  }

  const total = Object.keys(chartIndex).length;
  log(`Apple Charts index built: ${total} unique podcasts across all genres.`, 'SUCCESS');
  return chartIndex;
}

module.exports = { scrapeAllAppleCharts, scrapeAppleCharts, APPLE_CHART_GENRES };
