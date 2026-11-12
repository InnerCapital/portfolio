/**
 * Settings & Dashboard Web Server
 * Run: node server.js
 * Open: http://localhost:3001
 */

require('dotenv').config();
var http = require('http');
var fs = require('fs');
var path = require('path');
var url = require('url');
var PATHS = require('./collectors/persistent-storage');
var { handleMCP } = require('./mcp');
var { checkAuth } = require('./collectors/dashboard-auth');
var { getHealthSummary } = require('./collectors/session-health');

// Config lives on the persistent volume so dashboard changes survive redeploys.
// On first boot the project-root default is copied there if it doesn't exist yet.
var PORT = 3001;
var pendingAuthEmail = '';

var DEFAULT_CONFIG_PATH  = path.join(__dirname, 'config.json');
var configPath = process.env.PERSISTENT_DATA_DIR
  ? path.join(process.env.PERSISTENT_DATA_DIR, 'config.json')
  : DEFAULT_CONFIG_PATH;

// Seed persistent config from project default on first boot
if (process.env.PERSISTENT_DATA_DIR && !fs.existsSync(configPath)) {
  try {
    fs.copyFileSync(DEFAULT_CONFIG_PATH, configPath);
    console.log('  Seeded persistent config from project default');
  } catch (e) {
    console.error('  Could not seed config:', e.message);
    configPath = DEFAULT_CONFIG_PATH;
  }
}

// Set timezone from config so scheduler fires at the right local time
try {
  var _cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  if (_cfg.briefing && _cfg.briefing.timezone) process.env.TZ = _cfg.briefing.timezone;
} catch (e) { /* use system default */ }

// ─── Config helpers ───

function loadConfig() {
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function saveConfig(c) {
  fs.writeFileSync(configPath, JSON.stringify(c, null, 2));
}

// ─── Status ───

function getLastBriefing() {
  if (!fs.existsSync(PATHS.output())) return null;
  var files = fs.readdirSync(PATHS.output()).filter(function(f) { return f.endsWith('.html'); }).sort().reverse();
  if (files.length === 0) return null;
  return { file: files[0], date: files[0].replace('briefing-', '').replace('.html', '') };
}

function getStatus() {
  var config = loadConfig();
  var tokensDir = PATHS.tokens();
  var accounts = config.streams.business.gmail.accounts || [];
  var gmailStatus = accounts.map(function(a) {
    return {
      email: a,
      authorized: fs.existsSync(PATHS.googleToken(a))
    };
  });
  return {
    apiKey: !!process.env.ANTHROPIC_API_KEY,
    credentials: fs.existsSync(path.join(__dirname, 'credentials.json')),
    slackToken: !!process.env.SLACK_BOT_TOKEN,
    testMode: config._testMode.enabled,
    gmail: gmailStatus,
    schedule: config.briefing,
    lookbackHours: config.streams.business.gmail.lookbackHours || 24,
    sources: {
      calendar: config.streams.business.calendar.enabled,
      slack: config.streams.business.slack.enabled,
      drive: config.streams.business.drive.enabled,
      xero: config.streams.business.xero.enabled,
      icloud: config.streams.personal.icloudMail.enabled,
      whatsapp: config.streams.personal.whatsapp.enabled,
      zoom: !!(config.streams.business.zoom && config.streams.business.zoom.enabled)
    },
    delivery: config.delivery,
    lastBriefing: getLastBriefing()
  };
}

// ─── API Handlers ───

async function handleAPI(req, res, pathname, body) {
  res.setHeader('Content-Type', 'application/json');

  // GET /api/status
  if (pathname === '/api/status') {
    res.end(JSON.stringify(getStatus()));
    return;
  }

  // POST /api/add-gmail
  if (pathname === '/api/add-gmail' && body.email) {
    var config = loadConfig();
    if (!config.streams.business.gmail.accounts.includes(body.email)) {
      config.streams.business.gmail.accounts.push(body.email);
      saveConfig(config);
    }
    try {
      var creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf8'));
      var c = creds.installed || creds.web;
      var google = require('googleapis').google;
      var oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, (process.env.DASHBOARD_URL || 'http://localhost:' + PORT) + '/auth/callback');
      var authUrl = oauth2.generateAuthUrl({
        access_type: 'offline',
        scope: [
          'https://mail.google.com/',
          'https://www.googleapis.com/auth/calendar.readonly',
          'https://www.googleapis.com/auth/drive.readonly',
          'https://www.googleapis.com/auth/spreadsheets'
        ],
        prompt: 'consent',
        login_hint: body.email
      });
      pendingAuthEmail = body.email;
      res.end(JSON.stringify({ ok: true, authUrl: authUrl }));
    } catch (e) {
      res.end(JSON.stringify({ ok: false, error: e.message }));
    }
    return;
  }

  // POST /api/remove-gmail
  if (pathname === '/api/remove-gmail' && body.email) {
    var config = loadConfig();
    var idx = config.streams.business.gmail.accounts.indexOf(body.email);
    if (idx > -1) {
      config.streams.business.gmail.accounts.splice(idx, 1);
      saveConfig(config);
      var tokenFile = PATHS.googleToken(body.email);
      if (fs.existsSync(tokenFile)) fs.unlinkSync(tokenFile);
    }
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /api/test-gmail
  if (pathname === '/api/test-gmail') {
    var config = loadConfig();
    var results = [];
    var google = require('googleapis').google;
    var getAuthClient = require('./collectors/google-auth').getAuthClient;
    for (var i = 0; i < config.streams.business.gmail.accounts.length; i++) {
      var acct = config.streams.business.gmail.accounts[i];
      try {
        var auth = await getAuthClient(acct);
        var gmail = google.gmail({ version: 'v1', auth: auth });
        var profile = await gmail.users.getProfile({ userId: 'me' });
        results.push({ email: acct, ok: true, messages: profile.data.messagesTotal });
      } catch (e) {
        results.push({ email: acct, ok: false, error: e.message });
      }
    }
    res.end(JSON.stringify({ results: results }));
    return;
  }

  // POST /api/run-briefing
  if (pathname === '/api/run-briefing') {
    res.end(JSON.stringify({ ok: true, message: 'Briefing generation started...' }));
    var spawn = require('child_process').spawn;
    var briefEnv = Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':99' });
    // spawn (not exec) so generation logs stream to Railway live
    var briefChild = spawn('node', ['generate-briefing.js'], { cwd: __dirname, env: briefEnv });
    briefChild.stdout.on('data', function(d) { process.stdout.write('[briefing] ' + d.toString()); });
    briefChild.stderr.on('data', function(d) { process.stderr.write('[briefing err] ' + d.toString()); });
    briefChild.on('error', function(e) { console.error('[briefing spawn error]', e.message); });
    return;
  }

  // POST /api/test-email — send a test message via the configured HTTPS provider
  // (Resend or Brevo), returning the REAL error. Railway blocks SMTP on Hobby.
  if (pathname === '/api/test-email') {
    var cfg = loadConfig();
    var recips = (cfg.delivery && cfg.delivery.email && cfg.delivery.email.recipients) || [];
    if (recips.length === 0) { res.end(JSON.stringify({ ok: false, stage: 'config', error: 'No recipients configured.' })); return; }
    if (!process.env.RESEND_API_KEY && !process.env.BREVO_API_KEY) {
      res.end(JSON.stringify({ ok: false, stage: 'config', error: 'No email provider configured. Set BREVO_API_KEY (temp, no DNS) or RESEND_API_KEY (needs verified domain) in Railway.' }));
      return;
    }
    var emailFrom = process.env.EMAIL_FROM || process.env.SMTP_USER || 'hello@acmehire.example';
    var sendEmail = require('./send-email').sendEmail;
    sendEmail({
      from: emailFrom, to: recips,
      subject: 'Alex Briefing — test email',
      text: 'This is a test from the briefing dashboard. If you received this, email delivery is working.',
    }).then(function(r) {
      if (r.ok) res.end(JSON.stringify({ ok: true, via: r.via, from: emailFrom, to: recips, response: r.response }));
      else res.end(JSON.stringify({ ok: false, stage: r.via, from: emailFrom, error: r.error }));
    }).catch(function(e) {
      res.end(JSON.stringify({ ok: false, stage: 'send', from: emailFrom, error: e.message }));
    });
    return;
  }

  // GET /api/progress
  if (pathname === '/api/progress') {
    var progressFile = path.join(PATHS.output(), 'progress.json');
    try {
      if (fs.existsSync(progressFile)) {
        var progress = JSON.parse(fs.readFileSync(progressFile, 'utf8'));
        res.end(JSON.stringify(progress));
      } else {
        res.end(JSON.stringify({ pct: 0, message: 'Not running' }));
      }
    } catch (e) {
      res.end(JSON.stringify({ pct: 0, message: 'Not running' }));
    }
    return;
  }

  // GET /api/last-briefing
  if (pathname === '/api/last-briefing') {
    var last = getLastBriefing();
    if (last) {
      var content = fs.readFileSync(path.join(PATHS.output(), last.file), 'utf8');
      res.end(JSON.stringify({ ok: true, html: content, date: last.date }));
    } else {
      res.end(JSON.stringify({ ok: false }));
    }
    return;
  }

  // POST /api/update-schedule
  if (pathname === '/api/update-schedule' && body.time) {
    var config = loadConfig();
    config.briefing.generateAt = body.time;
    if (body.days) config.briefing.days = body.days;
    if (body.lookbackHours) config.streams.business.gmail.lookbackHours = parseInt(body.lookbackHours);
    if (body.timezone) config.briefing.timezone = body.timezone;
    if (body.mondayAutoExtend !== undefined) config.briefing.mondayAutoExtend = body.mondayAutoExtend;
    // Auto-schedule: two-phase collect/deliver
    if (body.autoScheduleEnabled !== undefined) config.briefing.autoScheduleEnabled = body.autoScheduleEnabled;
    if (body.collectAt) config.briefing.collectAt = body.collectAt;
    if (body.deliverAtTime) config.briefing.deliverAtTime = body.deliverAtTime;
    saveConfig(config);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/add-whatsapp
  if (pathname === '/api/add-whatsapp' && body.label) {
    var config = loadConfig();
    var id = body.label.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (!config.streams.personal.whatsapp.accounts) config.streams.personal.whatsapp.accounts = [];
    if (!config.streams.personal.whatsapp.accounts.find(function(a) { return a.id === id; })) {
      config.streams.personal.whatsapp.accounts.push({ id: id, label: body.label, status: 'pending' });
      saveConfig(config);
    }
    var sessionDir = PATHS.whatsappSession(id);
    var spawn = require('child_process').spawn;
    var waEnv = Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':99' });
    // Clear stale status/screenshot so the dashboard starts clean
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'whatsapp-setup-status.json')); } catch (e) {}
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'whatsapp-qr.png')); } catch (e) {}
    // spawn (not exec) so the collector's stdout streams to Railway logs live.
    // Account status is NOT force-set here — the collector's status file is the
    // source of truth for whether the scan actually connected.
    var qrChild = spawn('node', ['collectors/whatsapp.js', '--setup', '--session', id], { cwd: __dirname, env: waEnv });
    qrChild.stdout.on('data', function(d) { process.stdout.write('[WA-qr] ' + d.toString()); });
    qrChild.stderr.on('data', function(d) { process.stderr.write('[WA-qr err] ' + d.toString()); });
    qrChild.on('error', function(e) { console.error('[WA-qr spawn error]', e.message); });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/remove-whatsapp
  if (pathname === '/api/remove-whatsapp' && body.id) {
    var config = loadConfig();
    if (config.streams.personal.whatsapp.accounts) {
      config.streams.personal.whatsapp.accounts = config.streams.personal.whatsapp.accounts.filter(function(a) { return a.id !== body.id; });
      saveConfig(config);
    }
    var sessionDir = PATHS.whatsappSession(body.id);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/reset-whatsapp — wipe session dir so a fresh setup can succeed
  if (pathname === '/api/reset-whatsapp' && body.id) {
    var sessionDir = PATHS.whatsappSession(body.id);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/add-linkedin
  if (pathname === '/api/add-linkedin' && body.label) {
    var config = loadConfig();
    var id = body.label.toLowerCase().replace(/[^a-z0-9]/g, '-');
    if (!config.streams.personal.linkedin.accounts) config.streams.personal.linkedin.accounts = [];
    if (!config.streams.personal.linkedin.accounts.find(function(a) { return a.id === id; })) {
      config.streams.personal.linkedin.accounts.push({ id: id, label: body.label, status: 'pending' });
      saveConfig(config);
    }
    var spawn = require('child_process').spawn;
    var liEnv = Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':99' });
    if (body.email) liEnv.LI_EMAIL = body.email;
    if (body.password) liEnv.LI_PASS = body.password;
    // Clear stale status/screenshot so the dashboard starts clean
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'linkedin-setup-status.json')); } catch (e) {}
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'linkedin-setup.png')); } catch (e) {}
    // spawn (not exec) so login logs stream to Railway live. The screenshot is NOT
    // deleted here and the account is NOT force-marked connected — the collector's
    // status file is the source of truth for whether login actually succeeded.
    var liChild = spawn('node', ['collectors/linkedin.js', '--setup', '--session', id], { cwd: __dirname, env: liEnv });
    liChild.stdout.on('data', function(d) { process.stdout.write('[LI-setup] ' + d.toString()); });
    liChild.stderr.on('data', function(d) { process.stderr.write('[LI-setup err] ' + d.toString()); });
    liChild.on('error', function(e) { console.error('[LI-setup spawn error]', e.message); });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /api/linkedin-screenshot
  if (pathname === '/api/linkedin-screenshot') {
    var liFile = require('path').join(PATHS.output(), 'linkedin-setup.png');
    if (fs.existsSync(liFile)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(liFile).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not ready' }));
    }
    return;
  }

  // GET /api/linkedin-setup-status — deterministic login state written by the collector
  if (pathname === '/api/linkedin-setup-status') {
    var liStatusFile = require('path').join(PATHS.output(), 'linkedin-setup-status.json');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (fs.existsSync(liStatusFile)) res.end(fs.readFileSync(liStatusFile, 'utf8'));
    else res.end(JSON.stringify({ state: 'none' }));
    return;
  }

  // POST /api/linkedin-2fa — write code to a temp file the collector polls for
  if (pathname === '/api/linkedin-2fa' && body.code) {
    var codeFile = require('path').join(PATHS.output(), 'linkedin-2fa-code.txt');
    fs.writeFileSync(codeFile, body.code);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/run-linkedin — trigger an immediate collection for a session and return results
  if (pathname === '/api/run-linkedin' && body.id) {
    var exec = require('child_process').exec;
    var safeId = (body.id || '').replace(/[^a-z0-9-]/g, '');
    var liEnv = Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':99' });
    exec('node collectors/linkedin.js --session "' + safeId + '"', { cwd: __dirname, env: liEnv, timeout: 90000 }, function(err, stdout, stderr) {
      // Immediately reload collected-data.json to see if LinkedIn results were written
      try {
        var dataFile = require('path').join(PATHS.output(), 'collected-data.json');
        var health = {};
        try { health = require('./collectors/session-health').getHealthSummary(); } catch (e) {}
        var liCount = 0;
        var collectedAt = null;
        if (fs.existsSync(dataFile)) {
          var d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
          liCount = (d.personal && d.personal.linkedin) ? d.personal.linkedin.length : 0;
          collectedAt = d.collectedAt || null;
        }
        // stdout/stderr already written to Railway logs via exec
        if (stdout) console.log('[LI-run]', stdout.trim());
        if (stderr) console.error('[LI-run stderr]', stderr.trim());
      } catch (logErr) {}
    });
    // Respond immediately — client polls /api/session-health for updated status
    res.end(JSON.stringify({ ok: true, message: 'LinkedIn collection started — refresh in ~30s to see updated status' }));
    return;
  }

  // POST /api/remove-linkedin
  if (pathname === '/api/remove-linkedin' && body.id) {
    var config = loadConfig();
    if (config.streams.personal.linkedin.accounts) {
      config.streams.personal.linkedin.accounts = config.streams.personal.linkedin.accounts.filter(function(a) { return a.id !== body.id; });
      saveConfig(config);
    }
    var sessionDir = PATHS.linkedinSession(body.id);
    if (fs.existsSync(sessionDir)) fs.rmSync(sessionDir, { recursive: true, force: true });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /api/whatsapp-accounts or /api/linkedin-accounts
  if (pathname === '/api/whatsapp-accounts' || pathname === '/api/linkedin-accounts') {
    var config = loadConfig();
    var type = pathname.includes('whatsapp') ? 'whatsapp' : 'linkedin';
    var accounts = config.streams.personal[type].accounts || [];
    var result = accounts.map(function(a) {
      var dir = type === 'whatsapp' ? PATHS.whatsappSession(a.id) : PATHS.linkedinSession(a.id);
      return {
        id: a.id,
        label: a.label,
        status: a.status,
        hasSession: fs.existsSync(dir) && fs.readdirSync(dir).length > 0
      };
    });
    res.end(JSON.stringify({ accounts: result }));
    return;
  }

  // GET /api/whatsapp-qr-image — serves the QR screenshot taken during setup
  if (pathname === '/api/whatsapp-qr-image') {
    var qrFile = require('path').join(PATHS.output(), 'whatsapp-qr.png');
    if (fs.existsSync(qrFile)) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      fs.createReadStream(qrFile).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'QR not ready yet' }));
    }
    return;
  }

  // GET /api/whatsapp-setup-status — deterministic setup state written by the collector
  if (pathname === '/api/whatsapp-setup-status') {
    var statusFile = require('path').join(PATHS.output(), 'whatsapp-setup-status.json');
    if (fs.existsSync(statusFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(fs.readFileSync(statusFile, 'utf8'));
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ state: 'none' }));
    }
    return;
  }

  // POST /api/add-whatsapp-phone — start phone-number linking flow
  if (pathname === '/api/add-whatsapp-phone' && body.phone) {
    var spawn = require('child_process').spawn;
    var waId = (body.label || 'default').toLowerCase().replace(/[^a-z0-9]/g, '-');
    var safePhone = body.phone.replace(/[^0-9+]/g, '');
    // Clear stale status/screenshot/code from any previous run so the dashboard starts clean
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'whatsapp-setup-status.json')); } catch (e) {}
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'whatsapp-qr.png')); } catch (e) {}
    try { fs.unlinkSync(require('path').join(PATHS.output(), 'whatsapp-link-code.txt')); } catch (e) {}
    var env = Object.assign({}, process.env, { DISPLAY: process.env.DISPLAY || ':99' });
    // spawn (not exec) so the collector's stdout streams to Railway logs live
    var child = spawn('node', ['collectors/whatsapp.js', '--setup-phone', '--session', waId, '--phone', safePhone], { cwd: __dirname, env: env });
    child.stdout.on('data', function(d) { process.stdout.write('[WA-phone] ' + d.toString()); });
    child.stderr.on('data', function(d) { process.stderr.write('[WA-phone err] ' + d.toString()); });
    child.on('error', function(e) { console.error('[WA-phone spawn error]', e.message); });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // GET /api/whatsapp-link-code — return the extracted pairing code (if available)
  if (pathname === '/api/whatsapp-link-code') {
    var codeFile = path.join(PATHS.output(), 'whatsapp-link-code.txt');
    if (fs.existsSync(codeFile)) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: fs.readFileSync(codeFile, 'utf8').trim() }));
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Code not yet available' }));
    }
    return;
  }

  // POST /api/save-slack
  if (pathname === '/api/save-slack' && body.token) {
    var envPath = path.join(__dirname, '.env');
    var env = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (env.includes('SLACK_BOT_TOKEN=')) {
      env = env.replace(/SLACK_BOT_TOKEN=.*/g, 'SLACK_BOT_TOKEN=' + body.token);
    } else {
      env += '\nSLACK_BOT_TOKEN=' + body.token + '\n';
    }
    fs.writeFileSync(envPath, env);
    process.env.SLACK_BOT_TOKEN = body.token;
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/enable-source
  if (pathname === '/api/enable-source' && body.source) {
    var config = loadConfig();
    var src = body.source;
    if (src === 'whatsapp') config.streams.personal.whatsapp.enabled = body.enabled;
    else if (src === 'linkedin') config.streams.personal.linkedin.enabled = body.enabled;
    else if (src === 'slack') config.streams.business.slack.enabled = body.enabled;
    saveConfig(config);
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // POST /api/add-recipient
  if (pathname === '/api/add-recipient' && body.email) {
    var config = loadConfig();
    if (!config.delivery.email.recipients.includes(body.email)) {
      config.delivery.email.recipients.push(body.email);
      saveConfig(config);
    }
    res.end(JSON.stringify({ ok: true, recipients: config.delivery.email.recipients }));
    return;
  }

  // POST /api/remove-recipient
  if (pathname === '/api/remove-recipient' && body.email) {
    var config = loadConfig();
    config.delivery.email.recipients = config.delivery.email.recipients.filter(function(e) { return e !== body.email; });
    saveConfig(config);
    res.end(JSON.stringify({ ok: true, recipients: config.delivery.email.recipients }));
    return;
  }

  // GET /api/recipients
  if (pathname === '/api/recipients') {
    var config = loadConfig();
    res.end(JSON.stringify({ recipients: config.delivery.email.recipients || [] }));
    return;
  }

  // GET /api/session-health — connection age and expiry status for WhatsApp/LinkedIn
  if (pathname === '/api/session-health') {
    res.end(JSON.stringify(getHealthSummary()));
    return;
  }

  // GET /api/collected-data-stats — lightweight summary of last collection run
  if (pathname === '/api/collected-data-stats') {
    var dataFile = require('path').join(PATHS.output(), 'collected-data.json');
    if (!fs.existsSync(dataFile)) {
      res.writeHead(404); res.end(JSON.stringify({ error: 'No data yet' })); return;
    }
    try {
      var d = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      res.end(JSON.stringify({
        collectedAt: d.collectedAt || null,
        linkedin: {
          count: (d.personal && Array.isArray(d.personal.linkedin)) ? d.personal.linkedin.length : null,
        },
        whatsapp: {
          count: (d.personal && Array.isArray(d.personal.whatsapp)) ? d.personal.whatsapp.length : null,
        },
        gmail: {
          work:     (d.work    && Array.isArray(d.work.emails))     ? d.work.emails.length     : null,
          personal: (d.personal && Array.isArray(d.personal.emails)) ? d.personal.emails.length : null,
        }
      }));
    } catch (e) {
      res.writeHead(500); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  // GET /api/test-calendar — run the calendar collector now and report what it sees
  if (pathname === '/api/test-calendar') {
    (async function() {
      try {
        var config = loadConfig();
        var calCfg = config.streams.business.calendar;
        var collectCalendar = require('./collectors/calendar').collectCalendar;
        var events = await collectCalendar(calCfg);
        var cals = {};
        events.forEach(function(e) { cals[e.calendarName || 'Primary'] = (cals[e.calendarName || 'Primary'] || 0) + 1; });
        res.end(JSON.stringify({
          ok: true,
          count: events.length,
          byCalendar: cals,
          sample: events.slice(0, 5).map(function(e) { return e.time + ' — ' + e.title + ' (' + (e.calendarName || 'Primary') + ')'; }),
        }));
      } catch (e) {
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    })();
    return;
  }

  // GET /api/zoom-status — check Zoom S2S credentials and try to authenticate
  if (pathname === '/api/zoom-status') {
    var haveCreds = !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
    if (!haveCreds) {
      res.end(JSON.stringify({ ok: false, configured: false, error: 'Zoom credentials not set. Add ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET in Railway.' }));
      return;
    }
    var getToken = require('./collectors/zoom').getToken;
    getToken().then(function() {
      res.end(JSON.stringify({ ok: true, configured: true, message: 'Connected — Zoom credentials valid.' }));
    }).catch(function(e) {
      res.end(JSON.stringify({ ok: false, configured: true, error: e.message }));
    });
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'Not found' }));
}

// ─── OAuth Callback ───

async function handleAuthCallback(req, res, query) {
  if (!query.code) {
    res.end('No code received');
    return;
  }
  try {
    var creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf8'));
    var c = creds.installed || creds.web;
    var google = require('googleapis').google;
    var oauth2 = new google.auth.OAuth2(c.client_id, c.client_secret, (process.env.DASHBOARD_URL || 'http://localhost:' + PORT) + '/auth/callback');
    var result = await oauth2.getToken(query.code);
    var tokens = result.tokens;

    fs.writeFileSync(PATHS.googleToken(pendingAuthEmail), JSON.stringify(tokens, null, 2));

    res.writeHead(200, { 'Content-Type': 'text/html' });
    var successHtml = '<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;background:#f8f9fb">'
      + '<div style="text-align:center"><h2 style="color:#1e8449">' + escHtml(pendingAuthEmail) + ' authorized!</h2>'
      + '<p>Go back to the <a href="http://localhost:' + PORT + '">settings page</a>.</p></div></body></html>';
    res.end(successHtml);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    var errorHtml = '<h2>Error: ' + escHtml(e.message) + '</h2><p><a href="http://localhost:' + PORT + '">Back to settings</a></p>';
    res.end(errorHtml);
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── HTML Page ───

function getHTML() {
  var html = '';
  html += '<!DOCTYPE html>';
  html += '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">';
  html += '<title>Daily Briefing Settings</title>';
  html += '<style>';
  html += '*{margin:0;padding:0;box-sizing:border-box}';
  html += 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#f8f9fb;color:#1a2332;padding:24px;max-width:800px;margin:0 auto}';
  html += 'h1{font-size:22px;font-weight:700;color:#1a3c5e;margin-bottom:4px}';
  html += '.sub{font-size:13px;color:#6b7a8d;margin-bottom:24px}';
  html += '.card{background:#fff;border:1px solid #e8ecf1;border-radius:10px;padding:16px;margin-bottom:14px}';
  html += '.card h2{font-size:14px;font-weight:700;color:#1a3c5e;margin-bottom:10px;display:flex;align-items:center;gap:8px}';
  html += '.row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f0f2f5}';
  html += '.row:last-child{border-bottom:none}';
  html += '.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}';
  html += '.dot-ok{background:#1e8449}.dot-no{background:#d35400}.dot-off{background:#aab}';
  html += '.email{font-size:13px;flex:1}';
  html += '.tag{font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px}';
  html += '.tag-ok{background:#d5f5e3;color:#1e8449}.tag-no{background:#fef5e7;color:#d35400}.tag-off{background:#f0f2f5;color:#8e9baa}';
  html += '.btn{padding:6px 14px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;border:none;transition:all .15s}';
  html += '.btn-blue{background:#2e86ab;color:#fff}.btn-blue:hover{background:#256d8b}';
  html += '.btn-red{background:#fff;color:#c0392b;border:1px solid #fadbd8}.btn-red:hover{background:#fadbd8}';
  html += '.btn-green{background:#1e8449;color:#fff}.btn-green:hover{background:#196f3d}';
  html += '.btn-gray{background:#f0f2f5;color:#5d6d7e;border:1px solid #e8ecf1}.btn-gray:hover{background:#e8ecf1}';
  html += '.btn:disabled{opacity:.5;cursor:wait}';
  html += '.input-row{display:flex;gap:8px;margin-top:10px}';
  html += '.input-row input{flex:1;padding:8px 12px;font-size:13px;border:1px solid #d5d8dc;border-radius:6px;outline:none;font-family:inherit}';
  html += '.input-row input:focus{border-color:#2e86ab}';
  html += '.status-bar{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}';
  html += '.stat{background:#fff;border:1px solid #e8ecf1;border-radius:8px;padding:10px 14px;flex:1;min-width:120px}';
  html += '.stat .label{font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7a8d;letter-spacing:.5px}';
  html += '.stat .value{font-size:20px;font-weight:700;color:#1a3c5e;margin-top:2px}';
  html += '.stat .note{font-size:10px;color:#8e9baa}';
  html += '.source-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f2f5;font-size:13px}';
  html += '.source-row:last-child{border-bottom:none}';
  html += '.briefing-frame{border:none;width:100%;height:500px;border-radius:8px}';
  html += '.tabs{display:flex;gap:4px;margin-bottom:16px}';
  html += '.tab{padding:8px 16px;font-size:13px;font-weight:600;color:#6b7a8d;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}';
  html += '.tab:hover{color:#1a3c5e}.tab.on{color:#2e86ab;border-bottom-color:#2e86ab}';
  html += '.panel{display:none}.panel.on{display:block}';
  html += '.schedule-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}';
  html += '.schedule-row input,.schedule-row select{padding:6px 10px;font-size:13px;border:1px solid #d5d8dc;border-radius:6px;font-family:inherit}';
  html += '.msg{font-size:12px;padding:8px 12px;border-radius:6px;margin-top:8px}';
  html += '.msg-ok{background:#d5f5e3;color:#1e8449}.msg-err{background:#fadbd8;color:#c0392b}';
  html += '.acct-row{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f0f2f5;font-size:13px}';
  html += '.acct-row:last-child{border-bottom:none}';
  html += '.acct-label{flex:1}';
  html += '</style></head>';
  html += '<body>';

  // Header
  html += '<h1>Daily Briefing</h1>';
  html += '<div class="sub">Settings & Status Dashboard</div>';

  // Tabs
  html += '<div class="tabs">';
  html += '  <div class="tab on" onclick="showTab(\'settings\', this)">Settings</div>';
  html += '  <div class="tab" onclick="showTab(\'briefing\', this)">Last Briefing</div>';
  html += '</div>';

  // ─── Settings Panel ───
  html += '<div class="panel on" id="p-settings">';

  // Status bar
  html += '<div class="status-bar" id="statusBar"></div>';

  // Admin Setup card
  html += '<div class="card" style="border-left:3px solid #2e86ab">';
  html += '  <h2>Admin Setup (First Time Only)</h2>';
  html += '  <p style="font-size:12px;color:#6b7a8d;margin-bottom:10px">Before adding Gmail accounts, the admin must add each email as a test user in Google Cloud:</p>';
  html += '  <a href="https://console.cloud.google.com/auth/audience" target="_blank" class="btn btn-blue" style="text-decoration:none;display:inline-block;margin-bottom:8px">1. Add Test Users</a> ';
  html += '  <a href="https://console.cloud.google.com/auth/clients" target="_blank" class="btn btn-gray" style="text-decoration:none;display:inline-block;margin-bottom:8px">2. Add Redirect URIs</a>';
  html += '  <p style="font-size:11px;color:#8e9baa;margin-top:6px">Step 1: Add every email that will be connected as a test user.</p>';
  html += '  <p style="font-size:11px;color:#8e9baa">Step 2: In OAuth client settings, add both redirect URIs:<br><code style="background:#f0f2f5;padding:2px 6px;border-radius:3px;font-size:10px">http://localhost:3001/auth/callback</code> and <code style="background:#f0f2f5;padding:2px 6px;border-radius:3px;font-size:10px">http://localhost:3002/callback</code></p>';
  html += '</div>';

  // Gmail Accounts card
  html += '<div class="card">';
  html += '  <h2>Gmail Accounts</h2>';
  html += '  <div id="gmailList"></div>';
  html += '  <div class="input-row">';
  html += '    <input type="email" id="newGmail" placeholder="Enter Gmail address to add...">';
  html += '    <button class="btn btn-blue" onclick="addGmail()">Add & Authorize</button>';
  html += '  </div>';
  html += '  <div id="gmailMsg"></div>';
  html += '</div>';

  // Schedule card
  html += '<div class="card">';
  html += '  <h2>Briefing Schedule</h2>';
  html += '  <div class="schedule-row">';
  html += '    <label>Generate at:</label>';
  html += '    <input type="time" id="schedTime" value="06:45">';
  html += '    <label>Days:</label>';
  html += '    <select id="schedDays">';
  html += '      <option value="weekdays">Weekdays (Mon-Fri)</option>';
  html += '      <option value="daily">Every day</option>';
  html += '    </select>';
  html += '    <label>Timezone:</label>';
  html += '    <select id="schedTZ">';
  html += '      <option value="Europe/London">London (GMT/BST)</option>';
  html += '      <option value="Asia/Kolkata">India (IST)</option>';
  html += '      <option value="US/Eastern">US Eastern</option>';
  html += '      <option value="US/Pacific">US Pacific</option>';
  html += '      <option value="UTC">UTC</option>';
  html += '    </select>';
  html += '    <label>Look back:</label>';
  html += '    <select id="schedLookback">';
  html += '      <option value="24">Last 24 hours</option>';
  html += '      <option value="48">Last 48 hours</option>';
  html += '      <option value="72">Last 72 hours (3 days)</option>';
  html += '      <option value="120">Last 5 days</option>';
  html += '      <option value="168">Last 7 days</option>';
  html += '    </select>';
  html += '    <button class="btn btn-blue" onclick="saveSchedule()">Save</button>';
  html += '  </div>';
  html += '  <div style="margin-top:12px;padding:12px;background:#eaf6ea;border-radius:8px;border:1px solid #b8dab8">';
  html += '    <label style="font-size:13px;font-weight:600;color:#1e6e1e;cursor:pointer;display:flex;align-items:center;gap:8px">';
  html += '      <input type="checkbox" id="autoScheduleEnabled" style="width:16px;height:16px">';
  html += '      Auto-schedule: collect data at 6:30 AM, deliver briefing at 8:00 AM daily';
  html += '    </label>';
  html += '    <div id="autoScheduleDetails" style="display:none;margin-top:10px;padding-top:10px;border-top:1px solid #b8dab8">';
  html += '      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">';
  html += '        <div><label style="font-size:12px;color:#2e6e2e">Collect data at:</label><br><input type="time" id="collectAt" value="06:30" style="margin-top:4px"></div>';
  html += '        <div style="font-size:20px;color:#5d9b5d;padding-top:14px">&#8594;</div>';
  html += '        <div><label style="font-size:12px;color:#2e6e2e">Deliver briefing at:</label><br><input type="time" id="deliverAtTime" value="08:00" style="margin-top:4px"></div>';
  html += '      </div>';
  html += '      <p style="font-size:11px;color:#4a8a4a;margin:8px 0 0">System collects from all sources at the first time, then generates the AI briefing and emails the .docx at the second time.</p>';
  html += '    </div>';
  html += '  </div>';
  html += '  <div style="margin-top:8px"><label style="font-size:12px;color:#5d6d7e;cursor:pointer"><input type="checkbox" id="mondayAuto" checked style="margin-right:6px">Auto-extend to 72 hours on Mondays (weekend coverage)</label></div>';
  html += '  <div id="schedMsg"></div>';
  html += '</div>';

  // Other Sources card
  html += '<div class="card">';
  html += '  <h2>Other Sources</h2>';
  html += '  <div id="sourcesList"></div>';
  html += '</div>';

  // WhatsApp Accounts card
  html += '<div class="card">';
  html += '  <h2>WhatsApp Accounts</h2>';
  html += '  <div id="waHealthBanner"></div>';
  html += '  <div id="waList"></div>';
  html += '  <div style="margin-bottom:10px">';
  html += '    <button class="btn btn-blue" id="waTabQR" onclick="showWATab(\'qr\')" style="margin-right:6px">Scan QR Code</button>';
  html += '    <button class="btn" id="waTabPhone" onclick="showWATab(\'phone\')" style="background:#f0f4f8;color:#333">Link with Phone Number</button>';
  html += '  </div>';
  html += '  <div id="waTabQRContent">';
  html += '    <div class="input-row">';
  html += '      <input type="text" id="newWA" placeholder="Label (e.g. Alex Business)">';
  html += '      <button class="btn btn-blue" onclick="addWhatsApp()">Start QR Setup</button>';
  html += '    </div>';
  html += '  </div>';
  html += '  <div id="waTabPhoneContent" style="display:none">';
  html += '    <div class="input-row">';
  html += '      <input type="text" id="newWAPhone" placeholder="Label (e.g. Alex Business)">';
  html += '      <input type="tel" id="waPhoneNumber" placeholder="Phone number with country code (e.g. +447700900000)">';
  html += '      <button class="btn btn-blue" onclick="addWhatsAppByPhone()">Get Code</button>';
  html += '    </div>';
  html += '    <div id="waCodeDisplay" style="display:none;margin-top:12px;padding:14px;background:#f8f9fa;border-radius:8px;text-align:center">';
  html += '      <p style="font-size:12px;color:#555;margin-bottom:6px">Enter this code in WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device &rarr; Link with phone number</p>';
  html += '      <div id="waCodeText" style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#1a1a2e;margin:8px 0"></div>';
  html += '      <p style="font-size:11px;color:#888">Code expires after ~60 seconds &mdash; if it expires, click Get Code again</p>';
  html += '    </div>';
  html += '  </div>';
  html += '  <div id="waMsg"></div>';
  html += '  <div id="waQR" style="display:none;margin-top:16px;text-align:center">';
  html += '    <p style="font-size:13px;color:#555;margin-bottom:8px">Scan with Alex\'s phone &rarr; WhatsApp &rarr; Settings &rarr; Linked Devices &rarr; Link a Device</p>';
  html += '    <img id="waQRImg" src="" style="width:100%;max-width:640px;border:1px solid #ddd;border-radius:8px">';
  html += '  </div>';
  html += '</div>';

  // Zoom card (replaces LinkedIn) — official Server-to-Server OAuth
  html += '<div class="card">';
  html += '  <h2>Zoom</h2>';
  html += '  <p style="font-size:12px;color:#6b7a8d;margin-bottom:8px">Enriches the calendar with Zoom meetings and adds AI Companion meeting notes to the briefing. Uses Zoom\'s official API — set credentials in Railway Variables.</p>';
  html += '  <div id="zoomStatus" style="font-size:13px;margin-bottom:8px">Checking...</div>';
  html += '  <button class="btn" style="background:#e8f4fd;color:#1a5276;border:1px solid #85c1e9" onclick="testZoom()">Test Zoom Connection</button>';
  html += '  <div id="zoomMsg"></div>';
  html += '  <p style="font-size:11px;color:#8e9baa;margin-top:8px">Needs a Server-to-Server OAuth app (marketplace.zoom.us): ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, ZOOM_CLIENT_SECRET. Meeting notes require a paid plan with AI Companion + Meeting Summary enabled.</p>';
  html += '</div>';

  // Slack card
  html += '<div class="card">';
  html += '  <h2>Slack</h2>';
  html += '  <div style="font-size:13px;margin-bottom:10px"><span id="slackStatus">Checking...</span></div>';
  html += '  <div class="input-row">';
  html += '    <input type="text" id="slackToken" placeholder="Paste Slack Bot Token (xoxb-...)">';
  html += '    <button class="btn btn-blue" onclick="saveSlack()">Save Token</button>';
  html += '  </div>';
  html += '  <p style="font-size:11px;color:#8e9baa;margin-top:6px">Get token from <a href="https://api.slack.com/apps" target="_blank">api.slack.com/apps</a> - Your App - OAuth & Permissions</p>';
  html += '  <div id="slackMsg"></div>';
  html += '</div>';

  // Email Delivery card
  html += '<div class="card">';
  html += '  <h2>Email Delivery</h2>';
  html += '  <p style="font-size:12px;color:#6b7a8d;margin-bottom:8px">The briefing .docx will be emailed to these recipients automatically.</p>';
  html += '  <div id="emailRecipients"></div>';
  html += '  <div class="input-row">';
  html += '    <input type="email" id="newRecipient" placeholder="Email address to receive briefing">';
  html += '    <button class="btn btn-blue" onclick="addRecipient()">Add</button>';
  html += '  </div>';
  html += '  <div style="margin-top:10px"><button class="btn" style="background:#e8f4fd;color:#1a5276;border:1px solid #85c1e9" onclick="sendTestEmail()">Send Test Email</button></div>';
  html += '  <div id="emailMsg"></div>';
  html += '</div>';

  // Actions card
  html += '<div class="card">';
  html += '  <h2>Actions</h2>';
  html += '  <div style="display:flex;gap:8px;flex-wrap:wrap">';
  html += '    <button class="btn btn-green" onclick="runBriefing()">Generate Briefing Now</button>';
  html += '    <button class="btn btn-gray" onclick="testGmail()">Test Gmail Connections</button>';
  html += '    <button class="btn btn-gray" onclick="testCalendar()">Test Calendar</button>';
  html += '    <button class="btn btn-gray" onclick="refresh()">Refresh Status</button>';
  html += '  </div>';
  html += '  <div id="calMsg" style="margin-top:8px"></div>';
  html += '  <div id="progressBar" style="display:none;margin-top:10px">';
  html += '    <div style="background:#e8ecf1;border-radius:8px;overflow:hidden;height:24px">';
  html += '      <div id="progressFill" style="background:#2e86ab;height:100%;width:0%;transition:width 0.5s;display:flex;align-items:center;justify-content:center">';
  html += '        <span id="progressPct" style="color:#fff;font-size:11px;font-weight:600"></span>';
  html += '      </div>';
  html += '    </div>';
  html += '    <div id="progressMsg" style="font-size:12px;color:#6b7a8d;margin-top:4px"></div>';
  html += '  </div>';
  html += '  <div id="actionMsg"></div>';
  html += '</div>';

  html += '</div>'; // end settings panel

  // ─── Briefing Panel ───
  html += '<div class="panel" id="p-briefing">';
  html += '  <div class="card">';
  html += '    <h2>Last Generated Briefing</h2>';
  html += '    <div id="briefingContent"><div style="color:#8e9baa;font-style:italic;padding:20px;text-align:center">No briefing generated yet. Click "Generate Briefing Now" in Settings.</div></div>';
  html += '  </div>';
  html += '</div>';

  // ─── JavaScript ───
  html += '<script>';

  // Tab switching
  html += 'function showTab(name, el) {';
  html += '  document.querySelectorAll(".tab").forEach(function(t) { t.classList.remove("on"); });';
  html += '  document.querySelectorAll(".panel").forEach(function(p) { p.classList.remove("on"); });';
  html += '  el.classList.add("on");';
  html += '  document.getElementById("p-" + name).classList.add("on");';
  html += '  if (name === "briefing") loadBriefing();';
  html += '}';

  // API helper
  html += 'function api(path, body) {';
  html += '  var opts = body ? { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) } : {};';
  html += '  return fetch("/api/" + path, opts).then(function(r) { return r.json(); });';
  html += '}';

  // Stat helper
  html += 'function stat(label, value, type) {';
  html += '  var colors = { ok: "#1e8449", warn: "#d35400", err: "#c0392b", off: "#8e9baa" };';
  html += '  var color = colors[type] || "#1a3c5e";';
  html += '  return \'<div class="stat"><div class="label">\' + label + \'</div><div class="value" style="color:\' + color + \'">\' + value + \'</div></div>\';';
  html += '}';

  // HTML escape helper
  html += 'function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }';

  // Render account list (WhatsApp or LinkedIn)
  html += 'function renderAccounts(containerId, accounts, removeFunc) {';
  html += '  var el = document.getElementById(containerId);';
  html += '  if (!accounts || accounts.length === 0) {';
  html += '    el.innerHTML = \'<div style="color:#8e9baa;font-size:13px;padding:6px 0">No accounts added yet.</div>\';';
  html += '    return;';
  html += '  }';
  html += '  var h = "";';
  html += '  for (var i = 0; i < accounts.length; i++) {';
  html += '    var a = accounts[i];';
  html += '    var dotCls = a.hasSession ? "dot-ok" : "dot-no";';
  html += '    var tagCls = a.hasSession ? "tag-ok" : "tag-no";';
  html += '    var tagText = a.hasSession ? "Connected" : "Pending";';
  html += '    var isWA = containerId === "waList";';
  html += '    var isLI = containerId === "liList";';
  html += '    h += \'<div class="acct-row">\';';
  html += '    h += \'<div class="dot \' + dotCls + \'"></div>\';';
  html += '    h += \'<div class="acct-label">\' + esc(a.label) + \'</div>\';';
  html += '    h += \'<span class="tag \' + tagCls + \'">\' + tagText + \'</span>\';';
  html += '    if (isWA) h += \'<button class="btn" style="padding:3px 10px;font-size:11px;background:#fff3cd;color:#856404;border:1px solid #ffc107;margin-right:4px" onclick="resetWhatsApp(\\x27\' + a.id + \'\\x27)">Reset</button>\';';
  html += '    if (isLI && a.hasSession) h += \'<button class="btn" style="padding:3px 10px;font-size:11px;background:#e8f4fd;color:#1a5276;border:1px solid #85c1e9;margin-right:4px" onclick="verifyLinkedIn(\\x27\' + a.id + \'\\x27)">Verify Now</button>\';';
  html += '    h += \'<button class="btn btn-red" style="padding:3px 10px;font-size:11px" onclick="\' + removeFunc + \'(\\x27\' + a.id + \'\\x27)">Remove</button>\';';
  html += '    h += \'</div>\';';
  html += '  }';
  html += '  el.innerHTML = h;';
  html += '}';

  // Refresh status
  html += 'function refresh() {';
  html += '  api("status").then(function(s) {';
  // Status bar
  html += '    var gmailAuth = s.gmail.filter(function(g) { return g.authorized; }).length;';
  html += '    var gmailTotal = s.gmail.length;';
  html += '    var gmailType = (gmailTotal > 0 && gmailAuth === gmailTotal) ? "ok" : "warn";';
  html += '    document.getElementById("statusBar").innerHTML = ';
  html += '      stat("Gmail", gmailAuth + "/" + gmailTotal, gmailType)';
  html += '      + stat("API Key", s.apiKey ? "OK" : "Missing", s.apiKey ? "ok" : "err")';
  html += '      + stat("Credentials", s.credentials ? "OK" : "Missing", s.credentials ? "ok" : "err")';
  html += '      + stat("Slack", s.slackToken ? "OK" : "--", s.slackToken ? "ok" : "off");';
  // Gmail list
  html += '    var gl = document.getElementById("gmailList");';
  html += '    if (s.gmail.length === 0) {';
  html += '      gl.innerHTML = \'<div style="color:#8e9baa;font-size:13px;padding:8px 0">No Gmail accounts added yet.</div>\';';
  html += '    } else {';
  html += '      var gh = "";';
  html += '      for (var i = 0; i < s.gmail.length; i++) {';
  html += '        var g = s.gmail[i];';
  html += '        var dotCls = g.authorized ? "dot-ok" : "dot-no";';
  html += '        var tagCls = g.authorized ? "tag-ok" : "tag-no";';
  html += '        var tagText = g.authorized ? "Authorized" : "Needs Auth";';
  html += '        gh += \'<div class="row">\';';
  html += '        gh += \'<div class="dot \' + dotCls + \'"></div>\';';
  html += '        gh += \'<div class="email">\' + esc(g.email) + \'</div>\';';
  html += '        gh += \'<span class="tag \' + tagCls + \'">\' + tagText + \'</span>\';';
  html += '        if (!g.authorized) {';
  html += '          gh += \'<button class="btn btn-blue" style="padding:3px 10px;font-size:11px" onclick="reauth(\\x27\' + g.email + \'\\x27)">Authorize</button>\';';
  html += '        }';
  html += '        gh += \'<button class="btn btn-red" style="padding:3px 10px;font-size:11px" onclick="removeGmail(\\x27\' + g.email + \'\\x27)">Remove</button>\';';
  html += '        gh += \'</div>\';';
  html += '      }';
  html += '      gl.innerHTML = gh;';
  html += '    }';
  // Schedule
  html += '    document.getElementById("schedTime").value = s.schedule.generateAt || "06:45";';
  html += '    var lb = s.lookbackHours || 24;';
  html += '    document.getElementById("schedLookback").value = String(lb);';
  html += '    if (s.schedule.timezone) document.getElementById("schedTZ").value = s.schedule.timezone;';
  html += '    document.getElementById("mondayAuto").checked = s.schedule.mondayAutoExtend !== false;';
  html += '    var autoSched = !!s.schedule.autoScheduleEnabled;';
  html += '    document.getElementById("autoScheduleEnabled").checked = autoSched;';
  html += '    document.getElementById("autoScheduleDetails").style.display = autoSched ? "block" : "none";';
  html += '    if (s.schedule.collectAt) document.getElementById("collectAt").value = s.schedule.collectAt;';
  html += '    if (s.schedule.deliverAtTime) document.getElementById("deliverAtTime").value = s.schedule.deliverAtTime;';
  // Slack status
  html += '    document.getElementById("slackStatus").innerHTML = s.slackToken ? \'<span class="tag tag-ok">Token configured</span>\' : \'<span class="tag tag-off">No token</span>\';';
  // Sources
  html += '    var sources = [';
  html += '      ["Calendar", s.sources.calendar], ["Slack", s.sources.slack], ["Drive", s.sources.drive],';
  html += '      ["Xero", s.sources.xero], ["iCloud Mail", s.sources.icloud],';
  html += '      ["WhatsApp", s.sources.whatsapp], ["Zoom", s.sources.zoom]';
  html += '    ];';
  html += '    var sh = "";';
  html += '    for (var i = 0; i < sources.length; i++) {';
  html += '      var name = sources[i][0]; var on = sources[i][1];';
  html += '      var cls = on ? "tag-ok" : "tag-off";';
  html += '      var txt = on ? "Enabled" : "Not configured";';
  html += '      sh += \'<div class="source-row"><span>\' + name + \'</span><span class="tag \' + cls + \'">\' + txt + \'</span></div>\';';
  html += '    }';
  html += '    document.getElementById("sourcesList").innerHTML = sh;';
  html += '  });';
  // Also refresh WhatsApp account list + Zoom status
  html += '  api("whatsapp-accounts").then(function(r) { renderAccounts("waList", r.accounts, "removeWhatsApp"); });';
  html += '  loadSessionHealth();';
  html += '  loadZoomStatus();';
  html += '}';

  // Zoom status
  html += 'function loadZoomStatus() {';
  html += '  var el = document.getElementById("zoomStatus"); if (!el) return;';
  html += '  fetch("/api/zoom-status").then(function(r) { return r.json(); }).then(function(s) {';
  html += '    if (s.ok) { el.innerHTML = \'<span class="tag tag-ok">Connected</span>\'; }';
  html += '    else if (!s.configured) { el.innerHTML = \'<span class="tag tag-off">Not configured</span>\'; }';
  html += '    else { el.innerHTML = \'<span class="tag tag-no">Credentials invalid</span>\'; }';
  html += '  }).catch(function() {});';
  html += '}';
  html += 'function testZoom() {';
  html += '  var m = document.getElementById("zoomMsg"); m.className = "msg"; m.textContent = "Testing Zoom connection...";';
  html += '  fetch("/api/zoom-status").then(function(r) { return r.json(); }).then(function(s) {';
  html += '    if (s.ok) { m.className = "msg msg-ok"; m.textContent = s.message || "Connected — Zoom credentials valid."; }';
  html += '    else { m.className = "msg msg-error"; m.textContent = s.error || "Zoom connection failed."; }';
  html += '    loadZoomStatus();';
  html += '  }).catch(function() { m.className = "msg msg-error"; m.textContent = "Could not reach the server."; });';
  html += '}';

  // Session health banners
  html += 'function loadSessionHealth() {';
  html += '  fetch("/api/session-health").then(function(r) { return r.json(); }).then(function(health) {';
  html += '    renderHealthBanner("waHealthBanner", health, "whatsapp");';
  html += '  }).catch(function() {});';
  html += '}';
  html += 'function renderHealthBanner(divId, health, service) {';
  html += '  var el = document.getElementById(divId);';
  html += '  if (!el) return;';
  html += '  var entries = Object.keys(health).filter(function(k) { return k.startsWith(service + ":"); });';
  html += '  if (entries.length === 0) { el.innerHTML = ""; return; }';
  html += '  var html = "";';
  html += '  entries.forEach(function(key) {';
  html += '    var h = health[key];';
  html += '    if (!h.warning) return;';
  html += '    var isExpired = h.status === "expired";';
  html += '    var bg = isExpired ? "#fff0f0" : "#fffbea";';
  html += '    var border = isExpired ? "#f5c6cb" : "#ffe082";';
  html += '    var icon = isExpired ? "🔴" : "🟡";';
  html += '    html += \'<div style="background:\' + bg + \';border:1px solid \' + border + \';border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px">\';';
  html += '    html += icon + " <strong>" + (h.sessionId || key) + ":</strong> " + h.warningMsg;';
  html += '    if (h.lastSuccess) html += \'<br><span style="color:#888;font-size:11px">Last successful collection: \' + new Date(h.lastSuccess).toLocaleString() + \'</span>\';';
  html += '    html += "</div>";';
  html += '  });';
  html += '  el.innerHTML = html;';
  html += '}';

  // Add Gmail
  html += 'function addGmail() {';
  html += '  var email = document.getElementById("newGmail").value.trim();';
  html += '  if (!email) return;';
  html += '  var msg = document.getElementById("gmailMsg");';
  html += '  msg.className = "msg msg-ok"; msg.textContent = "Adding account...";';
  html += '  api("add-gmail", { email: email }).then(function(res) {';
  html += '    if (res.authUrl) {';
  html += '      msg.textContent = "Opening Google sign-in...";';
  html += '      window.open(res.authUrl, "_blank");';
  html += '      setTimeout(function() { refresh(); msg.textContent = "Check if authorized above. If not, click Authorize."; }, 5000);';
  html += '    } else {';
  html += '      msg.className = "msg msg-err"; msg.textContent = res.error || "Failed";';
  html += '    }';
  html += '  });';
  html += '  document.getElementById("newGmail").value = "";';
  html += '}';

  // Reauth Gmail
  html += 'function reauth(email) {';
  html += '  api("add-gmail", { email: email }).then(function(res) {';
  html += '    if (res.authUrl) window.open(res.authUrl, "_blank");';
  html += '    setTimeout(refresh, 5000);';
  html += '  });';
  html += '}';

  // Remove Gmail
  html += 'function removeGmail(email) {';
  html += '  if (!confirm("Remove " + email + "?")) return;';
  html += '  api("remove-gmail", { email: email }).then(function() { refresh(); });';
  html += '}';

  // Test Gmail
  html += 'function testGmail() {';
  html += '  var msg = document.getElementById("actionMsg");';
  html += '  msg.className = "msg msg-ok"; msg.textContent = "Testing connections...";';
  html += '  api("test-gmail").then(function(res) {';
  html += '    var h = "";';
  html += '    for (var i = 0; i < res.results.length; i++) {';
  html += '      var r = res.results[i];';
  html += '      if (r.ok) { h += "<div>OK " + esc(r.email) + " -- " + r.messages.toLocaleString() + " messages</div>"; }';
  html += '      else { h += "<div>FAIL " + esc(r.email) + " -- " + esc(r.error) + "</div>"; }';
  html += '    }';
  html += '    msg.innerHTML = h;';
  html += '  });';
  html += '}';

  // Auto-schedule toggle
  html += 'document.getElementById("autoScheduleEnabled").addEventListener("change", function() {';
  html += '  document.getElementById("autoScheduleDetails").style.display = this.checked ? "block" : "none";';
  html += '});';

  // Save Schedule
  html += 'function saveSchedule() {';
  html += '  var time = document.getElementById("schedTime").value;';
  html += '  var days = document.getElementById("schedDays").value;';
  html += '  var lookbackHours = document.getElementById("schedLookback").value;';
  html += '  var tz = document.getElementById("schedTZ").value;';
  html += '  var mondayAuto = document.getElementById("mondayAuto").checked;';
  html += '  var autoSched = document.getElementById("autoScheduleEnabled").checked;';
  html += '  var collectAt = document.getElementById("collectAt").value;';
  html += '  var deliverAtTime = document.getElementById("deliverAtTime").value;';
  html += '  var payload = { time: time, days: days, lookbackHours: lookbackHours, timezone: tz, mondayAutoExtend: mondayAuto, autoScheduleEnabled: autoSched, collectAt: collectAt, deliverAtTime: deliverAtTime };';
  html += '  api("update-schedule", payload).then(function() {';
  html += '    var m = document.getElementById("schedMsg");';
  html += '    m.className = "msg msg-ok";';
  html += '    if (autoSched) { m.textContent = "Saved: Collect at " + collectAt + ", deliver at " + deliverAtTime + " (" + tz + ")"; }';
  html += '    else { m.textContent = "Saved: Generate at " + time + " (" + tz + "), look back " + lookbackHours + " hours"; }';
  html += '  });';
  html += '}';

  // Test Calendar — runs the collector live and shows what it pulls
  html += 'function testCalendar() {';
  html += '  var m = document.getElementById("calMsg"); m.className = "msg"; m.textContent = "Checking calendar...";';
  html += '  fetch("/api/test-calendar").then(function(r) { return r.json(); }).then(function(d) {';
  html += '    if (!d.ok) { m.className = "msg msg-error"; m.textContent = "Calendar error: " + d.error + " — likely a Google re-auth is needed (try Test Gmail Connections)."; return; }';
  html += '    if (d.count === 0) { m.className = "msg msg-error"; m.textContent = "Calendar connected but 0 events today across all calendars. Check the events sit on this Google account and that it is still today in the London timezone."; return; }';
  html += '    var cals = Object.keys(d.byCalendar).map(function(k){return k+": "+d.byCalendar[k];}).join(", ");';
  html += '    m.className = "msg msg-ok"; m.textContent = d.count + " events today (" + cals + "). e.g. " + d.sample.join("; ");';
  html += '  }).catch(function() { m.className = "msg msg-error"; m.textContent = "Could not reach the server."; });';
  html += '}';

  // Run Briefing
  html += 'var progressInterval = null;';
  html += 'function runBriefing() {';
  html += '  var bar = document.getElementById("progressBar");';
  html += '  var fill = document.getElementById("progressFill");';
  html += '  var pct = document.getElementById("progressPct");';
  html += '  var pmsg = document.getElementById("progressMsg");';
  html += '  var msg = document.getElementById("actionMsg");';
  html += '  bar.style.display = "block";';
  html += '  fill.style.width = "5%"; pct.textContent = "Starting..."; pmsg.textContent = "Launching briefing generator...";';
  html += '  msg.className = "msg msg-ok"; msg.textContent = "";';
  html += '  api("run-briefing");';
  html += '  if (progressInterval) clearInterval(progressInterval);';
  html += '  progressInterval = setInterval(function() {';
  html += '    api("progress").then(function(p) {';
  html += '      if (p && p.pct) {';
  html += '        fill.style.width = Math.max(p.pct, 5) + "%";';
  html += '        pct.textContent = p.pct + "%";';
  html += '        pmsg.textContent = p.message || "Working...";';
  html += '        if (p.pct >= 100) {';
  html += '          clearInterval(progressInterval);';
  html += '          fill.style.width = "100%"; fill.style.background = "#1e8449";';
  html += '          pct.textContent = "Done!";';
  html += '          pmsg.textContent = "Briefing complete! Check the Last Briefing tab.";';
  html += '          msg.className = "msg msg-ok"; msg.textContent = "Briefing saved to output folder (.txt, .html, .docx)";';
  html += '        }';
  html += '      }';
  html += '    });';
  html += '  }, 2000);';
  html += '  setTimeout(function() {';
  html += '    if (progressInterval) { clearInterval(progressInterval); fill.style.width = "100%"; fill.style.background = "#1e8449"; pct.textContent = "Done!"; pmsg.textContent = "Complete — check Last Briefing tab."; }';
  html += '  }, 300000);';
  html += '}';

  // Load Briefing
  html += 'function loadBriefing() {';
  html += '  api("last-briefing").then(function(res) {';
  html += '    var el = document.getElementById("briefingContent");';
  html += '    if (res.ok) {';
  html += '      var escaped = res.html.replace(/"/g, "&quot;");';
  html += '      el.innerHTML = \'<div style="font-size:12px;color:#6b7a8d;margin-bottom:8px">Generated: \' + esc(res.date) + \'</div>\'';
  html += '        + \'<iframe srcdoc="\' + escaped + \'" class="briefing-frame" style="width:100%;max-width:none;overflow-x:hidden"></iframe>\';';
  html += '    }';
  html += '  });';
  html += '}';

  // Add WhatsApp
  html += 'function addWhatsApp() {';
  html += '  var label = document.getElementById("newWA").value.trim();';
  html += '  if (!label) return;';
  html += '  var msg = document.getElementById("waMsg");';
  html += '  msg.className = "msg msg-ok"; msg.textContent = "Starting WhatsApp setup...";';
  html += '  api("add-whatsapp", { label: label }).then(function() {';
  html += '    document.getElementById("newWA").value = "";';
  html += '    msg.textContent = "Loading QR code... (takes ~10 seconds)";';
  html += '    startQRPolling();';
  html += '  });';
  html += '}';
  // QR polling — driven by the collector status file (same deterministic mechanism as phone flow)
  html += 'function startQRPolling() {';
  html += '  var qrBox = document.getElementById("waQR");';
  html += '  var qrImg = document.getElementById("waQRImg");';
  html += '  var msg = document.getElementById("waMsg");';
  html += '  var attempts = 0;';
  html += '  var poll = setInterval(function() {';
  html += '    attempts++;';
  html += '    fetch("/api/whatsapp-setup-status?t=" + Date.now()).then(function(r) { return r.json(); }).then(function(s) {';
  html += '      if (s.state === "connected") {';
  html += '        clearInterval(poll);';
  html += '        qrBox.style.display = "none";';
  html += '        msg.className = "msg msg-ok"; msg.textContent = "WhatsApp connected!";';
  html += '        setTimeout(refresh, 2000);';
  html += '        return;';
  html += '      }';
  html += '      if (s.state === "timeout") {';
  html += '        clearInterval(poll);';
  html += '        msg.className = "msg msg-error";';
  html += '        msg.textContent = "QR was not scanned in time. Click Start QR Setup again with Alex\'s phone ready.";';
  html += '        return;';
  html += '      }';
  html += '      if (s.state === "awaiting_scan") {';
  html += '        qrImg.src = "/api/whatsapp-qr-image?t=" + Date.now();';
  html += '        qrBox.style.display = "block";';
  html += '        msg.className = "msg msg-ok";';
  html += '        msg.textContent = "Scan this QR with Alex\'s phone: WhatsApp > Settings > Linked Devices > Link a Device";';
  html += '      } else if (s.state === "starting") {';
  html += '        msg.textContent = "Loading QR code... (" + attempts + "s)";';
  html += '      } else if (s.state === "none") {';
  html += '        if (attempts > 30) { clearInterval(poll); msg.className = "msg msg-error"; msg.textContent = "Setup did not start — check Railway logs and try again."; }';
  html += '        else { msg.textContent = "Starting... (" + attempts + "s)"; }';
  html += '      }';
  html += '    }).catch(function() {});';
  html += '  }, 2000);';
  html += '}';

  // WhatsApp tab toggle
  html += 'function showWATab(tab) {';
  html += '  document.getElementById("waTabQRContent").style.display = tab === "qr" ? "" : "none";';
  html += '  document.getElementById("waTabPhoneContent").style.display = tab === "phone" ? "" : "none";';
  html += '  document.getElementById("waTabQR").className = tab === "qr" ? "btn btn-blue" : "btn";';
  html += '  document.getElementById("waTabQR").style = tab === "qr" ? "margin-right:6px" : "margin-right:6px;background:#f0f4f8;color:#333";';
  html += '  document.getElementById("waTabPhone").className = tab === "phone" ? "btn btn-blue" : "btn";';
  html += '  document.getElementById("waTabPhone").style = tab === "phone" ? "" : "background:#f0f4f8;color:#333";';
  html += '}';

  // Add WhatsApp by phone number
  html += 'function addWhatsAppByPhone() {';
  html += '  var label = document.getElementById("newWAPhone").value.trim();';
  html += '  var phone = document.getElementById("waPhoneNumber").value.trim();';
  html += '  if (!label || !phone) { document.getElementById("waMsg").textContent = "Enter a label and phone number."; return; }';
  html += '  var msg = document.getElementById("waMsg");';
  html += '  msg.className = "msg msg-ok"; msg.textContent = "Starting phone linking... takes ~10 seconds";';
  html += '  api("add-whatsapp-phone", { label: label, phone: phone }).then(function() {';
  html += '    document.getElementById("newWAPhone").value = "";';
  html += '    msg.textContent = "Waiting for code to appear...";';
  html += '    startPhoneCodePolling();';
  html += '  });';
  html += '}';

  // Poll setup STATUS (written by the collector) — deterministic, no guessing from image 404s
  html += 'function startPhoneCodePolling() {';
  html += '  var codeDisplay = document.getElementById("waCodeDisplay");';
  html += '  var codeText = document.getElementById("waCodeText");';
  html += '  var qrBox = document.getElementById("waQR");';
  html += '  var qrImg = document.getElementById("waQRImg");';
  html += '  var msg = document.getElementById("waMsg");';
  html += '  var attempts = 0;';
  html += '  var poll = setInterval(function() {';
  html += '    attempts++;';
  html += '    fetch("/api/whatsapp-setup-status?t=" + Date.now()).then(function(r) { return r.json(); }).then(function(s) {';
  html += '      if (s.state === "connected") {';
  html += '        clearInterval(poll);';
  html += '        qrBox.style.display = "none"; codeDisplay.style.display = "none";';
  html += '        msg.className = "msg msg-ok"; msg.textContent = "WhatsApp connected!";';
  html += '        setTimeout(refresh, 2000);';
  html += '        return;';
  html += '      }';
  html += '      if (s.state === "timeout") {';
  html += '        clearInterval(poll);';
  html += '        msg.className = "msg msg-error";';
  html += '        msg.textContent = "The code was not entered in time. Click Get Code again with Alex\'s phone ready.";';
  html += '        return;';
  html += '      }';
  html += '      if (s.state === "phone_unavailable") {';
  html += '        clearInterval(poll);';
  html += '        qrBox.style.display = "none"; codeDisplay.style.display = "none";';
  html += '        msg.className = "msg msg-error";';
  html += '        msg.textContent = "Phone linking is not available right now. Please use the QR Code tab instead — it is working.";';
  html += '        return;';
  html += '      }';
  // starting / awaiting_code / code_ready — always show the live screenshot
  html += '      qrImg.src = "/api/whatsapp-qr-image?t=" + Date.now();';
  html += '      qrBox.style.display = "block";';
  html += '      if (s.state === "code_ready" && s.code) {';
  html += '        codeText.textContent = s.code;';
  html += '        codeDisplay.style.display = "block";';
  html += '        msg.className = "msg msg-ok";';
  html += '        msg.textContent = "Code ready — enter it in WhatsApp on Alex\'s phone now (expires ~60s)";';
  html += '      } else if (s.state === "awaiting_code") {';
  html += '        msg.textContent = "Read the code from the screenshot below and enter it in WhatsApp on Alex\'s phone";';
  html += '      } else if (s.state === "starting") {';
  html += '        msg.textContent = "Loading WhatsApp Web... (" + attempts + "s)";';
  html += '      } else if (s.state === "none") {';
  html += '        if (attempts > 30) { clearInterval(poll); msg.className = "msg msg-error"; msg.textContent = "Setup did not start — check Railway logs and try again."; }';
  html += '        else { msg.textContent = "Starting... (" + attempts + "s)"; }';
  html += '      }';
  html += '    }).catch(function() {});';
  html += '  }, 2000);';
  html += '}';

  // Reset WhatsApp session (wipes session dir so fresh setup can proceed)
  html += 'function resetWhatsApp(id) {';
  html += '  if (!confirm("This clears the saved session so you can run a fresh QR/phone setup. Continue?")) return;';
  html += '  api("reset-whatsapp", { id: id }).then(function() {';
  html += '    document.getElementById("waMsg").className = "msg msg-ok";';
  html += '    document.getElementById("waMsg").textContent = "Session cleared — use QR or phone link to reconnect.";';
  html += '    refresh();';
  html += '  });';
  html += '}';

  // Remove WhatsApp
  html += 'function removeWhatsApp(id) {';
  html += '  if (!confirm("Remove this WhatsApp account?")) return;';
  html += '  api("remove-whatsapp", { id: id }).then(function() { refresh(); });';
  html += '}';

  // Add LinkedIn
  html += 'function addLinkedIn() {';
  html += '  var label = document.getElementById("newLI").value.trim();';
  html += '  var email = document.getElementById("liEmail").value.trim();';
  html += '  var pass = document.getElementById("liPass").value;';
  html += '  if (!label || !email || !pass) { document.getElementById("liMsg").textContent = "Fill in label, email and password."; return; }';
  html += '  var msg = document.getElementById("liMsg");';
  html += '  msg.className = "msg msg-ok"; msg.textContent = "Starting LinkedIn login...";';
  html += '  api("add-linkedin", { label: label, email: email, password: pass }).then(function() {';
  html += '    document.getElementById("newLI").value = "";';
  html += '    document.getElementById("liEmail").value = "";';
  html += '    document.getElementById("liPass").value = "";';
  html += '    msg.textContent = "Logging in... live view loading below.";';
  html += '    startLinkedInPolling();';
  html += '  });';
  html += '}';
  // LinkedIn login polling — driven by the collector status file. Shows the live
  // login view, and on success keeps the logged-in screenshot up as visual proof.
  html += 'function startLinkedInPolling() {';
  html += '  var qrBox = document.getElementById("liQR");';
  html += '  var qrImg = document.getElementById("liQRImg");';
  html += '  var msg = document.getElementById("liMsg");';
  html += '  var attempts = 0;';
  html += '  var poll = setInterval(function() {';
  html += '    attempts++;';
  html += '    fetch("/api/linkedin-setup-status?t=" + Date.now()).then(function(r) { return r.json(); }).then(function(s) {';
  html += '      if (s.state === "logged_in") {';
  html += '        clearInterval(poll);';
  html += '        qrImg.src = "/api/linkedin-screenshot?t=" + Date.now();';
  html += '        qrBox.style.display = "block";';
  html += '        msg.className = "msg msg-ok";';
  html += '        msg.textContent = "You are in — logged into the account. The view below confirms it.";';
  html += '        setTimeout(refresh, 3000);';
  html += '        return;';
  html += '      }';
  html += '      if (s.state === "login_failed") {';
  html += '        clearInterval(poll);';
  html += '        qrImg.src = "/api/linkedin-screenshot?t=" + Date.now();';
  html += '        qrBox.style.display = "block";';
  html += '        msg.className = "msg msg-error";';
  html += '        msg.textContent = "Login not confirmed. Check the view below (2FA code, captcha, or wrong password) and try again.";';
  html += '        return;';
  html += '      }';
  html += '      if (s.state === "awaiting_login") {';
  html += '        qrImg.src = "/api/linkedin-screenshot?t=" + Date.now();';
  html += '        qrBox.style.display = "block";';
  html += '        msg.className = "msg msg-ok";';
  html += '        msg.textContent = "Logging in — live view below. If it asks for a 2FA code, enter it in the box.";';
  html += '      } else if (s.state === "starting") {';
  html += '        msg.textContent = "Opening LinkedIn... (" + attempts + "s)";';
  html += '      } else if (s.state === "none") {';
  html += '        if (attempts > 40) { clearInterval(poll); msg.className = "msg msg-error"; msg.textContent = "Login did not start — check Railway logs and try again."; }';
  html += '        else { msg.textContent = "Starting... (" + attempts + "s)"; }';
  html += '      }';
  html += '    }).catch(function() {});';
  html += '  }, 3000);';
  html += '}';
  html += 'function submitLinkedInCode() {';
  html += '  var code = document.getElementById("liCode").value.trim();';
  html += '  if (!code) return;';
  html += '  api("linkedin-2fa", { code: code }).then(function() { document.getElementById("liCode").value = ""; });';
  html += '}';

  // Remove LinkedIn
  html += 'function removeLinkedIn(id) {';
  html += '  if (!confirm("Remove this LinkedIn account?")) return;';
  html += '  api("remove-linkedin", { id: id }).then(function() { refresh(); });';
  html += '}';

  // Verify LinkedIn connection by running a real collection
  html += 'function verifyLinkedIn(id) {';
  html += '  var msg = document.getElementById("liMsg");';
  html += '  msg.className = "msg msg-ok";';
  html += '  msg.textContent = "Running LinkedIn check... takes ~30 seconds";';
  html += '  api("run-linkedin", { id: id }).then(function() {';
  html += '    msg.textContent = "Collection running — checking status in 35 seconds...";';
  html += '    setTimeout(function() {';
  html += '      refresh();';
  html += '      fetch("/api/session-health").then(function(r) { return r.json(); }).then(function(health) {';
  html += '        var liKey = Object.keys(health).find(function(k) { return k.startsWith("linkedin:"); });';
  html += '        if (liKey) {';
  html += '          var h = health[liKey];';
  html += '          if (h.status === "expired") {';
  html += '            msg.className = "msg msg-error";';
  html += '            msg.textContent = "LinkedIn session expired — re-run Connect to log in again.";';
  html += '          } else {';
  html += '            msg.className = "msg msg-ok";';
  html += '            msg.textContent = "LinkedIn verified — session is active. Check Last Collection for message count.";';
  html += '          }';
  html += '        }';
  html += '        loadLinkedInStats();';
  html += '      });';
  html += '    }, 35000);';
  html += '  }).catch(function() {';
  html += '    msg.className = "msg msg-error";';
  html += '    msg.textContent = "Could not start LinkedIn check — see Railway logs.";';
  html += '  });';
  html += '}';

  // Load LinkedIn last-collection stats into the liLastCollection div
  html += 'function loadLinkedInStats() {';
  html += '  fetch("/api/collected-data-stats").then(function(r) { return r.ok ? r.json() : null; }).then(function(d) {';
  html += '    var el = document.getElementById("liLastCollection");';
  html += '    if (!el) return;';
  html += '    if (!d || !d.linkedin) { el.textContent = "No collection run yet."; return; }';
  html += '    var when = d.collectedAt ? new Date(d.collectedAt).toLocaleString() : "unknown time";';
  html += '    var count = d.linkedin.count;';
  html += '    var colour = count > 0 ? "#1e8449" : "#8e9baa";';
  html += '    el.innerHTML = "Last collection: <strong>" + when + "</strong> &mdash; <span style=\\"color:" + colour + "\\">" + count + " conversation" + (count === 1 ? "" : "s") + " captured</span>";';
  html += '  }).catch(function() {});';
  html += '}';

  // Save Slack
  // Email Recipients
  html += 'function loadRecipients() {';
  html += '  api("recipients").then(function(res) {';
  html += '    var el = document.getElementById("emailRecipients");';
  html += '    if (!res.recipients || res.recipients.length === 0) {';
  html += '      el.innerHTML = "<div style=\\"color:#8e9baa;font-size:13px;padding:8px 0\\">No recipients configured. Add email addresses below.</div>";';
  html += '      return;';
  html += '    }';
  html += '    el.innerHTML = res.recipients.map(function(e) {';
  html += '      return "<div class=\\"row\\"><div class=\\"dot dot-ok\\"></div><div class=\\"email\\">" + e + "</div><button class=\\"btn btn-red\\" style=\\"padding:3px 10px;font-size:11px\\" onclick=\\"removeRecipient(\\x27" + e + "\\x27)\\">Remove</button></div>";';
  html += '    }).join("");';
  html += '  });';
  html += '}';
  html += 'function addRecipient() {';
  html += '  var email = document.getElementById("newRecipient").value.trim();';
  html += '  if (!email) return;';
  html += '  api("add-recipient", { email: email }).then(function() {';
  html += '    document.getElementById("newRecipient").value = "";';
  html += '    loadRecipients();';
  html += '    var m = document.getElementById("emailMsg"); m.className = "msg msg-ok"; m.textContent = "Added " + email;';
  html += '  });';
  html += '}';
  // Send a test email and show the REAL result/error so we can diagnose delivery
  html += 'function sendTestEmail() {';
  html += '  var m = document.getElementById("emailMsg"); m.className = "msg msg-ok"; m.textContent = "Sending test email...";';
  html += '  api("test-email").then(function(r) {';
  html += '    if (r.ok) {';
  html += '      m.className = "msg msg-ok";';
  html += '      m.textContent = "Sent (" + (r.via || "email") + ") from " + r.from + " to " + (r.to || []).join(", ") + ". Check inboxes (and spam). " + (r.response || "");';
  html += '    } else if (r.stage === "resend") {';
  html += '      m.className = "msg msg-error";';
  html += '      m.textContent = "Resend rejected it: " + r.error + " — usually the sending domain for " + r.from + " is not verified in Resend, or the API key is wrong.";';
  html += '    } else if (r.stage === "brevo") {';
  html += '      m.className = "msg msg-error";';
  html += '      m.textContent = "Brevo rejected it: " + r.error + " — usually the sender " + r.from + " is not verified in Brevo (check the confirmation email), or the API key is wrong.";';
  html += '    } else if (r.stage === "auth") {';
  html += '      m.className = "msg msg-error";';
  html += '      m.textContent = "SMTP failed for " + r.from + " on " + r.host + ":" + r.port + ". " + r.error + " (Railway blocks SMTP on Hobby — set RESEND_API_KEY instead).";';
  html += '    } else if (r.stage === "config") {';
  html += '      m.className = "msg msg-error"; m.textContent = r.error;';
  html += '    } else {';
  html += '      m.className = "msg msg-error"; m.textContent = "Send failed: " + (r.error || "unknown");';
  html += '    }';
  html += '  }).catch(function() { m.className = "msg msg-error"; m.textContent = "Could not reach the server."; });';
  html += '}';
  html += 'function removeRecipient(email) {';
  html += '  api("remove-recipient", { email: email }).then(function() { loadRecipients(); });';
  html += '}';
  html += 'loadRecipients();';

  html += 'function saveSlack() {';
  html += '  var token = document.getElementById("slackToken").value.trim();';
  html += '  if (!token) return;';
  html += '  api("save-slack", { token: token }).then(function(res) {';
  html += '    var msg = document.getElementById("slackMsg");';
  html += '    if (res.ok) { msg.className = "msg msg-ok"; msg.textContent = "Slack token saved!"; }';
  html += '    else { msg.className = "msg msg-err"; msg.textContent = "Failed to save"; }';
  html += '    document.getElementById("slackToken").value = "";';
  html += '    refresh();';
  html += '  });';
  html += '}';

  // Initial load
  html += 'refresh();';

  html += '</script>';
  html += '</body></html>';

  return html;
}

// ─── Auto-Schedule ───

// Persist last-run guards to survive restarts
var SCHEDULER_STATE_FILE = path.join(PATHS.output(), 'scheduler-state.json');

function loadSchedulerState() {
  try {
    if (fs.existsSync(SCHEDULER_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(SCHEDULER_STATE_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { lastCollectDate: '', lastDeliverDate: '', lastFullRunDate: '' };
}

function saveSchedulerState(state) {
  try { fs.writeFileSync(SCHEDULER_STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) { /* ignore */ }
}

function getActiveDays(configDays) {
  if (configDays === 'daily') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (configDays === 'weekdays') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (Array.isArray(configDays)) return configDays;
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
}

function timeMatches(now, timeStr) {
  var parts = (timeStr || '08:00').split(':');
  return now.getHours() === parseInt(parts[0]) && now.getMinutes() === parseInt(parts[1]);
}

function startAutoScheduler() {
  console.log('  Auto-scheduler: checking every 60 seconds');

  var EXEC_TIMEOUT_MS = 45 * 60 * 1000; // 45 min hard cap per phase
  var schedulerRunning = false; // concurrent-run guard

  function runBriefingPhase(cmd, label, onDone) {
    if (schedulerRunning) {
      console.log('  Skipping ' + label + ' — previous phase still running');
      return;
    }
    schedulerRunning = true;
    console.log('\n  [Scheduler] Starting: ' + label);
    var exec = require('child_process').exec;
    exec(cmd, { cwd: __dirname, timeout: EXEC_TIMEOUT_MS }, function(err, stdout, stderr) {
      schedulerRunning = false;
      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);
      if (err) {
        console.error('  [Scheduler] Error (' + label + '): ' + err.message);
      } else {
        console.log('  [Scheduler] Done: ' + label + '\n');
      }
      if (onDone) onDone(err);
    });
  }

  setInterval(function() {
    var config;
    try { config = loadConfig(); } catch (e) { return; }

    var now = new Date();
    var todayStr = now.getFullYear() + '-' + (now.getMonth()+1) + '-' + now.getDate();
    var dayName = now.toLocaleDateString('en-US', { weekday: 'short' });
    var activeDays = getActiveDays(config.briefing.days);
    if (!activeDays.includes(dayName)) return;

    var state = loadSchedulerState();

    // ── Two-phase mode: collect at collectAt, deliver at deliverAtTime ──
    if (config.briefing.autoScheduleEnabled) {
      var collectTime = config.briefing.collectAt || '06:30';
      var deliverTime = config.briefing.deliverAtTime || '08:00';

      if (timeMatches(now, collectTime) && state.lastCollectDate !== todayStr) {
        state.lastCollectDate = todayStr;
        saveSchedulerState(state);
        runBriefingPhase('node generate-briefing.js --collect-only', 'Phase 1 collect');
        return;
      }

      if (timeMatches(now, deliverTime) && state.lastDeliverDate !== todayStr) {
        state.lastDeliverDate = todayStr;
        saveSchedulerState(state);
        runBriefingPhase('node generate-briefing.js --deliver-only', 'Phase 2 deliver');
        return;
      }

      return;
    }

    // ── Single-phase mode ──
    var targetTime = config.briefing.generateAt || '08:00';
    if (!timeMatches(now, targetTime)) return;
    if (state.lastFullRunDate === todayStr) return;

    state.lastFullRunDate = todayStr;
    saveSchedulerState(state);
    runBriefingPhase('node generate-briefing.js', 'full briefing');
  }, 60000);
}

// ─── Server ───

var server = http.createServer(async function(req, res) {
  if (!checkAuth(req, res)) return;

  var parsed = url.parse(req.url, true);
  var pathname = parsed.pathname;

  // MCP connector OAuth endpoints (Claude web/mobile custom connector).
  // Must run before /api body-parsing so the OAuth handler can read the body.
  var mcpOAuth = require('./mcp-oauth');
  if (mcpOAuth.isOAuthPath(pathname)) {
    if (await mcpOAuth.handleOAuth(req, res, pathname)) return;
  }

  // MCP endpoint — Claude Desktop integration
  if (pathname === '/mcp') {
    await handleMCP(req, res);
    return;
  }

  // Auth callback
  if (pathname === '/auth/callback') {
    await handleAuthCallback(req, res, parsed.query);
    return;
  }

  // API routes
  if (pathname.startsWith('/api/')) {
    var body = {};
    if (req.method === 'POST') {
      var chunks = [];
      for await (var chunk of req) chunks.push(chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString()); } catch (e) { /* ignore */ }
    }
    await handleAPI(req, res, pathname, body);
    return;
  }

  // Serve HTML dashboard
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(getHTML());
});

server.listen(PORT, function() {
  var config;
  try { config = loadConfig(); } catch (e) { config = { briefing: {} }; }
  var days = config.briefing.days || 'weekdays';

  console.log('\n  Daily Briefing Settings');
  console.log('  Open: http://localhost:' + PORT + '\n');

  if (config.briefing.autoScheduleEnabled) {
    var collectAt = config.briefing.collectAt || '06:30';
    var deliverAt = config.briefing.deliverAtTime || '08:00';
    console.log('  Auto-schedule (two-phase):');
    console.log('    Collect data at ' + collectAt);
    console.log('    Generate & deliver at ' + deliverAt);
    console.log('    Days: ' + days);
  } else {
    var time = config.briefing.generateAt || '08:00';
    console.log('  Auto-schedule: briefing will generate at ' + time + ' (' + days + ')');
  }
  console.log('  Keep this server running for auto-scheduling to work.\n');

  startAutoScheduler();
});
