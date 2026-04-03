'use strict';

/**
 * Spotify Podcast Rating Scraper — Puppeteer
 *
 * Scrapes rating and review count from an open.spotify.com/show/... page.
 * Handles locale-formatted numbers (French: 4,7 → 4.7 / 942,3 k → 942300).
 *
 * Usage (standalone):
 *   const { scrapeSpotifyRating } = require('./spotifyRating');
 *   const result = await scrapeSpotifyRating('https://open.spotify.com/show/4rOoJ6Egrf8K2IrywzwOMk');
 *   // → { rating: 4.7, reviewCount: 942300 }
 *
 * Usage (reusing an existing browser):
 *   const { scrapeSpotifyRating } = require('./spotifyRating');
 *   const result = await scrapeSpotifyRating(url, existingBrowser);
 */

const { getBrowser } = require('./browserManager');

// ── Locale-aware number parsers ───────────────────────────────────────────────

/**
 * Parse a Spotify rating string to float.
 * Handles both "4.7" and "4,7" (French locale).
 */
function parseRating(raw) {
  if (!raw) return null;
  const normalised = raw.trim().replace(',', '.');
  const value = parseFloat(normalised);
  return isNaN(value) || value < 1 || value > 5 ? null : value;
}

/**
 * Parse a Spotify review count string to integer.
 * Handles formats like "942,3 k" → 942300, "1,2 M" → 1200000,
 * "12,345" (English thousands) → 12345, "942 k" → 942000.
 */
function parseReviewCount(raw) {
  if (!raw) return null;

  const clean = raw.trim().toLowerCase();

  // Handle "k" suffix (thousands): "942,3 k" or "942.3 k" or "942 k"
  const kMatch = clean.match(/^([\d,\.]+)\s*k$/);
  if (kMatch) {
    // The number before "k" uses comma as decimal separator OR thousands sep.
    // If there's exactly one comma/dot separating 1 digit → decimal.
    // "942,3" → 942.3 → 942300; "1,234" (4-digit grouping) → 1234 → 1234000
    const numStr = kMatch[1].replace(',', '.');
    const num = parseFloat(numStr);
    if (isNaN(num)) return null;
    return Math.round(num * 1000);
  }

  // Handle "m" suffix (millions): "1,2 m" → 1200000
  const mMatch = clean.match(/^([\d,\.]+)\s*m$/);
  if (mMatch) {
    const numStr = mMatch[1].replace(',', '.');
    const num = parseFloat(numStr);
    if (isNaN(num)) return null;
    return Math.round(num * 1_000_000);
  }

  // Plain integer (possibly with thousands separators: "12,345" or "12 345")
  const plain = clean.replace(/[\s,\.]/g, '');
  const value = parseInt(plain, 10);
  return isNaN(value) ? null : value;
}

// ── Core scraper ──────────────────────────────────────────────────────────────

/**
 * Extract rating and review count from the current page content.
 * Returns { rating: string|null, reviewCount: string|null } (raw strings).
 *
 * Primary: aria-label on the rating button, e.g.:
 *   FR: "5 étoiles, 19 évaluations"
 *   EN: "4.7 stars, 942 ratings"
 * Fallback: body innerText pattern matching.
 */
async function extractRatingFromPage(page) {
  return page.evaluate(() => {
    // ── Primary: aria-label on the star rating button ────────────────────────
    // Spotify renders a <button aria-label="X étoiles, Y évaluations"> (FR)
    // or <button aria-label="X stars, Y ratings"> (EN)
    const btn = document.querySelector(
      'button[aria-label*="étoiles"], button[aria-label*="stars"], ' +
      'button[aria-label*="évaluations"], button[aria-label*="ratings"]'
    );
    if (btn) {
      const label = btn.getAttribute('aria-label') || '';
      // Rating: first number (integer or decimal with . or ,)
      const ratingM = label.match(/^([\d]+(?:[,\.][\d]+)?)/);
      // Count: number before "évaluations" or "ratings" (may have k/M suffix)
      const countM  = label.match(/([\d][\d\s,\.]*[kKmM]?)\s*(?:évaluations?|ratings?)/i);
      if (ratingM) {
        return {
          rating      : ratingM[1],
          reviewCount : countM ? countM[1].trim() : null,
        };
      }
    }

    // ── Fallback: innerText scan ──────────────────────────────────────────────
    const text = document.body.innerText;
    // Accepts both decimal (4,7 / 4.7) and whole numbers (5)
    const ratingPattern = /\b([1-5](?:[,\.]\d)?)\b/;
    const countPattern  = /\(([\d,\.\s]+[kKmM]?)\)/;

    const ratingMatch = text.match(ratingPattern);
    const countMatch  = text.match(countPattern);

    return {
      rating      : ratingMatch ? ratingMatch[1] : null,
      reviewCount : countMatch  ? countMatch[1]  : null,
    };
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Scrape rating and review count for a Spotify podcast show page.
 *
 * @param {string}  spotifyUrl  - Full open.spotify.com/show/... URL
 * @param {import('puppeteer').Browser} [existingBrowser]
 *        - Optional: reuse a Puppeteer browser instance to avoid overhead.
 *          If omitted, a new browser is launched and closed after the call.
 * @returns {Promise<{ rating: number, reviewCount: number } | null>}
 */
async function scrapeSpotifyRating(spotifyUrl, existingBrowser = null) {
  if (!spotifyUrl || !spotifyUrl.includes('open.spotify.com/show/')) {
    return null;
  }

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

    // Block heavy resources — Spotify loads audio previews and artwork on 'load'
    // which can consume 40-100MB per page and cause OOM across concurrent feeds.
    await page.setRequestInterception(true);
    page.on('request', req => {
      // Block audio previews and artwork (the main OOM culprits on 'load').
      // Stylesheets must be allowed — Spotify's SPA won't render without them.
      if (['image', 'media', 'font'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Use 'load' instead of 'networkidle2' — Spotify keeps background requests open
    // indefinitely which causes networkidle2 to timeout.
    await page.goto(spotifyUrl, { waitUntil: 'load', timeout: 30_000 });

    // Wait for the rating block to appear (rendered client-side after load).
    // Accept both decimal ratings (4,7 / 4.7) and whole number ratings (5).
    // Also detect the aria-label on the star button as a signal.
    try {
      await page.waitForFunction(
        () => {
          const btn = document.querySelector(
            'button[aria-label*="étoiles"], button[aria-label*="stars"], ' +
            'button[aria-label*="évaluations"], button[aria-label*="ratings"]'
          );
          if (btn) return true;
          return /\b[1-5](?:[,\.]\d)?\b/.test(document.body.innerText);
        },
        { timeout: 10_000 }
      );
    } catch (_) {
      // Rating might not be present — fall through to extract attempt
    }

    const { rating: rawRating, reviewCount: rawCount } = await extractRatingFromPage(page);

    const rating      = parseRating(rawRating);
    const reviewCount = parseReviewCount(rawCount);

    if (rating === null && reviewCount === null) return null;

    return { rating, reviewCount };

  } catch (err) {
    console.warn(`[SpotifyRating] Error scraping ${spotifyUrl}:`, err.message);
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
    // Never close the shared browser here — browserManager owns it
  }
}

module.exports = { scrapeSpotifyRating, parseRating, parseReviewCount };
