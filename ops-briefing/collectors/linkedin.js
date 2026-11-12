/**
 * LinkedIn Collector (Playwright)
 *
 * Sessions are stored via persistent-storage.js so they survive
 * Railway redeploys when PERSISTENT_DATA_DIR points to a mounted volume.
 *
 * Scrapes LinkedIn messaging with randomised delays to avoid detection.
 * Run ONCE per day only.
 *
 * Usage:
 *   node collectors/linkedin.js --setup --session alex-morgan   # First time: manual login
 *   node collectors/linkedin.js --session alex-morgan           # Collect messages
 *   node collectors/linkedin.js --setup                        # Default session
 */

const path = require('path');
const fs = require('fs');
const PATHS = require('./persistent-storage');
const sessionHealth = require('./session-health');

const SESSION_ARG = (() => {
  const idx = process.argv.indexOf('--session');
  return (idx !== -1 && process.argv[idx + 1]) ? process.argv[idx + 1].replace(/"/g, '') : null;
})();

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min) * 1000;
}

async function setupSession(sessionId) {
  const { chromium } = require('playwright');
  const sessionDir = PATHS.linkedinSession(sessionId);
  const screenshotFile = path.join(PATHS.output(), 'linkedin-setup.png');
  const codeFile = path.join(PATHS.output(), 'linkedin-2fa-code.txt');
  const statusFile = path.join(PATHS.output(), 'linkedin-setup-status.json');

  function setStatus(state, extra) {
    try { fs.writeFileSync(statusFile, JSON.stringify(Object.assign({ state: state, at: Date.now() }, extra || {}))); } catch (e) {}
  }

  const email = process.env.LI_EMAIL;
  const password = process.env.LI_PASS;

  // Wipe stale files so the dashboard starts clean
  try { fs.unlinkSync(screenshotFile); } catch (e) {}
  setStatus('starting');

  console.log('LinkedIn Setup - Manual Login Required');
  console.log('Session: ' + (sessionId || 'default'));

  const browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://www.linkedin.com/login');

  // Auto-fill credentials if provided
  if (email && password) {
    console.log('Auto-filling credentials...');
    try {
      await page.waitForSelector('#username', { timeout: 10000 });
      await page.fill('#username', email);
      await page.fill('#password', password);
      await page.click('[type="submit"]');
      console.log('Credentials submitted.');
    } catch (e) {
      console.log('Could not auto-fill: ' + e.message);
    }
  }

  // Take screenshots every 3 seconds so dashboard can show a live view of the login
  let done = false;
  let sawFirstShot = false;
  const screenshotInterval = setInterval(async function() {
    try {
      if (done) return;
      await page.screenshot({ path: screenshotFile, type: 'png' });
      if (!sawFirstShot) { sawFirstShot = true; setStatus('awaiting_login'); }
    } catch (e) {}
  }, 3000);

  // Poll for 2FA code written by /api/linkedin-2fa endpoint
  const codeInterval = setInterval(async function() {
    try {
      if (!fs.existsSync(codeFile)) return;
      const code = fs.readFileSync(codeFile, 'utf8').trim();
      fs.unlinkSync(codeFile);
      if (code) {
        console.log('Submitting 2FA code: ' + code);
        await page.fill('input[name="pin"]', code).catch(() =>
          page.fill('input[autocomplete="one-time-code"]', code).catch(() => {})
        );
        await page.keyboard.press('Enter');
      }
    } catch (e) {}
  }, 2000);

  // Detect a REAL login: reaching the feed or the messaging nav means we're in.
  let loggedIn = false;
  try {
    await page.waitForURL('**/feed**', { timeout: 120000 });
    loggedIn = true;
    console.log('Login detected (feed loaded)!');
  } catch {
    try {
      await page.waitForSelector('[data-test-id="nav-item-messaging"], .global-nav__me', { timeout: 5000 });
      loggedIn = true;
      console.log('Login detected (nav present)!');
    } catch {
      loggedIn = false;
    }
  }

  done = true;
  clearInterval(screenshotInterval);
  clearInterval(codeInterval);

  // Take one FINAL screenshot as visual proof of the end state, and KEEP it so the
  // dashboard can show it. Success = the logged-in feed; failure = wherever it stuck.
  try {
    if (loggedIn) { try { await page.goto('https://www.linkedin.com/feed/', { timeout: 15000 }); } catch (e) {} }
    await page.screenshot({ path: screenshotFile, type: 'png' });
  } catch (e) {}

  if (loggedIn) {
    setStatus('logged_in');
    sessionHealth.recordSetup('linkedin', sessionId);
    sessionHealth.markHealthy('linkedin', sessionId);
    console.log('LinkedIn session saved. Cookie typically lasts 30-60 days.\n');
    try {
      const meta = { setupAt: new Date().toISOString(), sessionId };
      fs.writeFileSync(path.join(PATHS.output(), 'linkedin-session-meta.json'), JSON.stringify(meta, null, 2));
    } catch (e) {}
  } else {
    setStatus('login_failed');
    console.log('LinkedIn login NOT confirmed — check the screenshot (2FA, captcha, or wrong password).\n');
  }

  await browser.close();
}

async function collectLinkedIn(config, sessionId) {
  const { chromium } = require('playwright');
  const sessionDir = PATHS.linkedinSession(sessionId);
  let browser;

  if (!fs.existsSync(sessionDir) || fs.readdirSync(sessionDir).length === 0) {
    throw new Error('No LinkedIn session for "' + (sessionId || 'default') + '". Run setup first via the Settings page.');
  }

  // headless: false — LinkedIn actively blocks headless browsers.
  // On Railway (no display), Xvfb provides a virtual display — see railway.toml / Dockerfile.
  browser = await chromium.launchPersistentContext(sessionDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const results = [];

  try {
    const page = browser.pages()[0] || await browser.newPage();

    console.log('  Opening LinkedIn messaging (' + (sessionId || 'default') + ')...');
    await page.goto('https://www.linkedin.com/messaging/');
    await page.waitForTimeout(randomDelay(3, 5));

    // Detect session expiry: redirected to login or checkpoint page
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint') || currentUrl.includes('/authwall')) {
      const expiredMsg = 'LinkedIn session expired — redirected to ' + currentUrl.split('?')[0];
      console.log('  ' + expiredMsg);
      sessionHealth.markExpired('linkedin', sessionId, expiredMsg);
      return results; // stop here — scraping a login page is meaningless
    }

    try {
      await page.waitForSelector('.msg-conversations-container__conversations-list', { timeout: 15000 });

      const convos = await page.$$('.msg-conversation-listitem');

      for (const convo of convos.slice(0, 10)) {
        await page.waitForTimeout(randomDelay(2, 4));

        try {
          const name = await convo.$eval('.msg-conversation-listitem__participant-names', el => el.textContent.trim());
          const preview = await convo.$eval('.msg-conversation-card__message-snippet', el => el.textContent.trim()).catch(() => '');
          const time = await convo.$eval('.msg-conversation-listitem__time-stamp', el => el.textContent.trim()).catch(() => '');
          const unreadBadge = await convo.$('.notification-badge').catch(() => null);

          if (config.onlyUnread && !unreadBadge) continue;

          results.push({
            sender: name,
            preview: preview.substring(0, 200),
            timestamp: time,
            unread: !!unreadBadge,
          });

          console.log('  ' + name + ': ' + (unreadBadge ? 'unread' : 'read'));
        } catch (e) {
          console.log('  Skipped conversation: ' + e.message);
        }
      }
    } catch (e) {
      console.log('  LinkedIn: could not load message list: ' + e.message);
    }
  } finally {
    await browser.close().catch(() => {});
  }

  console.log('  LinkedIn: ' + results.length + ' conversations captured');
  sessionHealth.markHealthy('linkedin', sessionId);
  return results;
}

if (require.main === module) {
  if (process.argv.includes('--setup')) {
    setupSession(SESSION_ARG).catch(e => console.error('Error:', e.message));
  } else {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const config = require('../config.json').streams.personal.linkedin;
    collectLinkedIn(config, SESSION_ARG)
      .then(r => console.log('\n' + r.length + ' conversations collected'))
      .catch(e => console.error('Error:', e.message));
  }
}

module.exports = { collectLinkedIn };
