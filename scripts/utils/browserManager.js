'use strict';

/**
 * browserManager.js — Shared Puppeteer browser singleton
 *
 * Maintains a single browser instance for the lifetime of the process.
 * All scrapers (Spotify, Apple, Instagram) should call getBrowser() instead
 * of launching their own instance.
 *
 * Usage:
 *   const { getBrowser, closeBrowser } = require('./browserManager');
 *   const browser = await getBrowser();
 *   // ... use browser ...
 *   await closeBrowser(); // call once at process exit
 */

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin   = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

let _browser  = null;
let _launching = null; // in-flight launch promise — prevents double-launch

/**
 * Return the shared Puppeteer browser, launching it if necessary.
 * If the browser has crashed/disconnected it will be re-launched.
 *
 * @returns {Promise<import('puppeteer').Browser>}
 */
async function getBrowser() {
  // If a browser exists, verify it's still alive
  if (_browser) {
    try {
      await _browser.version(); // throws if disconnected
      return _browser;
    } catch {
      _browser = null;
    }
  }

  // If a launch is already in flight, wait for it
  if (_launching) return _launching;

  _launching = puppeteerExtra.launch({
    headless: false, // headed required for Spotify (and more reliable for Apple/Instagram)
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  }).then(browser => {
    _browser   = browser;
    _launching = null;
    browser.on('disconnected', () => { _browser = null; });
    return browser;
  }).catch(err => {
    _launching = null;
    throw err;
  });

  return _launching;
}

/**
 * Close the shared browser and reset the singleton.
 * Call once at the end of a batch run.
 */
async function closeBrowser() {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

module.exports = { getBrowser, closeBrowser };
