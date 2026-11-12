/**
 * Google OAuth2 Helper
 * Manages authentication for Gmail, Calendar, Drive, Sheets
 *
 * First run: opens browser for consent, saves refresh token
 * Subsequent runs: uses saved refresh token automatically
 *
 * Token files are stored via persistent-storage.js so they survive
 * Railway redeploys when PERSISTENT_DATA_DIR points to a mounted volume.
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');
const PATHS = require('./persistent-storage');

const CREDS_PATH = path.join(__dirname, '..', 'credentials.json');

const SCOPES = [
  'https://mail.google.com/',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
];

function loadCredentials() {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error(`credentials.json not found at ${CREDS_PATH}. Download it from Google Cloud Console.`);
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const c = creds.installed || creds.web;
  if (!c) throw new Error('Invalid credentials.json format');
  return c;
}

/**
 * Get an authenticated OAuth2 client for a specific account.
 * If no token exists, triggers the interactive auth flow.
 */
async function getAuthClient(accountEmail) {
  const creds = loadCredentials();
  const oauth2 = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'http://localhost:3002/callback'
  );

  const tokenPath = PATHS.googleToken(accountEmail);

  if (fs.existsSync(tokenPath)) {
    const token = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    oauth2.setCredentials(token);

    if (token.expiry_date && token.expiry_date < Date.now()) {
      try {
        const { credentials } = await oauth2.refreshAccessToken();
        // Merge to preserve refresh_token (Google omits it on refresh responses)
        const merged = Object.assign({}, token, credentials);
        oauth2.setCredentials(merged);
        fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
        console.log(`  Token refreshed for ${accountEmail}`);
      } catch (e) {
        console.log(`  Token refresh failed for ${accountEmail}: ${e.message}`);
        // On Railway there is no browser — interactive auth will never complete.
        // Throw a clear error so the briefing logs it and moves on rather than hanging.
        if (process.env.PERSISTENT_DATA_DIR || process.env.RAILWAY_ENVIRONMENT) {
          throw new Error(`Google token expired for ${accountEmail}. Re-authorise via the dashboard.`);
        }
        return await interactiveAuth(oauth2, accountEmail, tokenPath);
      }
    }

    return oauth2;
  }

  return await interactiveAuth(oauth2, accountEmail, tokenPath);
}

/**
 * Interactive OAuth flow — opens browser, waits for callback
 */
async function interactiveAuth(oauth2, accountEmail, tokenPath) {
  const authUrl = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    login_hint: accountEmail,
  });

  console.log(`\n Authorization needed for: ${accountEmail}`);
  console.log(`   Opening browser...\n`);

  const open = (await import('open')).default;
  await open(authUrl);

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const qs = url.parse(req.url, true).query;
        if (qs.code) {
          const { tokens } = await oauth2.getToken(qs.code);
          oauth2.setCredentials(tokens);
          fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`<h2>${accountEmail} authorized. You can close this tab.</h2>`);

          console.log(`Token saved for ${accountEmail}`);
          server.close();
          resolve(oauth2);
        }
      } catch (e) {
        res.writeHead(500);
        res.end('Authorization failed: ' + e.message);
        server.close();
        reject(e);
      }
    });

    server.listen(3002, () => {
      console.log('   Waiting for authorization on http://localhost:3002/callback ...');
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out after 2 minutes'));
    }, 120000);
  });
}

module.exports = { getAuthClient };
