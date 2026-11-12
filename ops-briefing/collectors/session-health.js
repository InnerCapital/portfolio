'use strict';

/**
 * Session Health Tracker
 *
 * Writes /data/output/session-health.json on every collection run.
 * Sends a Slack alert when a session transitions to 'expired'.
 * Dashboard reads /api/session-health and shows warnings.
 */

var fs   = require('fs');
var path = require('path');
var https = require('https');
var PATHS = require('./persistent-storage');

var HEALTH_FILE = path.join(PATHS.output(), 'session-health.json');

// Days before expiry to show a yellow warning on the dashboard
var WARN_DAYS = { whatsapp: 20, linkedin: 22 };
// Estimated max session lifetime in days
var MAX_DAYS  = { whatsapp: 60, linkedin: 30 };

function load() {
  try {
    if (fs.existsSync(HEALTH_FILE)) return JSON.parse(fs.readFileSync(HEALTH_FILE, 'utf8'));
  } catch (e) {}
  return {};
}

function save(health) {
  try { fs.writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2)); } catch (e) {}
}

function slackAlert(text) {
  var token   = process.env.SLACK_BOT_TOKEN;
  var channel = 'C0B9676PHCM'; // #pa-claude
  if (!token) return;

  var body = JSON.stringify({ channel: channel, text: text });
  var req = https.request({
    hostname: 'slack.com',
    path:     '/api/chat.postMessage',
    method:   'POST',
    headers:  {
      'Authorization': 'Bearer ' + token,
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, function(res) {
    var data = '';
    res.on('data', function(d) { data += d; });
    res.on('end', function() {
      try {
        var r = JSON.parse(data);
        if (!r.ok) console.error('  Slack session alert failed:', r.error);
      } catch (e) {}
    });
  });
  req.on('error', function(e) { console.error('  Slack alert error:', e.message); });
  req.write(body);
  req.end();
}

/**
 * Call after a successful collection run.
 * service: 'whatsapp' | 'linkedin'
 * sessionId: the session label
 */
function markHealthy(service, sessionId) {
  var health = load();
  var key    = service + ':' + (sessionId || 'default');
  var prev   = health[key] || {};

  health[key] = {
    status:      'ok',
    sessionId:   sessionId || 'default',
    lastSuccess: new Date().toISOString(),
    setupAt:     prev.setupAt || null
  };

  save(health);
}

/**
 * Call when a collection run fails because the session appears expired.
 * Sends a Slack alert on the first detection (not on every daily run).
 */
function markExpired(service, sessionId, errorMsg) {
  var health = load();
  var key    = service + ':' + (sessionId || 'default');
  var prev   = health[key] || {};

  var wasOk   = !prev.status || prev.status === 'ok';
  var label   = service === 'whatsapp' ? 'WhatsApp' : 'LinkedIn';
  var dashUrl = process.env.DASHBOARD_URL || 'the briefing dashboard';

  health[key] = Object.assign({}, prev, {
    status:      'expired',
    sessionId:   sessionId || 'default',
    expiredAt:   new Date().toISOString(),
    error:       errorMsg || 'Session expired'
  });

  save(health);

  if (wasOk) {
    var msg = [
      ':warning: *' + label + ' session expired* for Alex\'s briefing.',
      'The morning collection ran but could not load ' + label + ' messages.',
      'Error: ' + (errorMsg || 'session invalid'),
      '',
      'Fix: go to the dashboard → ' + label + ' → run setup again.',
      dashUrl
    ].join('\n');

    console.log('  Sending session expiry alert to Slack (#pa-claude)...');
    slackAlert(msg);
  }
}

/**
 * Record when a session was set up (called from setup functions).
 */
function recordSetup(service, sessionId) {
  var health = load();
  var key    = service + ':' + (sessionId || 'default');
  health[key] = Object.assign({}, health[key] || {}, {
    status:    'ok',
    sessionId: sessionId || 'default',
    setupAt:   new Date().toISOString()
  });
  save(health);
}

/**
 * Returns a summary for the dashboard API.
 * Adds a 'warning' flag when approaching expected expiry.
 */
function getHealthSummary() {
  var health = load();
  var now    = Date.now();
  var result = {};

  Object.keys(health).forEach(function(key) {
    var entry   = health[key];
    var service = key.split(':')[0];
    var maxDays = MAX_DAYS[service] || 60;
    var warnDays = WARN_DAYS[service] || 20;
    var setupAt = entry.setupAt ? new Date(entry.setupAt).getTime() : null;
    var daysSinceSetup = setupAt ? Math.floor((now - setupAt) / 86400000) : null;

    var warning = false;
    var warningMsg = null;

    if (entry.status === 'expired') {
      warning    = true;
      warningMsg = 'Session expired — re-run setup on the dashboard';
    } else if (daysSinceSetup !== null && daysSinceSetup >= (maxDays - warnDays)) {
      warning    = true;
      warningMsg = 'Session ' + daysSinceSetup + ' days old — may expire soon (max ~' + maxDays + ' days). Consider re-running setup.';
    }

    result[key] = Object.assign({}, entry, {
      daysSinceSetup: daysSinceSetup,
      warning:        warning,
      warningMsg:     warningMsg
    });
  });

  return result;
}

module.exports = { markHealthy, markExpired, recordSetup, getHealthSummary };
