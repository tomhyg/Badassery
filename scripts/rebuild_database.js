'use strict';

/**
 * rebuild_database.js — Full database rebuild: SQLite → episodes → guest filter
 *
 * Phases covered:
 *   1   SQLite candidate discovery
 *   2   Apple + Spotify chart cache enrichment
 *   3   PodcastIndex API: fetch episodes + compute derived stats
 *   3b  Gemini 2.5 Flash Lite: guest-friendly filter
 *
 * Output: checkpoint JSON files in data/checkpoints/rebuild_YYYY-MM-DD_batch_NNN.json
 *
 * CLI flags:
 *   --dry-run          default — run all phases, save checkpoints, no Firestore writes
 *   --confirm          enable Firestore writes (Phase 7, future script)
 *   --limit=N          process only N podcasts from SQLite (for testing)
 *   --skip-phase1      load from existing checkpoints instead of querying SQLite
 *   --skip-charts      skip Phase 2 chart enrichment
 *   --batch-size=N     checkpoint every N podcasts (default 500)
 *
 * Usage:
 *   node scripts/rebuild_database.js --limit=20
 *   node scripts/rebuild_database.js
 *   node scripts/rebuild_database.js --skip-phase1
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

// Firebase admin (only initialised when --confirm is passed)
let admin = null;
let db    = null;
function initFirebase() {
  if (db) return db;
  admin = require('firebase-admin');
  const serviceAccount = require('../serviceAccountKey.json');
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
  return db;
}

const { DB_PATH }            = require('./utils/sqliteDb');
const { PodcastIndexClient } = require('./utils/podcastIndexClient');
const { initKeyPool, scorePodcastFull }                       = require('./utils/geminiScorer');
const { prepareBatchNorms, calculateBadasseryScore, applyPercentiles } = require('./utils/badasseryFormula');
const { generateReport } = require('./utils/reportGenerator');
const { retryWithBackoff }   = require('./utils/retryWithBackoff');
const { enrichPodcast }      = require('./utils/enrichPodcast');
const { closeBrowser }       = require('./utils/browserManager');

// ── CLI ────────────────────────────────────────────────────────────────────────

const argv        = process.argv.slice(2);
const DRY_RUN     = !argv.includes('--confirm');
const SKIP_PHASE1 = argv.includes('--skip-phase1');
const SKIP_CHARTS = argv.includes('--skip-charts');
const VERBOSE     = argv.includes('--verbose');
const REPORT        = argv.includes('--report');
const NO_DEDUP      = argv.includes('--no-dedup');
const NO_CHECKPOINT = argv.includes('--no-checkpoint');
const RANDOM        = argv.includes('--random');
const limitArg    = argv.find(a => a.startsWith('--limit='));
const batchArg    = argv.find(a => a.startsWith('--batch-size='));
const LIMIT       = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const BATCH_SIZE  = batchArg ? parseInt(batchArg.split('=')[1], 10) : 500;

// ── Paths ──────────────────────────────────────────────────────────────────────

const DATA_DIR       = path.join(__dirname, '../data');
const CHECKPOINT_DIR = path.join(DATA_DIR, 'checkpoints');
const APPLE_CACHE    = path.join(DATA_DIR, 'apple_charts_cache.json');
const SPOTIFY_CACHE  = path.join(DATA_DIR, 'spotify_charts_cache.json');
const REPORTS_DIR    = path.join(__dirname, '../reports');

// Collects stats from each phase for the --report output
const runStats = {
  startTime: Date.now(),
  p1: { totalCandidates: 0 },
  p2: { appleCount: 0, spotifyCount: 0, chartHits: 0 },
};

// ── Clients ────────────────────────────────────────────────────────────────────

const piClient = new PodcastIndexClient({ ratePerSec: 4 });
let   keyPool  = null; // lazy-init in phase3b

// ── Utilities ──────────────────────────────────────────────────────────────────

function log(msg, level = 'INFO') {
  const icons = { INFO: 'ℹ️ ', SUCCESS: '✅', ERROR: '❌', WARN: '⚠️ ', PHASE: '🔷' };
  console.log(`[${new Date().toLocaleTimeString()}] ${icons[level] || '  '}  ${msg}`);
}

function verboseLog(title, obj) {
  if (!VERBOSE) return;
  console.log(`\n  ── [VERBOSE] ${title} ──`);
  console.log(JSON.stringify(obj, null, 4).split('\n').map(l => '  ' + l).join('\n'));
  console.log('');
}

function verbosePhase(label, feeds) {
  if (!VERBOSE) return;
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  VERBOSE — ${label}`);
  console.log('═'.repeat(60));
  for (const feed of feeds) {
    verboseLog(feed.title || feed.feedId, feed);
  }
}

function stripHtml(html) {
  return (html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeTitle(title) {
  return (title || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function pct(n, d) {
  return d > 0 ? Math.round(n / d * 100) : 0;
}

/**
 * Pull-based concurrent runner — workers share a counter.
 * All items are processed; order of completion is not guaranteed.
 */
async function runConcurrent(items, workerFn, concurrency) {
  if (items.length === 0) return;
  let idx = 0;
  const worker = async () => {
    while (idx < items.length) {
      const item = items[idx++];
      await workerFn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ── Phase 1 — SQLite discovery ─────────────────────────────────────────────────

function phase1_discoverFromSQLite() {
  log('Phase 1 — SQLite candidate discovery', 'PHASE');

  const sqlite = new Database(DB_PATH, { readonly: true });

  const rows = sqlite.prepare(`
    SELECT
      id              AS feedId,
      url             AS rssUrl,
      title,
      description,
      language,
      link            AS homepageUrl,
      itunesId,
      itunesAuthor    AS author,
      itunesOwnerName AS ownerName,
      imageUrl,
      episodeCount,
      popularityScore,
      updateFrequency,
      oldestItemPubdate,
      newestItemPubdate,
      lastUpdate,
      host            AS hostingPlatform,
      podcastGuid,
      category1, category2, category3, category4,
      category5, category6, category7, category8,
      category9, category10,
      newestEnclosureDuration AS latestEpisodeDuration,
      dead,
      lastHttpStatus
    FROM podcasts
    WHERE
      language LIKE 'en%'
      AND episodeCount >= 50
      AND newestItemPubdate > (strftime('%s', 'now') - 60 * 24 * 3600)
      AND itunesId IS NOT NULL
      AND itunesId != ''
      AND itunesId != '0'
      AND dead = 0
      AND lastHttpStatus = 200
    ORDER BY ${RANDOM ? 'RANDOM()' : 'popularityScore DESC'}
  `).all();

  sqlite.close();

  const total = rows.length;
  const feeds = rows
    .slice(0, LIMIT === Infinity ? undefined : LIMIT)
    .map(row => ({ ...row, itunesId: String(row.itunesId) }));

  runStats.p1.totalCandidates = total;

  log(
    `Found ${total.toLocaleString()} candidates` +
    (LIMIT !== Infinity ? `, using first ${feeds.length}` : ''),
    'SUCCESS'
  );

  return feeds;
}

// ── Phase 2 — Chart caches ─────────────────────────────────────────────────────

function phase2_loadChartsCache() {
  log('Phase 2 — Loading chart caches', 'PHASE');

  // Apple: { scrapedAt, charts: { [itunesId]: { bestRank, bestGenre, title, genres } } }
  const appleMap = new Map();
  if (fs.existsSync(APPLE_CACHE)) {
    const { charts = {} } = JSON.parse(fs.readFileSync(APPLE_CACHE, 'utf8'));
    for (const [id, entry] of Object.entries(charts)) {
      appleMap.set(String(id), {
        rank : entry.bestRank  ?? null,
        genre: entry.bestGenre ?? null,
      });
    }
    log(`Apple chart cache: ${appleMap.size.toLocaleString()} entries (keyed by itunesId)`);
  } else {
    log('Apple chart cache not found — skipping', 'WARN');
  }

  // Spotify: { scrapedAt, charts: { [spotifyId]: { title, bestRank, bestGenre, ... } } }
  const spotifyMap = new Map(); // normalizedTitle → { rank, genre }
  if (fs.existsSync(SPOTIFY_CACHE)) {
    const { charts = {} } = JSON.parse(fs.readFileSync(SPOTIFY_CACHE, 'utf8'));
    for (const entry of Object.values(charts)) {
      if (entry.title) {
        spotifyMap.set(normalizeTitle(entry.title), {
          rank : entry.bestRank  ?? null,
          genre: entry.bestGenre ?? null,
        });
      }
    }
    log(`Spotify chart cache: ${spotifyMap.size.toLocaleString()} entries (keyed by normalized title)`);
  } else {
    log('Spotify chart cache not found — skipping', 'WARN');
  }

  runStats.p2.appleCount   = appleMap.size;
  runStats.p2.spotifyCount = spotifyMap.size;
  return { appleMap, spotifyMap };
}

function enrichWithCharts(feed, appleMap, spotifyMap) {
  const a = appleMap.get(String(feed.itunesId));
  const s = spotifyMap.get(normalizeTitle(feed.title));
  feed.apple_chart_rank    = a?.rank   ?? null;
  feed.apple_chart_genre   = a?.genre  ?? null;
  feed.spotify_chart_rank  = s?.rank   ?? null;
  feed.spotify_chart_genre = s?.genre  ?? null;
}

// ── Phase 3 — Episode fetch ────────────────────────────────────────────────────

function computeEpisodeStats(feed) {
  const { episodes } = feed;

  // Average episode length in minutes
  const durations = episodes.map(e => e.duration).filter(d => d != null && d > 0);
  feed.avg_episode_length_min = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60)
    : null;

  // Publishing consistency 0–100 (100 = perfectly regular cadence)
  const dates = episodes.map(e => e.datePublished).filter(Boolean).sort((a, b) => b - a);
  if (dates.length >= 3) {
    const intervals = dates.slice(0, -1).map((d, i) => d - dates[i + 1]);
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    feed._publish_intervals_days = intervals.map(i => Math.round(i / 86400));
    if (avg > 0) {
      const variance = intervals.map(v => (v - avg) ** 2).reduce((a, b) => a + b, 0) / intervals.length;
      feed.publish_consistency = Math.max(0, Math.round((1 - Math.sqrt(variance) / avg) * 100));
    } else {
      feed.publish_consistency = 0; // all same date → data anomaly
    }
  } else {
    feed.publish_consistency = null;
  }

  feed.has_chapters    = episodes.some(e => e.chaptersUrl    != null);
  feed.has_transcripts = episodes.some(e => e.transcriptUrl  != null);
}

async function phase3_fetchEpisodes(batch) {
  log(`Phase 3 — Fetching episodes for ${batch.length} feeds (3 workers @ 2 req/s)`, 'PHASE');

  const stats = { success: 0, noEps: 0, error: 0 };
  let done = 0;

  await runConcurrent(batch, async feed => {
    try {
      const rawEps = await piClient.getFullEpisodesByFeedId(feed.feedId, 10);

      feed.episodes = rawEps
        .map(ep => ({
          title        : ep.title,
          description  : stripHtml(ep.description),
          duration     : ep.duration,
          datePublished: ep.datePublished || null,
          episodeType  : ep.episodeType,
          chaptersUrl  : ep.chaptersUrl,
          transcriptUrl: ep.transcriptUrl,
        }))
        .filter(ep => ep.episodeType === 'full')
        .slice(0, 10);

      computeEpisodeStats(feed);

      if (feed.episodes.length === 0) {
        feed._drop = 'no_full_episodes';
        stats.noEps++;
      } else {
        stats.success++;
      }
    } catch (err) {
      feed.episodes               = [];
      feed.avg_episode_length_min = null;
      feed.publish_consistency    = null;
      feed.has_chapters           = false;
      feed.has_transcripts        = false;
      feed._drop                  = 'episode_fetch_error';
      stats.error++;
    }

    done++;
    if (done % 10 === 0 || done === batch.length) {
      process.stdout.write(
        `\r  [P3] ${done}/${batch.length} — ✓ ${stats.success}  no-eps: ${stats.noEps}  err: ${stats.error}   `
      );
    }
  }, 3);

  process.stdout.write('\n');
  log(
    `Phase 3 done — success: ${stats.success}, no-eps: ${stats.noEps}, errors: ${stats.error}`,
    'SUCCESS'
  );
}

// ── Phase 3b — Gemini guest filter ────────────────────────────────────────────

function buildGuestPrompt(feed) {
  const episodeContext = feed.episodes.map((ep, i) => {
    let s = `Episode ${i + 1}: "${ep.title}"`;
    if (ep.description) s += `\nAbout: ${ep.description}`;
    return s;
  }).join('\n\n');

  const cats = [feed.category1, feed.category2, feed.category3]
    .filter(Boolean).join(', ');

  return `You are analyzing a podcast to determine if it regularly features guests.

PODCAST:
Title: ${feed.title}
Author: ${feed.author || ''}
Description: ${feed.description || ''}
Episode count: ${feed.episodeCount}
Average episode length: ${feed.avg_episode_length_min ?? 'unknown'} minutes
Categories: ${cats || 'none'}

LAST ${feed.episodes.length} EPISODES:
${episodeContext}

A podcast is guest-friendly if it regularly invites external guests (people who are NOT the regular host) to be interviewed or have discussions.
NOT guest-friendly: solo commentary, solo educational, sermons, news reading, two permanent co-hosts only with no external guests.

GUEST ROLE CLASSIFICATION RULES:
- Use "YouTuber" for anyone described as a YouTube creator, having a YouTube channel, or known primarily for their YouTube presence (e.g., "creator of the YouTube channel X", "YouTuber", "video creator", "has 1.5 billion YouTube views")
- Use "journalist" for writers, reporters, editors, newspaper/magazine critics, newsletter authors
- Use "CEO" / "founder" only when explicitly stated or clearly implied by context
- Use "author" for published book authors
- Use "academic" for professors, researchers, PhD holders, scientists
- Use "entrepreneur" for startup founders, business builders (when founder not explicitly stated)
- Use "other" ONLY as a last resort when truly no other category fits
- When in doubt between "other" and a specific role, always prefer the specific role

Return ONLY valid JSON, no explanation, no markdown:
{
  "guest_friendly": true or false,
  "guest_ratio_last10": float between 0.0 and 1.0,
  "guest_authority": "none" or "low" or "medium" or "high" or "very_high",
  "confidence": "low" or "medium" or "high",
  "recent_guests": [
    {
      "episode_index": <1-10>,
      "guest_name": "<real name if mentioned in title/description, else null>",
      "guest_role": "<CEO|founder|author|journalist|academic|YouTuber|artist|politician|investor|doctor|activist|entrepreneur|other>",
      "guest_industry": "<tech|business|media|politics|music|health|science|finance|education|entertainment|sports|other>"
    }
  ],
  "guest_types": ["<deduplicated list of guest_role values seen>"],
  "guest_industries": ["<deduplicated list of guest_industry values seen>"],
  "typical_guest_profile": "<1 sentence: who typically appears and what they talk about, or null if not guest-friendly>"
}

Rules:
- guest_friendly = true only if guest_ratio_last10 >= 0.3
- guest_authority = "none" if guest_friendly = false
- confidence = "low" if episode titles are too short or ambiguous to judge
- recent_guests: only include episodes that clearly feature an external guest; omit episodes without guests
- For guest_name: use the name as written in the title/description; null if unnamed
- If no guests at all: recent_guests = [], guest_types = [], guest_industries = [], typical_guest_profile = null`;
}

function cleanGeminiJson(raw) {
  let text = (raw || '').trim();
  // Strip markdown fences
  text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  // Extract JSON object
  const start = text.indexOf('{');
  if (start > 0) text = text.substring(start);
  const end = text.lastIndexOf('}');
  if (end >= 0) text = text.substring(0, end + 1);
  // Remove JS comments
  text = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Escape control chars safely
  text = text.replace(/\\n/g, '__NL__').replace(/\\"/g, '__QT__').replace(/\\\\/g, '__BS__');
  text = text.replace(/[\x00-\x1F\x7F]/g, ' ');
  text = text.replace(/__NL__/g, '\\n').replace(/__QT__/g, '\\"').replace(/__BS__/g, '\\\\');
  // Remove trailing commas
  text = text.replace(/,\s*([}\]])/g, '$1');
  text = text.replace(/\s+/g, ' ');
  return text;
}

async function phase3b_geminiGuestFilter(batch) {
  const active = batch.filter(f => !f._drop && f.episodes && f.episodes.length > 0);

  log(`Phase 3b — Gemini guest filter for ${active.length} feeds (5 workers @ 10 req/s)`, 'PHASE');

  if (!keyPool) keyPool = initKeyPool({ ratePerSecond: 10 });

  const stats = { guest: 0, notGuest: 0, error: 0 };
  let done = 0;

  await runConcurrent(active, async feed => {
    const _feedStart = Date.now();
    try {
      feed._p3b_prompt = buildGuestPrompt(feed);
      let text = '';

      await retryWithBackoff(
        async () => {
          const model  = await keyPool.acquire();
          const result = await model.generateContent(feed._p3b_prompt);
          text         = cleanGeminiJson(result.response.text());
          feed._p3b_raw_response = text;
          JSON.parse(text); // throws → triggers retry
        },
        {
          maxRetries : 3,
          baseDelayMs: 1000,
          maxDelayMs : 30000,
          onRetry    : (err, attempt) => {
            process.stdout.write(
              `\n  [P3b] retry ${attempt}/3 for "${(feed.title || '').slice(0, 30)}": ${err.message.slice(0, 60)}\n`
            );
          },
        }
      );

      const parsed = JSON.parse(text);
      feed.gemini_guest_friendly        = parsed.guest_friendly === true;
      feed.gemini_guest_ratio           = typeof parsed.guest_ratio_last10 === 'number'
        ? Math.round(parsed.guest_ratio_last10 * 100) / 100 : null;
      feed.gemini_guest_authority       = parsed.guest_authority  ?? null;
      feed.gemini_guest_confidence      = parsed.confidence       ?? null;
      feed.gemini_recent_guests         = Array.isArray(parsed.recent_guests)    ? parsed.recent_guests    : [];
      feed.gemini_guest_types           = Array.isArray(parsed.guest_types)      ? parsed.guest_types      : [];
      feed.gemini_guest_industries      = Array.isArray(parsed.guest_industries)  ? parsed.guest_industries : [];
      feed.gemini_typical_guest_profile = typeof parsed.typical_guest_profile === 'string' ? parsed.typical_guest_profile : null;

      // Guard: enforce ratio threshold even if Gemini contradicts itself
      if (feed.gemini_guest_ratio !== null && feed.gemini_guest_ratio < 0.3) {
        feed.gemini_guest_friendly = false;
        feed._drop = 'guest_ratio_below_threshold';
      }

      if (!feed.gemini_guest_friendly) {
        feed._drop = 'not_guest_friendly';
        stats.notGuest++;
      } else {
        stats.guest++;
      }
    } catch (err) {
      // Gemini failure — keep the feed, mark fields null
      feed.gemini_guest_friendly        = null;
      feed.gemini_guest_ratio           = null;
      feed.gemini_guest_authority       = null;
      feed.gemini_guest_confidence      = null;
      feed.gemini_recent_guests         = [];
      feed.gemini_guest_types           = [];
      feed.gemini_guest_industries      = [];
      feed.gemini_typical_guest_profile = null;
      stats.error++;
    } finally {
      feed._p3b_latency_ms = Date.now() - _feedStart;
    }

    done++;
    if (done % 5 === 0 || done === active.length) {
      process.stdout.write(
        `\r  [P3b] ${done}/${active.length} — guest: ${stats.guest}  not-guest: ${stats.notGuest}  err: ${stats.error}   `
      );
    }
  }, 5);

  process.stdout.write('\n');
  log(
    `Phase 3b done — guest: ${stats.guest}, not_guest: ${stats.notGuest}, errors: ${stats.error}`,
    'SUCCESS'
  );
}

// ── Checkpoint system ──────────────────────────────────────────────────────────

function ensureCheckpointDir() {
  if (!fs.existsSync(CHECKPOINT_DIR)) fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
}

function existingCheckpointFiles() {
  ensureCheckpointDir();
  return fs.readdirSync(CHECKPOINT_DIR)
    .filter(f => f.match(/^rebuild_.*\.json$/))
    .sort();
}

function saveCheckpoint(batch, batchNumber) {
  ensureCheckpointDir();

  const passed = batch.filter(f => !f._drop);
  const date   = new Date().toISOString().split('T')[0];
  const fname  = `rebuild_${date}_batch_${String(batchNumber).padStart(3, '0')}.json`;
  const fpath  = path.join(CHECKPOINT_DIR, fname);

  fs.writeFileSync(fpath, JSON.stringify({
    createdAt     : new Date().toISOString(),
    batchNumber,
    totalProcessed: batch.length,
    passed        : passed.length,
    feeds         : passed,
  }, null, 2), 'utf8');

  log(`Checkpoint saved: ${fname} — ${passed.length}/${batch.length} passed`, 'SUCCESS');
  return fpath;
}

function loadExistingCheckpoints() {
  const files       = existingCheckpointFiles();
  const allFeeds    = [];
  const processedIds = new Set();

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CHECKPOINT_DIR, file), 'utf8'));
      for (const feed of (data.feeds || [])) {
        const id = String(feed.itunesId);
        if (!processedIds.has(id)) {
          allFeeds.push(feed);
          processedIds.add(id);
        }
      }
      log(`Loaded: ${file} — ${data.feeds?.length ?? 0} feeds`);
    } catch (err) {
      log(`Failed to load ${file}: ${err.message}`, 'WARN');
    }
  }

  if (files.length > 0) {
    log(`Checkpoints: ${allFeeds.length} total feeds, ${processedIds.size} unique itunesIds`);
  }

  return { feeds: allFeeds, processedIds };
}

// ── Phase 4 — Full enrichment ─────────────────────────────────────────────────

async function phase4_enrichPodcasts(feeds) {
  log(`Phase 4 — Enriching ${feeds.length} feeds (20 concurrent workers)`, 'PHASE');

  const stats = { done: 0, email: 0, apple: 0, spotify: 0, youtube: 0, instagram: 0, twitter: 0 };

  await runConcurrent(feeds, async feed => {
    await enrichPodcast(feed);

    stats.done++;
    if (feed.rss_owner_email)   stats.email++;
    if (feed.apple_rating)      stats.apple++;
    if (feed.spotify_rating)    stats.spotify++;
    if (feed.yt_subscribers)    stats.youtube++;
    if (feed.instagram_followers) stats.instagram++;
    if (feed.twitter_followers) stats.twitter++;

    if (stats.done % 5 === 0 || stats.done === feeds.length) {
      process.stdout.write(
        `\r  [P4] ${stats.done}/${feeds.length} — email:${stats.email} apple:${stats.apple} spotify:${stats.spotify} yt:${stats.youtube} ig:${stats.instagram} tw:${stats.twitter}   `
      );
    }
  }, 20);

  process.stdout.write('\n');
  log(`Phase 4 done — ${stats.done} enriched`, 'SUCCESS');
}

// ── Phase 5 — Gemini full scoring ─────────────────────────────────────────────

async function phase5_scoreFeeds(feeds) {
  if (!keyPool) keyPool = initKeyPool({ ratePerSecond: 10 });

  log(`Phase 5 — Gemini scoring ${feeds.length} feeds (5 workers)`, 'PHASE');

  const stats = { done: 0, ok: 0, failed: 0 };
  const startMs = Date.now();

  await runConcurrent(feeds, async feed => {
    await scorePodcastFull(feed);

    stats.done++;
    if (feed.aiCategorizationStatus === 'completed') stats.ok++;
    else {
      stats.failed++;
      process.stdout.write(
        `\n  [P5] ❌ failed "${(feed.title || '').slice(0, 40)}": ${(feed.aiCategorizationError || '').slice(0, 60)}\n`
      );
    }

    if (stats.done % 5 === 0 || stats.done === feeds.length) {
      process.stdout.write(
        `\r  [P5] ${stats.done}/${feeds.length} — ok:${stats.ok} failed:${stats.failed}   `
      );
    }
  }, 5);

  const elapsed = Date.now() - startMs;
  const avgMs   = feeds.length > 0 ? Math.round(elapsed / feeds.length) : 0;
  process.stdout.write('\n');
  log(`Phase 5 done — ${stats.ok} scored, ${stats.failed} failed (avg ${avgMs}ms/podcast)`, 'SUCCESS');
}

// ── Summary table ──────────────────────────────────────────────────────────────

function printResults(allFeeds) {
  const pad  = (s, n) => String(s ?? '—').slice(0, n).padEnd(n);
  const fmtN = n => n != null ? n.toLocaleString() : '—';
  const f2   = n => n != null ? n.toFixed(2) : '—';

  const enriched = allFeeds.filter(f => !f._drop);
  const scored   = enriched.filter(f => f.ai_badassery_score != null);
  const p5ok     = enriched.filter(f => f.aiCategorizationStatus === 'completed').length;
  const p5failed = enriched.filter(f => f.aiCategorizationStatus === 'failed').length;

  // ── Phase 6 table ──────────────────────────────────────────────────────────
  const C = {
    title  : 28,
    score  : 7,
    guest  : 7,
    aud    : 7,
    auth   : 7,
    act    : 7,
    eng    : 7,
    con    : 7,
    gPct   : 7,
    missing: 40,
  };
  const W = Object.values(C).reduce((a, b) => a + b + 1, 0);
  const D = '─'.repeat(W);

  console.log('\n' + '='.repeat(W));
  console.log('  REBUILD — Phase 6 Badassery Scores');
  console.log('='.repeat(W));
  console.log(
    pad('title',   C.title)  + ' ' +
    pad('score',   C.score)  + ' ' +
    pad('guest',   C.guest)  + ' ' +
    pad('aud',     C.aud)    + ' ' +
    pad('auth',    C.auth)   + ' ' +
    pad('actv',    C.act)    + ' ' +
    pad('eng',     C.eng)    + ' ' +
    pad('con',     C.con)    + ' ' +
    pad('g%ile',   C.gPct)   + ' ' +
    pad('missing_signals', C.missing)
  );
  console.log(D);

  for (const feed of enriched) {
    if (feed.ai_badassery_score == null) {
      console.log(pad(feed.title, C.title) + '  ❌ not scored');
      continue;
    }
    console.log(
      pad(feed.title,                        C.title)  + ' ' +
      pad(f2(feed.ai_badassery_score),        C.score)  + ' ' +
      pad(f2(feed.score_guest_compatibility), C.guest)  + ' ' +
      pad(f2(feed.score_audience_power),      C.aud)    + ' ' +
      pad(f2(feed.score_podcast_authority),   C.auth)   + ' ' +
      pad(f2(feed.score_activity_consistency),C.act)    + ' ' +
      pad(f2(feed.score_engagement),          C.eng)    + ' ' +
      pad(f2(feed.score_contactability),      C.con)    + ' ' +
      pad(feed.ai_global_percentile,          C.gPct)   + ' ' +
      pad((feed.score_missing_signals || []).join(', '), C.missing)
    );
  }
  console.log(D);

  // ── Score distribution ─────────────────────────────────────────────────────
  if (scored.length > 0) {
    const vals = scored.map(f => f.ai_badassery_score).sort((a, b) => a - b);
    const min  = vals[0];
    const max  = vals[vals.length - 1];
    const avg  = round2(vals.reduce((a, b) => a + b, 0) / vals.length);
    const mid  = vals.length % 2 === 0
      ? (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2
      : vals[Math.floor(vals.length / 2)];
    const median = round2(mid);

    console.log('');
    console.log('  SCORE DISTRIBUTION');
    console.log('  ' + '─'.repeat(40));
    console.log(`  n=${scored.length}  min=${min}  max=${max}  avg=${avg}  median=${median}`);

    // Missing signal frequency
    const missingCount = {};
    for (const feed of scored) {
      for (const sig of (feed.score_missing_signals || [])) {
        missingCount[sig] = (missingCount[sig] || 0) + 1;
      }
    }
    if (Object.keys(missingCount).length > 0) {
      console.log('');
      console.log('  MISSING SIGNALS (% of scored podcasts)');
      console.log('  ' + '─'.repeat(40));
      Object.entries(missingCount)
        .sort((a, b) => b[1] - a[1])
        .forEach(([sig, cnt]) => {
          console.log(`  ${String(cnt).padStart(3)}/${scored.length} (${pct(cnt, scored.length)}%)  ${sig}`);
        });
    }

    // Coherence check: Mega/Large audience + high authority should score > 75
    const highAudience = scored.filter(f =>
      f.ai_audience_size === 'Mega' || f.ai_audience_size === 'Large'
    );
    if (highAudience.length > 0) {
      console.log('');
      console.log('  COHERENCE CHECK (Mega/Large audience → expect score >75)');
      console.log('  ' + '─'.repeat(40));
      for (const f of highAudience) {
        const flag = f.ai_badassery_score >= 60 ? '✅' : '⚠️ ';
        console.log(`  ${flag} ${f.ai_badassery_score.toFixed(2).padStart(5)}  ${f.ai_audience_size.padEnd(7)}  ${f.title}`);
      }
    }
  }

  // ── Pipeline summary ───────────────────────────────────────────────────────
  const total       = allFeeds.length;
  const p3ok        = allFeeds.filter(f => f.episodes?.length > 0).length;
  const p3bPassed   = allFeeds.filter(f => f.gemini_guest_friendly === true).length;
  const p4n         = enriched.length;
  const emailFound  = enriched.filter(f => f.rss_owner_email).length;
  const igFound     = enriched.filter(f => f.website_instagram).length;
  const appleFound  = enriched.filter(f => f.apple_rating != null).length;
  const spotifyUrl  = enriched.filter(f => f.website_spotify).length;
  const spotRtFound = enriched.filter(f => f.spotify_rating != null).length;
  const ytUrl       = enriched.filter(f => f.website_youtube).length;
  const ytFound     = enriched.filter(f => f.yt_subscribers != null).length;
  const igFound2    = enriched.filter(f => f.instagram_followers != null).length;

  console.log('');
  console.log('  PIPELINE SUMMARY');
  console.log('  ' + '─'.repeat(56));
  console.log(`  Phase 1  — SQLite candidates           : ${total}`);
  console.log(`  Phase 3  — Episodes fetched OK         : ${p3ok} (${pct(p3ok, total)}%)`);
  console.log(`  Phase 3b — Guest-friendly passed       : ${p3bPassed}`);
  console.log(`  Phase 4  — Enriched feeds              : ${p4n}`);
  console.log(`  Phase 4a — rss_owner_email found       : ${emailFound}/${p4n} (${pct(emailFound, p4n)}%)`);
  console.log(`  Phase 4a — website_instagram found     : ${igFound}/${p4n} (${pct(igFound, p4n)}%)`);
  console.log(`  Phase 4b — apple_rating found          : ${appleFound}/${p4n} (${pct(appleFound, p4n)}%)`);
  console.log(`  Phase 4c — spotify URL found           : ${spotifyUrl}/${p4n} (${pct(spotifyUrl, p4n)}%)`);
  console.log(`  Phase 4c — spotify_rating found        : ${spotRtFound}/${spotifyUrl} of those with URL`);
  console.log(`  Phase 4d — yt URL found                : ${ytUrl}/${p4n} (${pct(ytUrl, p4n)}%)`);
  console.log(`  Phase 4d — yt_subscribers found        : ${ytFound}/${ytUrl} of those with URL`);
  console.log(`  Phase 4e — instagram_followers found   : ${igFound2}/${igFound} of those with URL`);
  console.log(`  Phase 5  — Gemini scored               : ${p5ok}/${p4n} (${pct(p5ok, p4n)}%)`);
  console.log(`  Phase 5  — Gemini failed               : ${p5failed}`);
  console.log(`  Phase 6  — Badassery scored            : ${scored.length}/${p4n} (${pct(scored.length, p4n)}%)`);
  console.log('='.repeat(W));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ── Phase 7 — Firestore writes ────────────────────────────────────────────────

async function phase7_writeToFirestore(feeds) {
  log(`Phase 7 — Writing ${feeds.length} podcasts to Firestore`, 'PHASE');
  const firestore  = initFirebase();
  const WRITE_SIZE = 400; // Firestore batch limit is 500 ops
  let written = 0;

  for (let i = 0; i < feeds.length; i += WRITE_SIZE) {
    const chunk = feeds.slice(i, i + WRITE_SIZE);
    const batch = firestore.batch();

    for (const f of chunk) {
      const ref = firestore.collection('podcasts').doc(String(f.itunesId));

      // Strip internal debug/pipeline fields before writing
      const doc = {
        itunesId                : f.itunesId,
        feedId                  : f.feedId ?? null,
        title                   : f.title || '',
        description             : f.description || '',
        language                : f.language || '',
        imageUrl                : f.imageUrl || '',
        homepageUrl             : f.homepageUrl || '',
        rssUrl                  : f.rssUrl || '',
        author                  : f.author || '',
        ownerName               : f.ownerName || '',
        episodeCount            : f.episodeCount || 0,
        newestItemPubdate       : f.newestItemPubdate ?? null,
        oldestItemPubdate       : f.oldestItemPubdate ?? null,
        popularityScore         : f.popularityScore ?? null,
        // Enrichment
        rss_owner_email         : f.rss_owner_email || '',
        website_email           : f.website_email || '',
        website_instagram       : f.website_instagram || '',
        website_twitter         : f.website_twitter || '',
        website_linkedin        : f.website_linkedin || '',
        website_youtube         : f.website_youtube || '',
        website_spotify         : f.website_spotify || '',
        website_facebook        : f.website_facebook || '',
        website_tiktok          : f.website_tiktok || '',
        apple_rating            : f.apple_rating ?? null,
        apple_rating_count      : f.apple_rating_count ?? null,
        apple_chart_rank        : f.apple_chart_rank ?? null,
        apple_chart_genre       : f.apple_chart_genre || '',
        spotify_rating          : f.spotify_rating ?? null,
        spotify_review_count    : f.spotify_review_count ?? null,
        spotify_chart_rank      : f.spotify_chart_rank ?? null,
        yt_subscribers          : f.yt_subscribers ?? null,
        yt_total_views          : f.yt_total_views ?? null,
        yt_avg_views_per_video  : f.yt_avg_views_per_video ?? null,
        instagram_followers     : f.instagram_followers ?? null,
        twitter_followers       : f.twitter_followers ?? null,
        // Guest intelligence
        gemini_guest_friendly         : f.gemini_guest_friendly ?? null,
        gemini_guest_ratio            : f.gemini_guest_ratio ?? null,
        gemini_guest_authority        : f.gemini_guest_authority || '',
        gemini_guest_confidence       : f.gemini_guest_confidence || '',
        gemini_guest_types            : f.gemini_guest_types || [],
        gemini_guest_industries       : f.gemini_guest_industries || [],
        gemini_typical_guest_profile  : f.gemini_typical_guest_profile || '',
        gemini_recent_guests          : f.gemini_recent_guests || [],
        // AI scoring
        ai_primary_category           : f.ai_primary_category || '',
        ai_secondary_categories       : f.ai_secondary_categories || [],
        ai_topics                     : f.ai_topics || [],
        ai_target_audience            : f.ai_target_audience || '',
        ai_podcast_style              : f.ai_podcast_style || '',
        ai_business_relevance         : f.ai_business_relevance ?? null,
        ai_content_quality            : f.ai_content_quality ?? null,
        ai_audience_size              : f.ai_audience_size || '',
        ai_engagement_level           : f.ai_engagement_level || '',
        ai_monetization_potential     : f.ai_monetization_potential || '',
        ai_summary                    : f.ai_summary || '',
        // Badassery Score
        ai_badassery_score            : f.ai_badassery_score ?? null,
        ai_global_percentile          : f.ai_global_percentile ?? null,
        ai_category_percentile        : f.ai_category_percentile ?? null,
        score_guest_compatibility     : f.score_guest_compatibility ?? null,
        score_audience_power          : f.score_audience_power ?? null,
        score_podcast_authority       : f.score_podcast_authority ?? null,
        score_activity_consistency    : f.score_activity_consistency ?? null,
        score_engagement              : f.score_engagement ?? null,
        score_contactability          : f.score_contactability ?? null,
        score_missing_signals         : f.score_missing_signals || [],
        // Meta
        has_chapters                  : f.has_chapters ?? false,
        has_transcripts               : f.has_transcripts ?? false,
        avg_episode_length_min        : f.avg_episode_length_min ?? null,
        publish_consistency           : f.publish_consistency ?? null,
        aiCategorizationStatus        : 'completed',
        aiCategorizedAt               : admin.firestore.Timestamp.now(),
        updatedAt                     : admin.firestore.Timestamp.now(),
        uploadedFrom                  : 'rebuild_database',
      };

      batch.set(ref, doc, { merge: true });
    }

    await batch.commit();
    written += chunk.length;
    process.stdout.write(`\r  [P7] ${written}/${feeds.length} written...`);
  }

  process.stdout.write('\n');
  log(`Phase 7 done — ${written} podcasts written to Firestore`, 'SUCCESS');
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(72));
  console.log('  🔨  BADASSERY PR — DATABASE REBUILD  (Phases 1 → 6)');
  console.log('='.repeat(72));
  if (DRY_RUN) console.log('  Mode      : DRY-RUN (no Firestore writes)');
  else         console.log('  Mode      : ⚠️  LIVE (Firestore writes enabled — Phase 7)');
  if (LIMIT !== Infinity) console.log(`  Limit     : ${LIMIT} podcasts`);
  console.log(`  Batch size: ${BATCH_SIZE}`);
  if (VERBOSE)     console.log('  --verbose : per-feed detail logged after each phase');
  if (REPORT)      console.log('  --report  : markdown report saved to reports/');
  if (SKIP_PHASE1)   console.log('  --skip-phase1   : loading from checkpoints, skipping phases 3 + 3b');
  if (NO_DEDUP)      console.log('  --no-dedup      : skip itunesId dedup, process all feeds fresh');
  if (NO_CHECKPOINT) console.log('  --no-checkpoint : ignore existing checkpoints, start fresh');
  if (RANDOM)        console.log('  --random        : random draw from SQLite instead of ORDER BY popularityScore');
  console.log('='.repeat(72) + '\n');

  // ── Load existing checkpoints (for dedup on resume) ────────────────────────
  const { processedIds } = NO_CHECKPOINT
    ? { feeds: [], processedIds: new Set() }
    : loadExistingCheckpoints();

  // ── Phase 1 ────────────────────────────────────────────────────────────────
  let allFeeds;
  if (SKIP_PHASE1) {
    // Load already-passed feeds from checkpoints; apply --limit
    const { feeds } = loadExistingCheckpoints();
    allFeeds = LIMIT !== Infinity ? feeds.slice(0, LIMIT) : feeds;
    log(`Loaded ${allFeeds.length} feeds from checkpoints (--skip-phase1)`);
  } else {
    allFeeds = phase1_discoverFromSQLite();
    verbosePhase('Phase 1 — SQLite candidates', allFeeds.map(f => ({
      feedId: f.feedId, itunesId: f.itunesId, title: f.title,
      language: f.language, episodeCount: f.episodeCount,
      popularityScore: f.popularityScore, author: f.author, ownerName: f.ownerName,
      category1: f.category1, category2: f.category2, category3: f.category3,
      newestItemPubdate: f.newestItemPubdate, oldestItemPubdate: f.oldestItemPubdate,
      homepageUrl: f.homepageUrl, imageUrl: f.imageUrl,
      description: f.description,
    })));

    // Skip already-processed itunesIds (resume support) — bypassed with --no-dedup
    if (!NO_DEDUP && processedIds.size > 0) {
      const before = allFeeds.length;
      allFeeds = allFeeds.filter(f => !processedIds.has(String(f.itunesId)));
      if (before !== allFeeds.length) {
        log(`Skipped ${(before - allFeeds.length).toLocaleString()} already-processed feeds`);
      }
    }
  }

  if (allFeeds.length === 0) {
    log('No new feeds to process.', 'WARN');
    process.exit(0);
  }

  // ── Phase 2 ────────────────────────────────────────────────────────────────
  if (!SKIP_CHARTS && !SKIP_PHASE1) {
    const { appleMap, spotifyMap } = phase2_loadChartsCache();
    let hits = 0;
    for (const feed of allFeeds) {
      enrichWithCharts(feed, appleMap, spotifyMap);
      if (feed.apple_chart_rank !== null || feed.spotify_chart_rank !== null) hits++;
    }
    runStats.p2.chartHits = hits;
    log(`Chart enrichment done — ${hits} feeds matched`);
    verbosePhase('Phase 2 — Chart enrichment', allFeeds.map(f => ({
      title: f.title, apple_chart_rank: f.apple_chart_rank, apple_chart_genre: f.apple_chart_genre,
      spotify_chart_rank: f.spotify_chart_rank, spotify_chart_genre: f.spotify_chart_genre,
    })));
  } else {
    // Ensure chart fields exist even if skipped
    for (const feed of allFeeds) {
      feed.apple_chart_rank    = feed.apple_chart_rank    ?? null;
      feed.apple_chart_genre   = feed.apple_chart_genre   ?? null;
      feed.spotify_chart_rank  = feed.spotify_chart_rank  ?? null;
      feed.spotify_chart_genre = feed.spotify_chart_genre ?? null;
    }
  }

  // ── Phases 3 + 3b + 4: process in BATCH_SIZE chunks, checkpoint after each ─
  let batchNumber = NO_CHECKPOINT ? 1 : existingCheckpointFiles().length + 1;

  try {
    for (let offset = 0; offset < allFeeds.length; offset += BATCH_SIZE) {
      const batch = allFeeds.slice(offset, offset + BATCH_SIZE);
      const bEnd  = Math.min(offset + BATCH_SIZE, allFeeds.length);
      log(`\n── Batch ${batchNumber}: feeds ${offset + 1}–${bEnd} of ${allFeeds.length} ──`);

      // Phases 3 + 3b only on fresh runs (not when loading from checkpoints)
      if (!SKIP_PHASE1) {
        await phase3_fetchEpisodes(batch);
        verbosePhase('Phase 3 — Episodes', batch.map(f => ({
          title: f.title, episodeCount: f.episodes?.length,
          avg_episode_length_min: f.avg_episode_length_min,
          publish_consistency: f.publish_consistency,
          has_chapters: f.has_chapters, has_transcripts: f.has_transcripts,
          _publish_intervals_days: f._publish_intervals_days,
          episodes: (f.episodes || []).map(e => ({ title: e.title, duration: e.duration, datePublished: e.datePublished })),
        })));

        await phase3b_geminiGuestFilter(batch);
        verbosePhase('Phase 3b — Gemini guest filter', batch.map(f => ({
          title: f.title, _drop: f._drop,
          gemini_guest_friendly: f.gemini_guest_friendly,
          gemini_guest_ratio: f.gemini_guest_ratio,
          gemini_guest_authority: f.gemini_guest_authority,
          gemini_guest_confidence: f.gemini_guest_confidence,
          gemini_guest_types: f.gemini_guest_types,
          gemini_guest_industries: f.gemini_guest_industries,
          gemini_typical_guest_profile: f.gemini_typical_guest_profile,
          gemini_recent_guests: f.gemini_recent_guests,
          _p3b_latency_ms: f._p3b_latency_ms,
        })));
      }

      // Phase 4: enrich only guest-friendly feeds (those without _drop)
      const toEnrich = batch.filter(f => !f._drop);
      if (toEnrich.length > 0) {
        await phase4_enrichPodcasts(toEnrich);
        verbosePhase('Phase 4 — Enrichment', toEnrich.map(f => ({
          title: f.title,
          rss_owner_email: f.rss_owner_email, apple_rating: f.apple_rating, apple_rating_count: f.apple_rating_count,
          spotify_rating: f.spotify_rating, spotify_review_count: f.spotify_review_count,
          yt_subscribers: f.yt_subscribers, yt_total_views: f.yt_total_views, yt_avg_views_per_video: f.yt_avg_views_per_video,
          instagram_followers: f.instagram_followers,
          website_instagram: f.website_instagram, website_twitter: f.website_twitter,
          website_linkedin: f.website_linkedin, website_youtube: f.website_youtube,
          website_spotify: f.website_spotify, website_facebook: f.website_facebook,
          website_tiktok: f.website_tiktok,
          apple_chart_rank: f.apple_chart_rank, spotify_chart_rank: f.spotify_chart_rank,
        })));
      }

      // Phase 5: Gemini full scoring on enriched feeds
      const toScore = batch.filter(f => !f._drop);
      if (toScore.length > 0) {
        await phase5_scoreFeeds(toScore);
        verbosePhase('Phase 5 — Gemini scoring', toScore.map(f => ({
          title: f.title, _p5_latency_ms: f._p5_latency_ms,
          aiCategorizationStatus: f.aiCategorizationStatus, aiCategorizationError: f.aiCategorizationError,
          ai_primary_category: f.ai_primary_category, ai_secondary_categories: f.ai_secondary_categories,
          ai_topics: f.ai_topics, ai_target_audience: f.ai_target_audience,
          ai_podcast_style: f.ai_podcast_style, ai_business_relevance: f.ai_business_relevance,
          ai_content_quality: f.ai_content_quality, ai_audience_size: f.ai_audience_size,
          ai_engagement_level: f.ai_engagement_level, ai_monetization_potential: f.ai_monetization_potential,
          ai_summary: f.ai_summary,
        })));
      }

      saveCheckpoint(batch, batchNumber);
      batchNumber++;
    }
  } finally {
    // Always close Puppeteer, even on crash
    await closeBrowser();
  }

  // ── Phase 6 — Badassery Score + Percentiles (post-batch, global norms) ──────
  const toScore6 = allFeeds.filter(f => !f._drop && f.aiCategorizationStatus === 'completed');
  if (toScore6.length > 0) {
    log(`Phase 6 — Badassery Score for ${toScore6.length} feeds`, 'PHASE');
    const norms = prepareBatchNorms(toScore6);
    toScore6.forEach(feed => calculateBadasseryScore(feed, norms));
    applyPercentiles(toScore6);
    log(`Phase 6 done — scores computed + percentiles assigned`, 'SUCCESS');
    verbosePhase('Phase 6 — Badassery Scores', toScore6.map(f => ({
      title: f.title, ai_badassery_score: f.ai_badassery_score,
      score_guest_compatibility: f.score_guest_compatibility,
      score_audience_power: f.score_audience_power,
      score_podcast_authority: f.score_podcast_authority,
      score_activity_consistency: f.score_activity_consistency,
      score_engagement: f.score_engagement,
      score_contactability: f.score_contactability,
      ai_global_percentile: f.ai_global_percentile,
      ai_category_percentile: f.ai_category_percentile,
      score_missing_signals: f.score_missing_signals,
    })));
  }

  // ── Results table ──────────────────────────────────────────────────────────
  printResults(allFeeds);

  // ── Phase 7 — Firestore writes ────────────────────────────────────────────
  if (!DRY_RUN) {
    await phase7_writeToFirestore(toScore6);
  }

  // ── Markdown report ────────────────────────────────────────────────────────
  if (REPORT) {
    if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const ts        = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportPath = path.join(REPORTS_DIR, `pipeline_test_${ts}.md`);
    const runConfig  = { LIMIT, VERBOSE, REPORT, SKIP_PHASE1, SKIP_CHARTS, DRY_RUN, NO_DEDUP, NO_CHECKPOINT, RANDOM };
    const md         = generateReport(allFeeds, runConfig, runStats);
    fs.writeFileSync(reportPath, md, 'utf8');
    log(`Report saved → ${reportPath}`, 'SUCCESS');
    if (VERBOSE) {
      console.log('\n' + '═'.repeat(72));
      console.log('  FULL REPORT');
      console.log('═'.repeat(72) + '\n');
      console.log(md);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
