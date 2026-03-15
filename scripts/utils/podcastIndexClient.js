/**
 * PodcastIndex API Client
 *
 * Wraps the PodcastIndex REST API with:
 *   - SHA1 HMAC authentication (X-Auth-Date / X-Auth-Key / Authorization)
 *   - Token-bucket rate limiting (1 req/sec free-tier safe)
 *   - Exponential backoff retry via retryWithBackoff
 *   - Pagination helper for /podcasts/recent
 *
 * Credentials are read from process.env:
 *   PODCASTINDEX_API_KEY
 *   PODCASTINDEX_API_SECRET
 *
 * Usage:
 *   const client = new PodcastIndexClient();
 *   const feeds = await client.getRecentPodcasts(sinceTs);
 *   const episodes = await client.getEpisodesByFeedId(feedId);
 */

'use strict';

const crypto  = require('crypto');
const https   = require('https');
const { retryWithBackoff } = require('./retryWithBackoff');

const BASE_URL     = 'https://api.podcastindex.org/api/1.0';
const USER_AGENT   = 'BadasseryPR-WeeklyPipeline/1.0';
const MAX_PER_PAGE = 1000; // PI API page-size ceiling for /podcasts/recent

// ---------------------------------------------------------------------------
// Internal rate limiter — 0.9 req/sec to stay safely under the 1/sec limit
// ---------------------------------------------------------------------------

class _PITokenBucket {
  constructor(ratePerSec = 0.9) {
    this.intervalMs = Math.ceil(1000 / ratePerSec);
    this.tokens     = 1;
    this.lastRefill = Date.now();
  }

  _refill() {
    const elapsed = Date.now() - this.lastRefill;
    const add     = elapsed / this.intervalMs;
    this.tokens   = Math.min(1, this.tokens + add);
    this.lastRefill = Date.now();
  }

  async acquire() {
    while (true) {
      this._refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise(r => setTimeout(r, this.intervalMs));
    }
  }
}

// ---------------------------------------------------------------------------
// Low-level HTTP helper
// ---------------------------------------------------------------------------

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: {} }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          const err = new Error(`PodcastIndex 429 Too Many Requests — retry in 60s`);
          err.status = 429;
          return reject(err);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`PodcastIndex HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(new Error(`PodcastIndex JSON parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('PodcastIndex request timeout')); });
  });
}

// ---------------------------------------------------------------------------
// PodcastIndexClient
// ---------------------------------------------------------------------------

class PodcastIndexClient {
  /**
   * @param {object} [opts]
   * @param {string} [opts.apiKey]    Defaults to process.env.PODCASTINDEX_API_KEY
   * @param {string} [opts.apiSecret] Defaults to process.env.PODCASTINDEX_API_SECRET
   */
  constructor(opts = {}) {
    this.apiKey    = opts.apiKey    || process.env.PODCASTINDEX_API_KEY;
    this.apiSecret = opts.apiSecret || process.env.PODCASTINDEX_API_SECRET;

    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        'PodcastIndexClient: missing credentials. ' +
        'Set PODCASTINDEX_API_KEY and PODCASTINDEX_API_SECRET in .env'
      );
    }

    this._bucket = new _PITokenBucket(opts.ratePerSec ?? 0.9);
  }

  // ── Authentication ────────────────────────────────────────────────────────

  _buildHeaders() {
    const epochTime  = Math.floor(Date.now() / 1000);
    const hash       = crypto
      .createHash('sha1')
      .update(this.apiKey + this.apiSecret + String(epochTime))
      .digest('hex');

    return {
      'X-Auth-Date'  : String(epochTime),
      'X-Auth-Key'   : this.apiKey,
      'Authorization': hash,
      'User-Agent'   : USER_AGENT,
    };
  }

  // ── Core request (rate-limited + retry) ───────────────────────────────────

  async _request(path) {
    await this._bucket.acquire();

    return retryWithBackoff(
      () => {
        const headers = this._buildHeaders();
        // Build full URL with headers baked into the options object
        return new Promise((resolve, reject) => {
          const url = `${BASE_URL}${path}`;
          const req = https.get(url, { headers }, res => {
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
              if (res.statusCode === 429) {
                const err = new Error(`PodcastIndex 429 Too Many Requests — retry in 60s`);
                err.status = 429;
                return reject(err);
              }
              if (res.statusCode !== 200) {
                return reject(new Error(`PodcastIndex HTTP ${res.statusCode}: ${body.substring(0, 200)}`));
              }
              try { resolve(JSON.parse(body)); }
              catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
            });
          });
          req.on('error', reject);
          req.setTimeout(15000, () => req.destroy(new Error('Request timeout')));
        });
      },
      { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 120000 }
    );
  }

  // ── /podcasts/recent — paginated ──────────────────────────────────────────

  /**
   * Fetch all podcasts added/updated since `sinceTimestamp` (Unix seconds).
   * Paginates automatically by stepping `before` parameter backwards.
   *
   * @param {number} sinceTimestamp  Unix timestamp — stop when pubdate <= this
   * @param {object} [opts]
   * @param {number} [opts.maxResults=5000]  Safety ceiling to prevent runaway fetches
   * @returns {Promise<object[]>}  Array of PI feed objects
   */
  async getRecentPodcasts(sinceTimestamp, { maxResults = 5000 } = {}) {
    const feeds = [];
    let page    = 0;
    // cursor starts at "now" and steps backwards using the oldest feed's timestamp
    let cursor  = Math.floor(Date.now() / 1000);

    while (feeds.length < maxResults) {
      // /recent/feeds returns up to max=1000 feeds with newestItemPublishTime < cursor,
      // sorted newest-first. We walk backwards by setting cursor to the oldest item
      // in each batch, stopping once every feed in the batch predates sinceTimestamp.
      const qs   = `?max=${MAX_PER_PAGE}&since=${sinceTimestamp}&before=${cursor}`;
      const data = await this._request(`/recent/feeds${qs}`);
      const batch = data.feeds || [];

      if (batch.length === 0) break; // no more results

      let reachedCutoff = false;
      for (const feed of batch) {
        feeds.push(feed);
        if (feeds.length >= maxResults) { reachedCutoff = true; break; }
      }

      page++;
      process.stdout.write(`\r  [PodcastIndex] Page ${page} — ${feeds.length} feeds collected...`);

      if (reachedCutoff) break;
      if (batch.length < MAX_PER_PAGE) break; // last page (partial batch)

      // Advance cursor to the oldest item in this batch so next page goes further back
      const oldest = batch[batch.length - 1];
      const oldestTs = oldest.newestItemPublishTime || oldest.newestItemPubdate || 0;
      if (oldestTs <= sinceTimestamp || oldestTs === 0) break;
      cursor = oldestTs - 1; // subtract 1 to avoid re-fetching the same boundary item
    }

    process.stdout.write('\n');
    return feeds;
  }

  // ── /podcasts/byitunesid ─────────────────────────────────────────────────

  /**
   * Look up a podcast by iTunes ID and return its PodcastIndex feed ID.
   * Returns null if the podcast is not found or the request fails.
   *
   * @param {string|number} itunesId
   * @returns {Promise<number|null>}
   */
  async getFeedIdByItunesId(itunesId) {
    try {
      const data = await this._request(`/podcasts/byitunesid?id=${itunesId}`);
      return data?.feed?.id ?? null;
    } catch {
      return null;
    }
  }

  // ── /podcasts/byitunesid ─────────────────────────────────────────────────

  /**
   * Fetch full feed metadata by iTunes ID.
   * Returns the `feed` object (includes newestItemPubdate, episodeCount, etc.)
   * Returns null if not found or request fails.
   *
   * @param {string|number} itunesId
   * @returns {Promise<object|null>}
   */
  async getFeedByItunesId(itunesId) {
    try {
      const data = await this._request(`/podcasts/byitunesid?id=${itunesId}`);
      return data.feed || null;
    } catch {
      return null;
    }
  }

  // ── /podcasts/byfeedid ───────────────────────────────────────────────────

  /**
   * Fetch full feed metadata for a single feed ID.
   * Returns the `feed` object from the API (includes episodeCount, ownerEmail, etc.)
   * Returns null if the feed is not found or the request fails.
   *
   * @param {number|string} feedId
   * @returns {Promise<object|null>}
   */
  async getFeedById(feedId) {
    try {
      const data = await this._request(`/podcasts/byfeedid?id=${feedId}`);
      return data.feed || null;
    } catch (err) {
      return null;
    }
  }

  // ── /episodes/byfeedid ────────────────────────────────────────────────────

  /**
   * Fetch up to `max` most recent episodes for a feed.
   * Returns { title, description, duration, datePublished } per episode.
   *
   * @param {number|string} feedId   PodcastIndex feed ID
   * @param {number}        [max=10]
   * @returns {Promise<{ title: string, description: string, duration: number|null, datePublished: number }[]>}
   */
  async getEpisodesByFeedId(feedId, max = 10) {
    const data = await this._request(`/episodes/byfeedid?id=${feedId}&max=${max}`);
    return (data.items || []).map(ep => ({
      title        : ep.title         || '',
      description  : ep.description   || '',
      duration     : ep.duration      ?? null,
      datePublished: ep.datePublished || 0,
    }));
  }

  // ── /episodes/byfeedid?fulltext=true ─────────────────────────────────────

  /**
   * Fetch up to `max` most recent episodes with full-text descriptions and
   * all Podcast 2.0 fields (episodeType, chaptersUrl, transcriptUrl).
   *
   * @param {number|string} feedId   PodcastIndex feed ID
   * @param {number}        [max=10]
   * @returns {Promise<{
   *   title: string, description: string, duration: number|null,
   *   datePublished: number|null, episodeType: string,
   *   chaptersUrl: string|null, transcriptUrl: string|null
   * }[]>}
   */
  async getFullEpisodesByFeedId(feedId, max = 10) {
    const data = await this._request(`/episodes/byfeedid?id=${feedId}&max=${max}&fulltext=true`);
    return (data.items || []).map(ep => ({
      title        : ep.title          || '',
      description  : ep.description    || '',
      duration     : ep.duration       ?? null,
      datePublished: ep.datePublished  || null,
      episodeType  : ep.episodeType    || 'full',
      chaptersUrl  : ep.chaptersUrl    ?? null,
      transcriptUrl: ep.transcriptUrl  ?? null,
    }));
  }
}

module.exports = { PodcastIndexClient };
