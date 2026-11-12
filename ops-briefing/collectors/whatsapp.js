/**
 * WhatsApp Collector (Playwright)
 *
 * Sessions are stored via persistent-storage.js so they survive
 * Railway redeploys when PERSISTENT_DATA_DIR points to a mounted volume.
 *
 * Usage:
 *   node collectors/whatsapp.js --setup               # First time: scan QR (default session)
 *   node collectors/whatsapp.js --setup --session biz # First time: named session
 *   node collectors/whatsapp.js                       # Collect messages
 */

const path = require('path');
const fs = require('fs');
const PATHS = require('./persistent-storage');
const sessionHealth = require('./session-health');

const sessionArg = process.argv.find(function(a, i) { return process.argv[i-1] === '--session'; });
const SESSION_ID = sessionArg || 'default';

const phoneArg = process.argv.find(function(a, i) { return process.argv[i-1] === '--phone'; }) || null;

// Deterministic setup status the dashboard reads (shared by QR + phone flows,
// only one setup runs at a time). States: starting -> awaiting_scan/awaiting_code
// /code_ready -> connected/timeout.
const STATUS_FILE = path.join(PATHS.output(), 'whatsapp-setup-status.json');
function writeSetupStatus(state, extra) {
  try { fs.writeFileSync(STATUS_FILE, JSON.stringify(Object.assign({ state: state, at: Date.now() }, extra || {}))); } catch (e) {}
}

async function setupSession(sessionId) {
  const { chromium } = require('playwright');
  const sessDir = PATHS.whatsappSession(sessionId || SESSION_ID);
  const qrFile = require('path').join(PATHS.output(), 'whatsapp-qr.png');

  // Wipe stale files so the dashboard starts clean
  try { fs.unlinkSync(qrFile); } catch (e) {}
  writeSetupStatus('starting');

  console.log('WhatsApp Web Setup - QR Scan Required\n');
  console.log('Session directory: ' + sessDir + '\n');

  const browser = await chromium.launchPersistentContext(sessDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  await page.goto('https://web.whatsapp.com');

  console.log('Waiting for QR code...');

  // A screenshot of the QR is often STALE by the time it reaches a phone camera
  // (WhatsApp rotates the QR every ~20s → "check your connection" on scan). Instead,
  // read WhatsApp's live QR token (data-ref) and render a crisp, current QR ourselves,
  // regenerating it the instant WhatsApp rotates the token. Screenshot is the fallback.
  let QRCode = null;
  try { QRCode = require('qrcode'); } catch (e) { console.log('qrcode lib missing — using screenshot fallback'); }

  let connected = false;
  let sawFirstShot = false;
  let lastRef = null;
  let qrInterval = setInterval(async function() {
    try {
      if (connected) return;
      let ref = null;
      if (QRCode) {
        ref = await page.evaluate(() => {
          var el = document.querySelector('[data-ref]');
          return el ? el.getAttribute('data-ref') : null;
        }).catch(() => null);
      }
      if (ref && QRCode) {
        // Only regenerate when the token actually changes (avoids flicker)
        if (ref !== lastRef) {
          lastRef = ref;
          await QRCode.toFile(qrFile, ref, { width: 512, margin: 2 });
          console.log('Fresh QR rendered from live token');
        }
      } else {
        // Fallback: screenshot the page (QR not yet rendered, or lib unavailable)
        await page.screenshot({ path: qrFile, type: 'png' });
      }
      if (!sawFirstShot) { sawFirstShot = true; writeSetupStatus('awaiting_scan'); }
    } catch (e) { /* ignore */ }
  }, 2000);

  try {
    await page.waitForSelector('div[role="listitem"]', { timeout: 120000 });
    connected = true;
    clearInterval(qrInterval);
    // Clean up QR image once connected
    try { fs.unlinkSync(qrFile); } catch (e) { /* ignore */ }
    console.log('WhatsApp Web connected! Session saved.\n');
    sessionHealth.recordSetup('whatsapp', sessionId || SESSION_ID);
    writeSetupStatus('connected');
  } catch (e) {
    connected = true;
    clearInterval(qrInterval);
    console.log('Timed out waiting for QR scan. Try again.\n');
    writeSetupStatus('timeout');
  }

  await browser.close();
}

async function setupSessionByPhone(sessionId, phoneNumber) {
  const { chromium } = require('playwright');
  const sessDir = PATHS.whatsappSession(sessionId || SESSION_ID);
  const screenshotFile = path.join(PATHS.output(), 'whatsapp-qr.png');
  const codeFile = path.join(PATHS.output(), 'whatsapp-link-code.txt');
  const setStatus = writeSetupStatus; // shared helper

  // Wipe stale files from any previous run so the dashboard starts clean
  try { fs.unlinkSync(screenshotFile); } catch (e) {}
  try { fs.unlinkSync(codeFile); } catch (e) {}
  setStatus('starting');

  console.log('WhatsApp Phone Linking Setup');
  console.log('Phone: ' + phoneNumber);

  const browser = await chromium.launchPersistentContext(sessDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = browser.pages()[0] || await browser.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  await page.goto('https://web.whatsapp.com');
  await page.waitForTimeout(4000);

  // Screenshot 1: WhatsApp Web just loaded — dashboard can see it immediately
  try { await page.screenshot({ path: screenshotFile, type: 'png' }); console.log('Screenshot 1 saved'); } catch (e) {}

  // Click "Link with phone number" — wait for it to actually appear first (the QR
  // screen takes a few seconds to render this link). Text match is the reliable one.
  let switchedToPhone = false;
  try {
    const linkBtn = page.getByText(/link with phone number/i).first();
    await linkBtn.waitFor({ state: 'visible', timeout: 20000 });
    await linkBtn.click();
    console.log('Clicked "Link with phone number"');
    switchedToPhone = true;
  } catch (e) {
    console.log('Could not find "Link with phone number" link: ' + e.message);
  }
  await page.waitForTimeout(1500);

  // Screenshot 2: after the click (should now be the phone-entry screen)
  try { await page.screenshot({ path: screenshotFile, type: 'png' }); console.log('Screenshot 2 saved'); } catch (e) {}

  // Enter phone number — wait for the input to exist, then type it
  let phoneEntered = false;
  try {
    const phoneInput = page.locator('input[type="tel"], input[aria-label*="phone" i], input[placeholder*="phone" i]').first();
    await phoneInput.waitFor({ state: 'visible', timeout: 8000 });
    await phoneInput.click();
    // Clear anything pre-filled, then type the full international number
    await phoneInput.fill('');
    await phoneInput.type(phoneNumber.replace(/[^\d+]/g, ''), { delay: 60 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    // Some builds need the Next button instead of Enter
    try { await page.getByRole('button', { name: /next|link/i }).first().click({ timeout: 2000 }); } catch (e) {}
    phoneEntered = true;
    console.log('Phone number entered');
  } catch (e) {
    console.log('Phone input not found: ' + e.message);
  }

  // If we never reached the phone screen, don't masquerade as QR — tell the user to use QR
  if (!switchedToPhone || !phoneEntered) {
    console.log('Phone linking unavailable on this WhatsApp Web build — directing user to QR.');
    try { await page.screenshot({ path: screenshotFile, type: 'png' }); } catch (e) {}
    setStatus('phone_unavailable');
    try { fs.unlinkSync(codeFile); } catch (e) {}
    await browser.close();
    return;
  }

  await page.waitForTimeout(3000);

  // Screenshot 3: should show the pairing code now
  try { await page.screenshot({ path: screenshotFile, type: 'png' }); console.log('Screenshot 3 saved (code should be visible)'); } catch (e) {}

  // Extract the pairing code from this screenshot's page state
  let initialCode = null;
  const codeSelectors = [
    '[data-testid="link-device-code"]', '[data-testid="pair-code"]',
    'div[class*="pair-code"]', 'div[class*="linking-code"]', 'div[class*="pairing"]',
  ];
  for (const sel of codeSelectors) {
    try {
      const text = await page.locator(sel).first().textContent({ timeout: 800 });
      if (text && text.trim().length >= 4) { initialCode = text.trim(); break; }
    } catch (e) {}
  }
  if (!initialCode) {
    try {
      const bodyText = await page.evaluate(() => document.body.innerText);
      const m = bodyText.match(/\b([A-Z0-9]{4})[- ]([A-Z0-9]{4})\b/);
      if (m) initialCode = m[1] + '-' + m[2];
    } catch (e) {}
  }
  if (initialCode) {
    fs.writeFileSync(codeFile, initialCode);
    console.log('Code extracted: ' + initialCode);
    setStatus('code_ready', { code: initialCode });
  } else {
    // No text code parsed, but the screenshot shows it — tell dashboard to display the image
    setStatus('awaiting_code');
  }

  // Now start interval — no more sequential Playwright ops so no concurrency conflict
  let connected = false;
  const screenshotInterval = setInterval(async function() {
    if (connected) return;
    try {
      await page.screenshot({ path: screenshotFile, type: 'png' });
      // Re-check for code in case it wasn't visible earlier
      if (!initialCode) {
        let extracted = null;
        for (const sel of codeSelectors) {
          try {
            const text = await page.locator(sel).first().textContent({ timeout: 800 });
            if (text && text.trim().length >= 4) { extracted = text.trim(); break; }
          } catch (e) {}
        }
        if (!extracted) {
          try {
            const bodyText = await page.evaluate(() => document.body.innerText);
            const m = bodyText.match(/\b([A-Z0-9]{4})[- ]([A-Z0-9]{4})\b/);
            if (m) extracted = m[1] + '-' + m[2];
          } catch (e) {}
        }
        if (extracted) { fs.writeFileSync(codeFile, extracted); initialCode = extracted; setStatus('code_ready', { code: extracted }); }
      }
    } catch (e) {}
  }, 3000);

  let actuallyConnected = false;
  try {
    await page.waitForSelector('div[role="listitem"]', { timeout: 120000 });
    actuallyConnected = true;
    console.log('WhatsApp linked via phone number!');
    sessionHealth.recordSetup('whatsapp', sessionId || SESSION_ID);
    setStatus('connected');
  } catch (e) {
    console.log('Timed out waiting for phone link. Code was shown — user needs to enter it in WhatsApp.');
    setStatus('timeout');
  }

  connected = true;
  clearInterval(screenshotInterval);
  // Only delete screenshot on actual success — if timed out, leave it so dashboard can show what happened
  if (actuallyConnected) {
    try { fs.unlinkSync(screenshotFile); } catch (e) {}
  }
  try { fs.unlinkSync(codeFile); } catch (e) {}
  await browser.close();
}

async function collectWhatsApp(config, sessionId) {
  const { chromium } = require('playwright');
  const sessDir = PATHS.whatsappSession(sessionId || SESSION_ID);

  if (!fs.existsSync(sessDir) || fs.readdirSync(sessDir).length === 0) {
    throw new Error('No WhatsApp session found for "' + (sessionId || SESSION_ID) + '". Run setup first via the Settings page.');
  }

  // headless: false is intentional — WhatsApp Web blocks headless browsers.
  // On Railway (no display), Xvfb provides a virtual display — see railway.toml / Dockerfile.
  let browser = await chromium.launchPersistentContext(sessDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const threads = [];
  try {

  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('https://web.whatsapp.com');

  const chatSelectors = [
    'div[role="listitem"]',
    '[data-testid="chat-list"]',
    '[data-testid="cell-frame-container"]',
    'div[aria-label="Chat list"]',
    '#pane-side',
  ];

  let loaded = false;
  console.log('  Waiting for WhatsApp to load...');
  await page.waitForTimeout(10000);

  for (const sel of chatSelectors) {
    try {
      await page.waitForSelector(sel, { timeout: 5000 });
      console.log(`  Found chat list (${sel})`);
      loaded = true;
      break;
    } catch {}
  }

  if (!loaded) {
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    if (pageText.includes('QR') || pageText.includes('Link a device') || pageText.includes('phone')) {
      // QR during a collection run = session has expired
      const expiredMsg = 'WhatsApp session expired — QR code shown during collection. Re-run setup.';
      console.log('  ' + expiredMsg);
      sessionHealth.markExpired('whatsapp', sessionId || SESSION_ID, expiredMsg);
      // Automated collection (6:30am) — nobody is here to scan a QR. Bail out
      // immediately instead of hanging up to ~10 minutes (120s x selectors), which
      // stalled the whole briefing. The Slack alert above tells Alex to reconnect.
      return threads; // empty — the briefing continues without WhatsApp
    }

    if (!loaded) {
      const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 1000));
      console.log('  Page content:', bodyText.substring(0, 200));
      console.log('  Waiting 15 more seconds...');
      await page.waitForTimeout(15000);
    }
  }

  console.log('  WhatsApp Web loaded, reading conversations...');
  await page.waitForTimeout(3000);

  // Debug screenshot — saved to persistent output directory
  const screenshotPath = path.join(PATHS.output(), 'whatsapp-debug.png');
  await page.screenshot({ path: screenshotPath });
  console.log(`  Debug screenshot: ${screenshotPath}`);

  const conversations = await page.evaluate(() => {
    const results = [];

    let items = document.querySelectorAll('div[role="listitem"]');

    if (items.length === 0) {
      const pane = document.getElementById('pane-side');
      if (pane) items = pane.querySelectorAll('div[tabindex="-1"]');
    }

    if (items.length === 0) {
      const sidebar = document.querySelector('[data-testid="chat-list"]') ||
                      document.getElementById('pane-side') ||
                      document.querySelector('div[aria-label*="Chat"]') ||
                      document.querySelector('nav')?.nextElementSibling;
      if (sidebar) items = sidebar.querySelectorAll('div[role="row"], div[role="option"], div[data-testid*="cell"]');
    }

    if (items.length === 0) {
      const allSpans = document.querySelectorAll('span[title]');
      const seen = new Set();
      allSpans.forEach(span => {
        const title = span.getAttribute('title') || '';
        if (title && !seen.has(title) && title.length > 1 && title.length < 50 &&
            !title.includes('Search') && !title.includes('New') && !title.includes('WhatsApp')) {
          seen.add(title);
          const parent = span.closest('div[tabindex]') || span.parentElement?.parentElement;
          const text = parent ? parent.innerText : '';
          const lines = text.split('\n').filter(l => l.trim());
          results.push({
            contact: title,
            time: lines.find(l => l.match(/\d{1,2}:\d{2}|yesterday|today/i)) || '',
            preview: lines.slice(1).join(' ').substring(0, 200),
            unread: text.includes('unread')
          });
        }
      });
      return results;
    }

    let hitOldConversation = false;
    items.forEach((item, i) => {
      if (i >= 100 || hitOldConversation) return;
      try {
        const allText = item.innerText || '';
        const lines = allText.split('\n').filter(l => l.trim());
        const contact = lines[0] || 'Unknown';
        const time = lines[1] || '';
        const preview = lines.slice(2).join(' ').substring(0, 200);

        if (contact && contact.length > 1 && !contact.includes('Search') && !contact.includes('New chat')) {
          var timeCheck = (time || '').toLowerCase();
          var isRecent = timeCheck.match(/^\d{1,2}:\d{2}/) || timeCheck.includes('yesterday');
          if (!isRecent && timeCheck.match(/\d{1,2}\/\d{1,2}/)) {
            hitOldConversation = true;
            return;
          }
          results.push({ contact, time, preview, unread: allText.toLowerCase().includes('unread') });
        }
      } catch {}
    });

    return results;
  });

  console.log(`  Found ${conversations.length} conversations`);

  const lookbackHours = config.lookbackHours || 24;
  const lookbackDays = Math.ceil(lookbackHours / 24);
  const now = new Date();

  const filtered = conversations.filter(conv => {
    const t = (conv.time || '').toLowerCase().trim();
    if (!t) return false;
    if (t.match(/^\d{1,2}:\d{2}/)) return true;
    if (t.includes('yesterday')) return lookbackHours >= 24;

    const dayNames = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const dayIdx = dayNames.indexOf(t);
    if (dayIdx >= 0) {
      const todayIdx = now.getDay();
      const daysAgo = (todayIdx - dayIdx + 7) % 7 || 7;
      return daysAgo <= lookbackDays;
    }

    const dateMatch = t.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : now.getFullYear();
      const msgDate = new Date(year, month, day);
      const diffHours = (now - msgDate) / 3600000;
      return diffHours <= lookbackHours;
    }

    return false;
  });

  console.log(`  After lookback filter (${lookbackHours}h): ${filtered.length} conversations`);

  const flagKeywords = (config.flagKeywords || []).map(k => k.toLowerCase());

  const chatRowSelectors = [
    'div[role="listitem"]',
    '[data-testid="cell-frame-container"]',
    'div[role="row"]',
    'div[role="option"]',
  ];

  let rowSelector = null;
  for (const sel of chatRowSelectors) {
    const count = await page.$$eval(sel, els => els.length).catch(() => 0);
    if (count > 0) {
      rowSelector = sel;
      console.log(`  Using row selector: ${sel} (${count} rows)`);
      break;
    }
  }

  for (let i = 0; i < filtered.length; i++) {
    const conv = filtered[i];
    try {
      let clicked = false;

      if (rowSelector) {
        try {
          const rows = await page.$$(rowSelector);
          if (rows[i]) { await rows[i].click(); clicked = true; }
        } catch {}
      }

      if (!clicked) {
        const cleanName = conv.contact.replace(/\d+\s*unread\s*messages?/i, '').replace(/\s+$/, '').trim();
        const chatItem = await page.$(`span[title="${cleanName}"]`) || await page.$(`span[title="${conv.contact}"]`);
        if (chatItem) { await chatItem.click(); clicked = true; }
      }

      if (!clicked) {
        const cleanName = conv.contact.replace(/\d+\s*unread\s*messages?/i, '').trim();
        clicked = await page.evaluate((name) => {
          const spans = document.querySelectorAll('span[title]');
          for (const span of spans) {
            const title = span.getAttribute('title') || '';
            if (title.includes(name) || name.includes(title)) {
              const clickTarget = span.closest('div[role="listitem"]') ||
                                  span.closest('div[role="row"]') ||
                                  span.closest('div[tabindex]') ||
                                  span;
              clickTarget.click();
              return true;
            }
          }
          return false;
        }, cleanName).catch(() => false);
      }

      if (clicked) {
        await page.waitForTimeout(2500);

        const messages = await page.evaluate(() => {
          const msgs = [];

          const preTextEls = document.querySelectorAll('div[data-pre-plain-text]');
          if (preTextEls.length > 0) {
            Array.from(preTextEls).slice(-8).forEach(function(el) {
              var attr = el.getAttribute('data-pre-plain-text') || '';
              var match = attr.match(/\[([^\]]+)\]\s*([^:]+):/);
              var sender = match ? match[2].trim() : '';
              var time = match ? match[1].trim() : '';
              var textEl = el.querySelector('span.selectable-text') || el.querySelector('span[dir="ltr"]');
              var message = textEl ? textEl.innerText.trim() : el.innerText.trim();
              if (message && message.length > 1) {
                msgs.push({ sender, message: message.substring(0, 300), time });
              }
            });
            return msgs;
          }

          var containers = document.querySelectorAll('[data-testid="msg-container"]');
          if (containers.length > 0) {
            Array.from(containers).slice(-8).forEach(function(el) {
              var authorEl = el.querySelector('[data-testid="author"]') || el.querySelector('span[aria-label]');
              var sender = authorEl ? (authorEl.textContent || authorEl.getAttribute('aria-label') || '').replace(/~/, '').trim() : '';
              var textEl = el.querySelector('span.selectable-text') || el.querySelector('span[dir="ltr"]');
              var message = textEl ? textEl.innerText.trim() : '';
              if (!message) {
                var lines = (el.innerText || '').split('\n').filter(function(l) { return l.trim(); });
                message = sender && lines[0] === sender ? lines.slice(1).join(' ') : lines.join(' ');
              }
              if (message && message.length > 1) {
                msgs.push({ sender, message: message.substring(0, 300) });
              }
            });
            return msgs;
          }

          var panel = document.querySelector('[data-testid="conversation-panel-messages"]') || document.querySelector('#main');
          if (panel) {
            (panel.innerText || '').split('\n').filter(function(l) { return l.trim() && l.length > 2; }).slice(-10).forEach(function(line) {
              var colonMatch = line.match(/^([^:]{2,30}):\s+(.+)/);
              if (colonMatch) {
                msgs.push({ sender: colonMatch[1], message: colonMatch[2].substring(0, 300) });
              } else if (line.length > 5) {
                msgs.push({ sender: '', message: line.substring(0, 300) });
              }
            });
          }
          return msgs;
        });

        const allText = messages.map(m => m.message).join(' ').toLowerCase();
        const matchedKeywords = flagKeywords.filter(kw => allText.includes(kw));

        threads.push({
          contact: conv.contact,
          stream: 'business',
          lastMessages: messages.map(m => m.sender ? `${m.sender}: ${m.message}` : m.message).slice(-3),
          lastSender: messages.length > 0 ? messages[messages.length - 1].sender : '',
          timestamp: conv.time,
          alexsLastNoReply: false,
          keywords: matchedKeywords,
          unread: conv.unread,
          messageCount: messages.length,
        });

        console.log(`  ${conv.contact}: ${messages.length} messages read`);

        try {
          const backBtn = await page.$('[data-testid="back"], [aria-label="Back"], button[title="Back"]');
          if (backBtn) { await backBtn.click(); } else { await page.keyboard.press('Escape'); }
          await page.waitForTimeout(1000);
        } catch {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(1000);
        }
      } else {
        threads.push({
          contact: conv.contact,
          stream: 'business',
          lastMessages: [conv.preview].filter(Boolean),
          lastSender: '',
          timestamp: conv.time,
          alexsLastNoReply: false,
          keywords: [],
          unread: conv.unread,
          messageCount: 0,
        });
        console.log(`  ${conv.contact}: sidebar preview only`);
      }
    } catch (e) {
      console.log(`  ${conv.contact}: ${e.message}`);
      try { await page.keyboard.press('Escape'); await page.waitForTimeout(500); } catch {}
    }
  }

  } finally {
    await browser.close().catch(() => {});
  }

  const cachePath = PATHS.whatsappCache();
  fs.writeFileSync(cachePath, JSON.stringify({ scannedAt: new Date().toISOString(), threads }, null, 2));
  console.log(`  WhatsApp: ${threads.length} conversations captured`);
  // Only mark healthy if we actually loaded the chat list — otherwise an expired
  // session flips back to "ok" every run and re-alerts every single morning.
  if (loaded) sessionHealth.markHealthy('whatsapp', sessionId || SESSION_ID);
  return threads;
}

if (require.main === module) {
  if (process.argv.includes('--setup-phone')) {
    if (!phoneArg) { console.error('--phone <number> required'); process.exit(1); }
    setupSessionByPhone(SESSION_ID, phoneArg).catch(e => console.error('Error:', e.message));
  } else if (process.argv.includes('--setup')) {
    setupSession(SESSION_ID).catch(e => console.error('Error:', e.message));
  } else {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    const config = require('../config.json').streams.personal.whatsapp;
    collectWhatsApp(config)
      .then(threads => console.log(`\n${threads.length} threads collected`))
      .catch(e => console.error('Error:', e.message));
  }
}

module.exports = { collectWhatsApp };
