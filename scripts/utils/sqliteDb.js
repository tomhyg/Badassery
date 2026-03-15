/**
 * Shared SQLite database utilities for PodcastIndex feed data.
 *
 * Exports:
 *   ensureDatabase()  — download + extract the DB if missing or >7 days old
 *   DB_PATH           — absolute path to data/podcastindex_feeds.db
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const { execSync } = require('child_process');

const DATA_DIR     = path.join(__dirname, '../../data');
const TGZ_PATH     = path.join(DATA_DIR, 'podcastindex_feeds.db.tgz');
const DB_PATH      = path.join(DATA_DIR, 'podcastindex_feeds.db');
const DOWNLOAD_URL = 'https://public.podcastindex.org/podcastindex_feeds.db.tgz';
const MAX_AGE_DAYS = 7;

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || 'ℹ️ '}  ${msg}`);
}

function dbAge() {
  try {
    const stat = fs.statSync(DB_PATH);
    return (Date.now() - stat.mtimeMs) / (1000 * 86400); // days
  } catch {
    return Infinity;
  }
}

function downloadWithProgress(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    let downloaded = 0;
    let total = 0;
    let lastPct = -1;

    const request = (reqUrl) => {
      https.get(reqUrl, { headers: { 'User-Agent': 'BadasseryPR/1.0' } }, res => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          return request(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        total = parseInt(res.headers['content-length'] || '0', 10);
        const totalMB = total ? (total / 1024 / 1024).toFixed(0) : '?';

        res.on('data', chunk => {
          downloaded += chunk.length;
          file.write(chunk);

          if (total) {
            const pct = Math.floor((downloaded / total) * 100);
            const dlMB = (downloaded / 1024 / 1024).toFixed(1);
            if (pct !== lastPct && pct % 5 === 0) {
              process.stdout.write(`\r  ↓ ${pct}%  ${dlMB} / ${totalMB} MB`);
              lastPct = pct;
            }
          } else {
            const dlMB = (downloaded / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r  ↓ ${dlMB} MB downloaded...`);
          }
        });

        res.on('end', () => {
          process.stdout.write('\n');
          file.end(() => resolve()); // wait for flush before resolving
        });

        res.on('error', reject);
      }).on('error', reject);
    };

    request(url);
  });
}

async function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    log('Created data/ directory.');
  }

  const ageDays = dbAge();
  if (ageDays < MAX_AGE_DAYS) {
    log(`Database exists and is ${ageDays.toFixed(1)} days old (< ${MAX_AGE_DAYS}d) — skipping download.`);
    return;
  }

  log(`Downloading PodcastIndex SQLite dump (~1.7 GB compressed)...`, 'PHASE');
  log(`URL: ${DOWNLOAD_URL}`);

  await downloadWithProgress(DOWNLOAD_URL, TGZ_PATH);
  log(`Download complete. Extracting...`, 'SUCCESS');

  execSync(`tar xzf "${TGZ_PATH}" -C "${DATA_DIR}"`, { stdio: 'inherit' });
  log(`Extracted to ${DB_PATH}`, 'SUCCESS');

  const sizeMB = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(0);
  log(`Database ready: ${sizeMB} MB`);
}

module.exports = { ensureDatabase, DB_PATH };
