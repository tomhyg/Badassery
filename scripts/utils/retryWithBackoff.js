/**
 * Exponential backoff with ±20% jitter + Gemini 429 retryDelay honoring
 *
 * Usage:
 *   const { retryWithBackoff } = require('./utils/retryWithBackoff');
 *
 *   const result = await retryWithBackoff(
 *     () => model.generateContent(prompt),
 *     { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 120000 }
 *   );
 *
 * Retry delays:
 *   attempt 1 fails → wait max(api_suggested, 1000ms)  × jitter
 *   attempt 2 fails → wait max(api_suggested, 2000ms)  × jitter
 *   attempt 3 fails → wait max(api_suggested, 4000ms)  × jitter  (capped at maxDelayMs)
 *
 * For Gemini 429s, the API suggests delays like "retry in 44s" — this is
 * extracted from the error message and used as a floor for the backoff.
 */

'use strict';

/**
 * Extract the suggested retry delay (in ms) from a Gemini 429 error message.
 * Returns 0 if no hint is found.
 *
 * Handles formats seen in the wild:
 *   "Please retry in 44 seconds"
 *   "retry after 44s"
 *   "retryDelay":"44s"
 *   "seconds":"44"  (inside retryInfo JSON)
 */
function parseRetryDelayMs(err) {
  const text = (err && (err.message || err.toString())) || '';

  // "44s" or "44 seconds" or "44 second"
  const matchS = text.match(/retry[^0-9]*?(\d+)\s*s(?:ec(?:ond)?s?)?/i);
  if (matchS) return parseInt(matchS[1], 10) * 1000;

  // "44000ms" or "44000 ms"
  const matchMs = text.match(/retry[^0-9]*?(\d+)\s*ms/i);
  if (matchMs) return parseInt(matchMs[1], 10);

  // JSON snippet: "seconds":"44" or "seconds":44
  const matchJson = text.match(/"seconds"\s*:\s*"?(\d+)"?/);
  if (matchJson) return parseInt(matchJson[1], 10) * 1000;

  return 0;
}

/**
 * @param {() => Promise<T>}   fn           Async function to call
 * @param {object}             [opts]
 * @param {number}             [opts.maxRetries=3]
 * @param {number}             [opts.baseDelayMs=1000]
 * @param {number}             [opts.maxDelayMs=120000]
 * @param {(err, attempt, delayMs) => void} [opts.onRetry]  Called before each retry
 * @returns {Promise<T>}
 * @throws {Error}  Rethrows the last error after all retries are exhausted
 */
async function retryWithBackoff(fn, opts = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 120000,
    onRetry = null,
  } = opts;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries) break;

      // Exponential base delay, capped at maxDelayMs
      const exponentialMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));

      // Honor API-suggested retry delay (e.g. Gemini 429 "retry in 44s") as a floor
      const suggestedMs = parseRetryDelayMs(err);
      const floorMs = Math.max(exponentialMs, suggestedMs);

      // ±20% jitter: multiply by a random factor in [0.8, 1.2]
      const jitterFactor = 0.8 + Math.random() * 0.4;
      const delayMs = Math.min(maxDelayMs, Math.round(floorMs * jitterFactor));

      if (onRetry) onRetry(err, attempt, delayMs);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

module.exports = { retryWithBackoff };
