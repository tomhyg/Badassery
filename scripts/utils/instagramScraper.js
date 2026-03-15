'use strict';

/**
 * instagramScraper.js — Scrape Instagram follower count via Puppeteer
 *
 * Instagram blocks plain HTTP fetches and headless browsers.
 * This module uses a headed Puppeteer browser (via browserManager) and looks
 * for the follower count in the rendered page or embedded JSON.
 *
 * Detects login wall and returns null gracefully.
 *
 * Usage:
 *   const { scrapeInstagramFollowers } = require('./instagramScraper');
 *   const result = await scrapeInstagramFollowers('https://www.instagram.com/hubermanlab/');
 *   // → { instagram_followers: 5400000 }
 *   // → null  (login wall / blocked / error)
 *
 * Usage with shared browser:
 *   const { getBrowser } = require('./browserManager');
 *   const browser = await getBrowser();
 *   const result = await scrapeInstagramFollowers(url, browser);
 */

const { getBrowser } = require('./browserManager');

/**
 * Parse follower count string to integer.
 * Handles: "5.4M", "142K", "12,345", "142000"
 */
function parseFollowerCount(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/,/g, '');
  const k = s.match(/^([\d.]+)\s*k$/);
  if (k) return Math.round(parseFloat(k[1]) * 1000);
  const m = s.match(/^([\d.]+)\s*m$/);
  if (m) return Math.round(parseFloat(m[1]) * 1_000_000);
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return isNaN(n) ? null : n;
}

/**
 * @param {string} instagramUrl  Full instagram.com profile URL
 * @param {import('puppeteer').Browser} [existingBrowser]
 * @returns {Promise<{ instagram_followers: number } | null>}
 */
async function scrapeInstagramFollowers(instagramUrl, existingBrowser = null) {
  if (!instagramUrl || !instagramUrl.includes('instagram.com')) return null;

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

    await page.goto(instagramUrl, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Allow JS to render
    await new Promise(r => setTimeout(r, 3000));

    const extracted = await page.evaluate(() => {
      const text = document.body.innerText;
      const html = document.documentElement.innerHTML;

      // ── Login wall detection ─────────────────────────────────────────────
      // Instagram redirects to /accounts/login/ or shows a login modal
      if (
        window.location.href.includes('/accounts/login') ||
        text.includes('Log in to Instagram') ||
        text.includes('You must be logged in')
      ) {
        return { loginWall: true };
      }

      // ── Strategy 1: embedded JSON blob ───────────────────────────────────
      // Older layout embeds {"edge_followed_by":{"count":N}} in page source
      const jsonMatch = html.match(/"edge_followed_by":\s*\{"count":\s*(\d+)\}/);
      if (jsonMatch) return { followers: jsonMatch[1] };

      // Strategy 1b: follower_count in shared_data JSON
      const fcMatch = html.match(/"follower_count":\s*(\d+)/);
      if (fcMatch) return { followers: fcMatch[1] };

      // ── Strategy 2: meta description ─────────────────────────────────────
      // <meta ... content="1.2M Followers, ...">
      const meta = document.querySelector('meta[name="description"], meta[property="og:description"]');
      if (meta) {
        const content = meta.getAttribute('content') || '';
        const m = content.match(/([\d,.]+[KkMm]?)\s+Followers/i);
        if (m) return { followersRaw: m[1] };
      }

      // ── Strategy 3: rendered page text ───────────────────────────────────
      // Profile header renders "N followers" as visible text
      const textMatch = text.match(/([\d,.]+[KkMm]?)\s+followers/i);
      if (textMatch) return { followersRaw: textMatch[1] };

      return null;
    });

    if (!extracted) return null;
    if (extracted.loginWall) return null;

    const raw = extracted.followers || extracted.followersRaw;
    const count = parseFollowerCount(raw);
    if (count === null) return null;

    return { instagram_followers: count };

  } catch {
    return null;
  } finally {
    if (page) await page.close().catch(() => {});
    // Never close the shared browser here
  }
}

module.exports = { scrapeInstagramFollowers, parseFollowerCount };
