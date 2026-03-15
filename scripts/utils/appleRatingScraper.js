'use strict';

/**
 * appleRatingScraper.js — Scrape Apple Podcasts rating via Puppeteer
 *
 * Target: https://podcasts.apple.com/us/podcast/id{itunesId}
 *
 * Extracts rating and review count from the page's Schema.org JSON-LD first,
 * then falls back to parsing the visible page text.
 *
 * Usage:
 *   const { scrapeAppleRating } = require('./appleRatingScraper');
 *   const result = await scrapeAppleRating('1546578170');
 *   // → { apple_rating: 4.7, apple_rating_count: 8432 }
 *   // → null  (not enough ratings / page error)
 *
 * Usage with shared browser:
 *   const { getBrowser } = require('./browserManager');
 *   const browser = await getBrowser();
 *   const result = await scrapeAppleRating('1546578170', browser);
 */

const { getBrowser } = require('./browserManager');

const APPLE_BASE = 'https://podcasts.apple.com/us/podcast/id';

/**
 * @param {string|number} itunesId
 * @param {import('puppeteer').Browser} [existingBrowser]
 * @returns {Promise<{ apple_rating: number, apple_rating_count: number } | null>}
 */
async function scrapeAppleRating(itunesId, existingBrowser = null) {
  if (!itunesId) return null;

  const url       = `${APPLE_BASE}${itunesId}`;
  const ownBrowser = existingBrowser === null;
  const browser   = ownBrowser ? await getBrowser() : existingBrowser;
  let page        = null;

  try {
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Wait briefly for client-side rating render
    try {
      await page.waitForFunction(
        () => {
          // JSON-LD present or rating text visible
          const ld = document.querySelector('script[type="application/ld+json"]');
          if (ld && ld.textContent.includes('aggregateRating')) return true;
          // Some pages render "X Ratings" in the DOM
          return /\d[\d,]*\s+Rating/i.test(document.body.innerText);
        },
        { timeout: 8_000 }
      );
    } catch {
      // Rating block might not be present — proceed anyway
    }

    const result = await page.evaluate(() => {
      // ── Strategy 1: Schema.org JSON-LD ────────────────────────────────────
      const ldScripts = Array.from(
        document.querySelectorAll('script[type="application/ld+json"]')
      );
      for (const script of ldScripts) {
        try {
          const obj = JSON.parse(script.textContent);
          const entries = Array.isArray(obj) ? obj : [obj];
          for (const entry of entries) {
            const ar = entry.aggregateRating;
            if (!ar) continue;
            const rating = parseFloat(ar.ratingValue);
            const count  = parseInt(String(ar.reviewCount || ar.ratingCount || '').replace(/,/g, ''), 10);
            if (!isNaN(rating) && rating >= 1 && rating <= 5) {
              return { rating, count: isNaN(count) ? null : count };
            }
          }
        } catch {
          // malformed JSON — skip
        }
      }

      // ── Strategy 2: parse visible page text ───────────────────────────────
      const text = document.body.innerText;

      // Rating: a decimal like "4.7" or "4,7" in the 1–5 range
      const ratingMatch = text.match(/\b([1-5][.,]\d)\b/);
      if (!ratingMatch) return null;
      const rating = parseFloat(ratingMatch[1].replace(',', '.'));
      if (isNaN(rating)) return null;

      // Count: "8,432 Ratings" or "8.4K Ratings"
      const countMatch = text.match(/([\d,.]+[KkMm]?)\s+Rating/i);
      let count = null;
      if (countMatch) {
        const raw = countMatch[1].trim().toLowerCase();
        const k   = raw.match(/^([\d.]+)k$/);
        const m   = raw.match(/^([\d.]+)m$/);
        if (k)      count = Math.round(parseFloat(k[1]) * 1000);
        else if (m) count = Math.round(parseFloat(m[1]) * 1_000_000);
        else        count = parseInt(raw.replace(/[,\.]/g, ''), 10) || null;
      }

      return { rating, count };
    });

    if (!result || result.rating === null) return null;

    return {
      apple_rating       : result.rating,
      apple_rating_count : result.count ?? null,
    };

  } catch (err) {
    // Swallow — caller handles null
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
    // Never close the shared browser here
  }
}

module.exports = { scrapeAppleRating };
