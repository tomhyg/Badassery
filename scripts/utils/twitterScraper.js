'use strict';

/**
 * twitterScraper.js — Scrape Twitter/X follower count via Puppeteer
 *
 * Twitter aggressively blocks scrapers and requires login for most content.
 * This module uses a headed browser (via browserManager), detects login walls,
 * and returns null gracefully when blocked.
 *
 * Success rate is expected to be low (0–30%) — Twitter/X frequently redirects
 * unauthenticated visitors to the login flow.
 *
 * Usage:
 *   const { scrapeTwitterFollowers } = require('./twitterScraper');
 *   const result = await scrapeTwitterFollowers('https://twitter.com/hubermanlab');
 *   // → { twitter_followers: 1400000 }
 *   // → null  (login wall / blocked / error)
 */

const { getBrowser } = require('./browserManager');

/**
 * Parse a follower count string to an integer.
 * Handles: "1.4M", "142K", "12,345", "142000"
 */
function parseFollowerCount(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/,/g, '');
  const k = s.match(/^([\d.]+)\s*k$/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const m = s.match(/^([\d.]+)\s*m$/);
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  const n = parseInt(s.replace(/[^\d]/g, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * @param {string} twitterUrl  Full twitter.com or x.com profile URL
 * @param {import('puppeteer').Browser} [existingBrowser]
 * @returns {Promise<{ twitter_followers: number } | null>}
 */
async function scrapeTwitterFollowers(twitterUrl, existingBrowser = null) {
  if (!twitterUrl || !twitterUrl.match(/(?:twitter|x)\.com/i)) return null;

  const browser = existingBrowser === null ? await getBrowser() : existingBrowser;
  let page      = null;

  try {
    page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    // Normalize to x.com (Twitter redirects twitter.com → x.com)
    const url = twitterUrl.replace(/\/\/(?:www\.)?twitter\.com/, '//x.com');

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Allow JS to render (Twitter is a heavy SPA)
    await new Promise(r => setTimeout(r, 4000));

    const result = await page.evaluate(() => {
      const href = window.location.href;
      const text = document.body.innerText;
      const html = document.documentElement.innerHTML;

      // ── Login wall detection ──────────────────────────────────────────────
      if (
        href.includes('/i/flow/login') ||
        href.includes('/login') ||
        text.includes('Sign in to X') ||
        text.includes('Log in to Twitter') ||
        text.includes('Sign in') && text.includes('Don\'t have an account')
      ) {
        return { loginWall: true };
      }

      // ── Strategy 1: rendered "N Followers" in visible text ────────────────
      // X profile stats render as "1.4M Followers" near the follow button
      const textMatch = text.match(/([\d,.]+[KkMm]?)\s+Followers/i);
      if (textMatch) return { raw: textMatch[1] };

      // ── Strategy 2: embedded JSON ("followers_count":N) ───────────────────
      const jsonMatch = html.match(/"followers_count"\s*:\s*(\d+)/);
      if (jsonMatch) return { count: jsonMatch[1] };

      // ── Strategy 3: Next.js __NEXT_DATA__ JSON blob ───────────────────────
      const nextDataMatch = html.match(/"followersCount"\s*:\s*(\d+)/);
      if (nextDataMatch) return { count: nextDataMatch[1] };

      return null;
    });

    if (!result)           return null;
    if (result.loginWall)  return null;

    const count = result.count
      ? parseInt(result.count, 10)
      : parseFollowerCount(result.raw);

    return count !== null ? { twitter_followers: count } : null;

  } catch {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
    // Never close the shared browser here
  }
}

module.exports = { scrapeTwitterFollowers };
