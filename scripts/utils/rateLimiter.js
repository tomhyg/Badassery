/**
 * Token Bucket Rate Limiter
 *
 * Shared across all workers. Each call to acquire() consumes one token
 * and waits if the bucket is empty.
 *
 * Usage:
 *   const { TokenBucket, GeminiKeyPool } = require('./utils/rateLimiter');
 *
 *   // Single key, 10 req/sec
 *   const pool = new GeminiKeyPool(['GEMINI_API_KEY'], 10);
 *   const model = await pool.acquire();
 *   await model.generateContent(prompt);
 *
 *   // Multiple keys, 10 req/sec each → 30 req/sec total
 *   const pool = new GeminiKeyPool(['KEY1', 'KEY2', 'KEY3'], 10);
 */

'use strict';

const { GoogleGenerativeAI } = require('@google/generative-ai');

// ----------------------------------------------------------------------------
// TokenBucket
// ----------------------------------------------------------------------------

class TokenBucket {
  /**
   * @param {number} tokensPerSecond  Max requests per second for this bucket
   */
  constructor(tokensPerSecond) {
    if (!tokensPerSecond || tokensPerSecond <= 0) {
      throw new Error(`TokenBucket: tokensPerSecond must be > 0, got ${tokensPerSecond}`);
    }
    this.tokensPerSecond = tokensPerSecond;
    this.tokens = tokensPerSecond; // start full
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds since last refill
    this.tokens = Math.min(
      this.tokensPerSecond,
      this.tokens + elapsed * this.tokensPerSecond
    );
    this.lastRefill = now;
  }

  /**
   * Consume one token, waiting if the bucket is empty.
   * Resolves when a token is available.
   */
  async acquire() {
    const waitMs = Math.ceil(1000 / this.tokensPerSecond);
    while (true) {
      this._refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

// ----------------------------------------------------------------------------
// GeminiKeyPool — round-robin key rotation, each key has its own bucket
// ----------------------------------------------------------------------------

class GeminiKeyPool {
  /**
   * @param {string[]} apiKeys         One or more Gemini API keys
   * @param {number}   ratePerSecPerKey  Token bucket size per key (req/sec)
   *
   * Total effective throughput = apiKeys.length × ratePerSecPerKey req/sec
   */
  constructor(apiKeys, ratePerSecPerKey) {
    if (!apiKeys || apiKeys.length === 0) {
      throw new Error('GeminiKeyPool: at least one API key is required');
    }
    this.entries = apiKeys.map(key => ({
      model: new GoogleGenerativeAI(key).getGenerativeModel({ model: 'gemini-2.5-flash-lite' }),
      bucket: new TokenBucket(ratePerSecPerKey),
    }));
    this.index = 0;
  }

  /**
   * Acquire a rate-limited model handle (round-robin across keys).
   * Waits until the selected key's bucket has a token.
   * @returns {Promise<GenerativeModel>}
   */
  async acquire() {
    const entry = this.entries[this.index % this.entries.length];
    this.index++;
    await entry.bucket.acquire();
    return entry.model;
  }

  get keyCount() {
    return this.entries.length;
  }

  get effectiveRatePerSec() {
    return this.entries.length * this.entries[0].bucket.tokensPerSecond;
  }
}

module.exports = { TokenBucket, GeminiKeyPool };
