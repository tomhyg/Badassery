'use strict';

/**
 * parseDuration.js — Parse podcast episode duration into total seconds.
 *
 * Handles 3 formats encountered in rss_ep*_duration fields:
 *   "2995"        → raw seconds as string     → 2995
 *   "23:46"       → MM:SS                     → 23*60 + 46 = 1426
 *   "00:43:29"    → HH:MM:SS                  → 43*60 + 29 = 2609
 *
 * Returns null if input is null, empty, or unparseable.
 */
function parseDuration(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === '') return null;

  // HH:MM:SS or H:MM:SS
  const hms = s.match(/^(\d+):(\d{1,2}):(\d{1,2})$/);
  if (hms) {
    return parseInt(hms[1], 10) * 3600 + parseInt(hms[2], 10) * 60 + parseInt(hms[3], 10);
  }

  // MM:SS
  const ms = s.match(/^(\d+):(\d{1,2})$/);
  if (ms) {
    return parseInt(ms[1], 10) * 60 + parseInt(ms[2], 10);
  }

  // Raw seconds (integer string)
  const raw_secs = s.match(/^\d+$/);
  if (raw_secs) {
    return parseInt(s, 10);
  }

  return null;
}

module.exports = { parseDuration };

// ── Inline tests (run with: node scripts/utils/parseDuration.js) ─────────────
if (require.main === module) {
  console.assert(parseDuration('2995') === 2995,         'raw seconds');
  console.assert(parseDuration('23:46') === 1426,        'MM:SS');
  console.assert(parseDuration('00:43:29') === 2609,     'HH:MM:SS with leading zeros');
  console.assert(parseDuration('1:05:00') === 3900,      'H:MM:SS no leading zero');
  console.assert(parseDuration('') === null,             'empty string');
  console.assert(parseDuration(null) === null,           'null');
  console.assert(parseDuration(undefined) === null,      'undefined');
  console.assert(parseDuration('0') === 0,               'zero seconds');
  console.assert(parseDuration('59:59') === 3599,        'MM:SS max');
  console.assert(parseDuration('garbage') === null,      'unparseable');
  console.log('parseDuration: all tests passed');
}
