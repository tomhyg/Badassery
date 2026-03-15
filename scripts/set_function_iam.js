'use strict';

/**
 * set_function_iam.js — Grant allUsers the cloudfunctions.invoker role
 *
 * Firebase resets IAM on every functions deploy, so this must run after
 * any deployment that includes functions. Called by the deploy:all script.
 *
 * Uses the Firebase CLI user credentials (tom@badassery-hq.com, project owner)
 * since the service account lacks cloudfunctions.functions.setIamPolicy permission.
 *
 * Usage: node scripts/set_function_iam.js
 */

const https = require('https');
const path  = require('path');
const fs    = require('fs');
const os    = require('os');

const PROJECT   = 'brooklynn-61dc8';
const REGION    = 'us-central1';
const FUNCTIONS = ['podcastIndexProxy'];

// Firebase CLI OAuth2 client (public, not secret)
const OAUTH_CLIENT_ID     = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = 'j9iVZfS7ItxFXg7eSCDy';
const TOKEN_URL           = 'https://oauth2.googleapis.com/token';
const CONFIG_PATH         = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = typeof body === 'string' ? body : new URLSearchParams(body).toString();
    const isJson = typeof body !== 'string' ? false : body.startsWith('{');
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(data),
      },
    };
    const req = https.request(url, options, res => {
      let out = '';
      res.on('data', c => { out += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(out) }); }
        catch { resolve({ status: res.statusCode, body: out }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function getAccessToken() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Firebase CLI config not found at ${CONFIG_PATH}. Run: firebase login`);
  }

  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const tokens = config.tokens;

  if (!tokens?.refresh_token) {
    throw new Error('No Firebase CLI refresh token found. Run: firebase login');
  }

  // Check if the cached access token is still valid (with 60s buffer)
  const expiresAt = tokens.expires_at || 0;
  if (tokens.access_token && Date.now() < expiresAt - 60000) {
    return tokens.access_token;
  }

  // Refresh the token
  const res = await post(TOKEN_URL, {
    grant_type:    'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id:     OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
  });

  if (res.status !== 200 || !res.body.access_token) {
    throw new Error(`Token refresh failed (${res.status}): ${JSON.stringify(res.body)}`);
  }

  // Persist the new token back to the config file
  config.tokens.access_token = res.body.access_token;
  config.tokens.expires_at   = Date.now() + (res.body.expires_in * 1000);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

  return res.body.access_token;
}

function setIamPolicy(token, fnName) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      policy: {
        bindings: [{ role: 'roles/cloudfunctions.invoker', members: ['allUsers'] }],
      },
    });
    const url = `https://cloudfunctions.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/functions/${fnName}:setIamPolicy`;
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(data));
        else reject(new Error(`HTTP ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const token = await getAccessToken();
  for (const fn of FUNCTIONS) {
    await setIamPolicy(token, fn);
    console.log(`✔  IAM: allUsers invoker set on ${fn}`);
  }
}

main().catch(err => {
  console.error('set_function_iam.js failed:', err.message);
  process.exit(1);
});
