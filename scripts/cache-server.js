/**
 * Cache Server — triggers export_podcasts_lite.js over HTTP
 *
 * Usage:  node scripts/cache-server.js
 * Port:   3001
 *
 * Endpoints:
 *   POST /export   — runs the export script and streams progress
 *   GET  /health   — returns { ok: true }
 *
 * The webapp calls POST /export after every manual edit so the
 * podcasts-lite.json static cache is regenerated automatically.
 * Run this server alongside `npm run dev` (or always-on locally).
 */

const http       = require('http');
const { spawn }  = require('child_process');
const path       = require('path');

const PORT        = 3001;
const SCRIPT_PATH = path.join(__dirname, 'export_podcasts_lite.js');

// Origins allowed to call this server
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
  'https://brooklynn-61dc8.web.app',
  'https://brooklynn-61dc8.firebaseapp.com',
];

function cors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(json);
}

const server = http.createServer((req, res) => {
  cors(req, res);

  // Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    send(res, 200, { ok: true });
    return;
  }

  // Export trigger
  if (req.method === 'POST' && req.url === '/export') {
    console.log('[cache-server] Export triggered by webapp...');

    const child = spawn('node', [SCRIPT_PATH], {
      cwd: path.join(__dirname, '..'),
    });

    const stdout = [];
    const stderr = [];

    child.stdout.on('data', d => { process.stdout.write(d); stdout.push(d.toString()); });
    child.stderr.on('data', d => { process.stderr.write(d); stderr.push(d.toString()); });

    child.on('close', code => {
      if (code === 0) {
        console.log('[cache-server] Export completed successfully.');
        send(res, 200, { ok: true, log: stdout.join('') });
      } else {
        console.error(`[cache-server] Export failed (exit ${code}).`);
        send(res, 500, { ok: false, error: stderr.join('') || `Exit code ${code}` });
      }
    });

    return;
  }

  send(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, () => {
  console.log(`[cache-server] Listening on http://localhost:${PORT}`);
  console.log(`[cache-server] POST /export  — regenerates podcasts-lite.json`);
  console.log(`[cache-server] GET  /health  — liveness check`);
});
