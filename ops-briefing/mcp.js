'use strict';

/**
 * MCP (Model Context Protocol) server for Alex's briefing system.
 *
 * Exposes tools to Claude Desktop so Alex can query all connected accounts
 * directly from the Claude chat window — no separate interface needed.
 *
 * Endpoint: POST /mcp  (Streamable HTTP transport, JSON-RPC 2.0)
 *
 * Claude Desktop config (~/Library/Application Support/Claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "alex": {
 *       "type": "streamable-http",
 *       "url": "https://alex:YOUR_DASHBOARD_PASS@ops-briefing.example.app/mcp"
 *     }
 *   }
 * }
 */

var fs   = require('fs');
var path = require('path');
var PATHS = require('./collectors/persistent-storage');

// ── Tool Definitions ──────────────────────────────────────────────────────────

var TOOLS = [
  {
    name: 'search_email',
    description: "Search emails across all of Alex's Gmail accounts (acmehire.example, acmecapital.example, brandinc.au) using Gmail search syntax. Examples: \"from:john@vc.com\", \"subject:term sheet\", \"VC funding deck\". Returns sender, subject, snippet, date, and which account it came from.",
    inputSchema: {
      type: 'object',
      properties: {
        query:       { type: 'string',  description: 'Gmail search query' },
        max_results: { type: 'number',  description: 'Max results per account (default: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_recent_emails',
    description: "Get recent emails from all of Alex's Gmail accounts. Use this for a general inbox overview or to find emails by time window.",
    inputSchema: {
      type: 'object',
      properties: {
        hours:   { type: 'number', description: 'Hours to look back (default: 24)' },
        account: { type: 'string', description: 'Specific email address, or omit for all accounts' }
      }
    }
  },
  {
    name: 'get_calendar_events',
    description: "Get upcoming events from Alex's Google Calendar.",
    inputSchema: {
      type: 'object',
      properties: {
        days_ahead: { type: 'number', description: 'How many days ahead to look (default: 7)' }
      }
    }
  },
  {
    name: 'get_slack_messages',
    description: "Get recent Slack messages and DMs from the Acme Hire workspace.",
    inputSchema: {
      type: 'object',
      properties: {
        hours:   { type: 'number', description: 'Hours to look back (default: 24)' },
        channel: { type: 'string', description: 'Specific channel name (without #), or omit for all' }
      }
    }
  },
  {
    name: 'get_whatsapp_conversations',
    description: "Get WhatsApp conversations captured during the morning collection. Data is refreshed daily at 6:30 AM.",
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'get_linkedin_messages',
    description: "Get LinkedIn messages captured during the morning collection. Data is refreshed daily at 6:30 AM.",
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'search_drive',
    description: "Search Google Drive for documents, spreadsheets, or files shared with Alex.",
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term (file name, keywords, or Drive search syntax)' }
      },
      required: ['query']
    }
  },
  {
    name: 'get_last_briefing',
    description: "Get the most recent morning briefing that was delivered to Alex.",
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'create_zoom_meeting',
    description: "Create a Zoom meeting on Alex's account and return the join link. Use when Alex asks to set up or schedule a Zoom call. Provide a topic; optionally a start_time (ISO 8601) and duration in minutes. Omit start_time for an instant meeting starting now.",
    inputSchema: {
      type: 'object',
      properties: {
        topic:      { type: 'string', description: 'Meeting title/topic' },
        start_time: { type: 'string', description: 'ISO 8601 start time in UTC, e.g. 2026-07-30T14:00:00Z. Omit for an instant meeting.' },
        duration:   { type: 'number', description: 'Duration in minutes (default 30)' }
      },
      required: ['topic']
    }
  }
];

// ── Gmail Client Factory ──────────────────────────────────────────────────────

async function getGmailClients(filterEmail) {
  var { google } = require('googleapis');

  var credPath = PATHS.credentials();
  if (!fs.existsSync(credPath)) {
    throw new Error('Google credentials missing. Ensure GOOGLE_CREDENTIALS_B64 is set in Railway Variables.');
  }

  var creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
  var clientConfig = creds.installed || creds.web;
  var clientId     = clientConfig.client_id;
  var clientSecret = clientConfig.client_secret;

  var tokensDir = PATHS.tokens();
  if (!fs.existsSync(tokensDir)) return [];

  var tokenFiles = fs.readdirSync(tokensDir).filter(function(f) { return f.endsWith('.json'); });
  var clients = [];

  for (var i = 0; i < tokenFiles.length; i++) {
    var file = tokenFiles[i];
    var email = file.replace(/\.json$/, '');

    if (filterEmail && !email.toLowerCase().includes(filterEmail.toLowerCase())) continue;

    try {
      var token = JSON.parse(fs.readFileSync(path.join(tokensDir, file), 'utf8'));
      var auth  = new google.auth.OAuth2(clientId, clientSecret);
      auth.setCredentials(token);

      clients.push({
        email:    email,
        gmail:    google.gmail({ version: 'v1', auth: auth }),
        calendar: google.calendar({ version: 'v3', auth: auth }),
        drive:    google.drive({ version: 'v3', auth: auth })
      });
    } catch (e) { /* skip invalid token file */ }
  }

  return clients;
}

// ── Tool Implementations ──────────────────────────────────────────────────────

async function toolSearchEmail(args) {
  var clients = await getGmailClients(args.account);
  if (clients.length === 0) {
    return 'No Gmail accounts are authorised yet. Ask Alex/Priya to connect Gmail accounts via the dashboard at ' +
           (process.env.DASHBOARD_URL || 'the briefing dashboard') + '.';
  }

  var maxResults = args.max_results || 10;
  var results = [];

  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    try {
      var list = await c.gmail.users.messages.list({ userId: 'me', q: args.query, maxResults: maxResults });
      var messages = list.data.messages || [];

      for (var j = 0; j < messages.length; j++) {
        try {
          var full = await c.gmail.users.messages.get({
            userId: 'me', id: messages[j].id,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date']
          });
          var headers = {};
          (full.data.payload.headers || []).forEach(function(h) { headers[h.name] = h.value; });
          results.push({
            account: c.email,
            from:    headers['From']    || '',
            to:      headers['To']      || '',
            subject: headers['Subject'] || '(no subject)',
            date:    headers['Date']    || '',
            snippet: (full.data.snippet || '').substring(0, 300)
          });
        } catch (e) { /* skip individual message errors */ }
      }
    } catch (e) {
      results.push({ account: c.email, error: e.message });
    }
  }

  if (results.length === 0) return 'No emails found matching: ' + args.query;
  return JSON.stringify(results, null, 2);
}

async function toolGetRecentEmails(args) {
  var hours   = args.hours || 24;
  var after   = Math.floor(Date.now() / 1000 - hours * 3600);
  var clients = await getGmailClients(args.account);

  if (clients.length === 0) {
    return 'No Gmail accounts authorised yet. Connect them via the dashboard first.';
  }

  var results = [];

  for (var i = 0; i < clients.length; i++) {
    var c = clients[i];
    try {
      var list = await c.gmail.users.messages.list({
        userId: 'me', q: 'in:inbox after:' + after, maxResults: 20
      });
      var messages = list.data.messages || [];

      for (var j = 0; j < Math.min(messages.length, 15); j++) {
        try {
          var full = await c.gmail.users.messages.get({
            userId: 'me', id: messages[j].id,
            format: 'metadata',
            metadataHeaders: ['From', 'Subject', 'Date']
          });
          var headers = {};
          (full.data.payload.headers || []).forEach(function(h) { headers[h.name] = h.value; });
          results.push({
            account: c.email,
            from:    headers['From']    || '',
            subject: headers['Subject'] || '(no subject)',
            date:    headers['Date']    || '',
            snippet: (full.data.snippet || '').substring(0, 200)
          });
        } catch (e) { /* skip */ }
      }
    } catch (e) {
      results.push({ account: c.email, error: e.message });
    }
  }

  if (results.length === 0) return 'No emails found in the last ' + hours + ' hours.';
  return JSON.stringify(results, null, 2);
}

async function toolGetCalendarEvents(args) {
  var clients = await getGmailClients();
  if (clients.length === 0) return 'No Google accounts authorised yet.';

  var daysAhead = args.days_ahead || 7;
  var now  = new Date();
  var end  = new Date(now.getTime() + daysAhead * 24 * 3600 * 1000);
  var seen = new Set();
  var events = [];

  for (var i = 0; i < clients.length; i++) {
    try {
      var res = await clients[i].calendar.events.list({
        calendarId:  'primary',
        timeMin:     now.toISOString(),
        timeMax:     end.toISOString(),
        singleEvents: true,
        orderBy:     'startTime',
        maxResults:  30
      });
      (res.data.items || []).forEach(function(ev) {
        var key = (ev.summary || '') + (ev.start.dateTime || ev.start.date);
        if (!seen.has(key)) {
          seen.add(key);
          events.push({
            title:     ev.summary   || '(no title)',
            start:     ev.start.dateTime || ev.start.date,
            end:       ev.end.dateTime   || ev.end.date,
            location:  ev.location  || '',
            attendees: (ev.attendees || []).map(function(a) { return a.email; }).join(', '),
            notes:     (ev.description || '').substring(0, 200)
          });
        }
      });
    } catch (e) { /* skip account */ }
  }

  events.sort(function(a, b) { return new Date(a.start) - new Date(b.start); });
  if (events.length === 0) return 'No calendar events in the next ' + daysAhead + ' days.';
  return JSON.stringify(events, null, 2);
}

async function toolGetSlackMessages(args) {
  var token = process.env.SLACK_BOT_TOKEN;
  if (!token) return 'SLACK_BOT_TOKEN is not configured in Railway Variables.';

  var https = require('https');

  function slackGet(apiPath) {
    return new Promise(function(resolve, reject) {
      var req = https.get({
        hostname: 'slack.com',
        path:     '/api' + apiPath,
        headers:  { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
      }, function(res) {
        var data = '';
        res.on('data', function(d) { data += d; });
        res.on('end', function() {
          try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
        });
      });
      req.on('error', reject);
    });
  }

  var hours   = args.hours || 24;
  var oldest  = String(Date.now() / 1000 - hours * 3600);
  var results = [];

  try {
    var chanRes  = await slackGet('/conversations.list?types=public_channel,private_channel,im,mpim&limit=100');
    var channels = chanRes.channels || [];

    if (args.channel) {
      channels = channels.filter(function(c) {
        return c.name === args.channel || c.id === args.channel;
      });
    }

    for (var i = 0; i < Math.min(channels.length, 25); i++) {
      var ch = channels[i];
      try {
        var hist = await slackGet('/conversations.history?channel=' + ch.id + '&oldest=' + oldest + '&limit=20');
        var msgs = (hist.messages || []).filter(function(m) { return m.type === 'message' && m.text; });
        if (msgs.length > 0) {
          results.push({
            channel:  ch.name || ch.id,
            messages: msgs.slice(0, 10).map(function(m) {
              return {
                text: m.text.substring(0, 300),
                time: new Date(parseFloat(m.ts) * 1000).toISOString()
              };
            })
          });
        }
      } catch (e) { /* skip channel */ }
    }
  } catch (e) {
    return 'Slack error: ' + e.message;
  }

  if (results.length === 0) return 'No Slack messages in the last ' + hours + ' hours.';
  return JSON.stringify(results, null, 2);
}

function toolGetWhatsappConversations() {
  // Primary: dedicated cache file written by whatsapp.js
  var cacheFile = PATHS.whatsappCache();
  if (fs.existsSync(cacheFile)) {
    try { return fs.readFileSync(cacheFile, 'utf8'); } catch (e) { /* fall through */ }
  }

  // Fallback: collected-data.json from morning run
  var dataFile = path.join(PATHS.output(), 'collected-data.json');
  if (fs.existsSync(dataFile)) {
    try {
      var data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      if (data.personal && data.personal.whatsapp) {
        return JSON.stringify({ collectedAt: data.collectedAt, threads: data.personal.whatsapp }, null, 2);
      }
    } catch (e) { /* fall through */ }
  }

  return 'No WhatsApp data yet. Data is captured automatically at 6:30 AM during the morning collection. You can also trigger a manual collection from the dashboard.';
}

function toolGetLinkedinMessages() {
  var dataFile = path.join(PATHS.output(), 'collected-data.json');
  if (fs.existsSync(dataFile)) {
    try {
      var data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      if (data.personal && Array.isArray(data.personal.linkedin)) {
        var msgs = data.personal.linkedin;
        if (msgs.length === 0) {
          return 'LinkedIn collection ran at ' + (data.collectedAt || 'unknown time') + ' but found 0 conversations. Either there are no unread messages, or the session may be expired — check the dashboard.';
        }
        return JSON.stringify({ collectedAt: data.collectedAt, messages: msgs }, null, 2);
      }
    } catch (e) { /* fall through */ }
  }
  // Also check session health to give a better message
  var healthFile = path.join(PATHS.output(), 'session-health.json');
  if (fs.existsSync(healthFile)) {
    try {
      var health = JSON.parse(fs.readFileSync(healthFile, 'utf8'));
      var liKey = Object.keys(health).find(function(k) { return k.startsWith('linkedin:'); });
      if (liKey && health[liKey].status === 'expired') {
        return 'LinkedIn session is expired — go to the dashboard and re-run LinkedIn setup.';
      }
    } catch (e) {}
  }
  return 'No LinkedIn data collected yet. Data is captured at 6:30 AM. Make sure the LinkedIn session is set up via the dashboard, then use "Run LinkedIn Now" to verify.';
}

async function toolSearchDrive(args) {
  var clients = await getGmailClients();
  if (clients.length === 0) return 'No Google accounts authorised yet.';

  var safeQuery = args.query.replace(/'/g, "\\'");
  var files = [];
  var seen  = new Set();

  for (var i = 0; i < clients.length; i++) {
    try {
      var res = await clients[i].drive.files.list({
        q:      "name contains '" + safeQuery + "' or fullText contains '" + safeQuery + "'",
        fields: 'files(id,name,mimeType,modifiedTime,webViewLink)',
        pageSize: 10,
        orderBy:  'modifiedTime desc'
      });
      (res.data.files || []).forEach(function(f) {
        if (!seen.has(f.id)) {
          seen.add(f.id);
          files.push({
            name:     f.name,
            type:     f.mimeType,
            modified: f.modifiedTime,
            link:     f.webViewLink || '',
            account:  clients[i].email
          });
        }
      });
    } catch (e) { /* skip account */ }
  }

  if (files.length === 0) return 'No Drive files found matching: ' + args.query;
  return JSON.stringify(files, null, 2);
}

function toolGetLastBriefing() {
  var outDir = PATHS.output();
  if (!fs.existsSync(outDir)) return 'No briefings generated yet.';

  var files = fs.readdirSync(outDir)
    .filter(function(f) { return f.startsWith('briefing-') && f.endsWith('.txt'); })
    .sort()
    .reverse();

  if (files.length === 0) return 'No briefing text found yet. The morning briefing is generated and delivered at 8:00 AM on weekdays.';

  var content = fs.readFileSync(path.join(outDir, files[0]), 'utf8');
  return '=== ' + files[0] + ' ===\n\n' + content;
}

async function toolCreateZoomMeeting(args) {
  if (!args || !args.topic) return 'A topic is required to create a Zoom meeting.';
  try {
    var createMeeting = require('./collectors/zoom').createMeeting;
    var r = await createMeeting({ topic: args.topic, start_time: args.start_time, duration: args.duration });
    if (!r.ok) return 'Could not create the Zoom meeting: ' + r.error + ' (the app may need the meeting:write scope, or Zoom is not configured).';
    return JSON.stringify({
      created: true,
      topic: r.topic,
      start_time: r.start_time || 'instant (now)',
      join_url: r.join_url,
      meeting_id: r.id
    }, null, 2);
  } catch (e) {
    return 'Could not create the Zoom meeting: ' + e.message;
  }
}

// ── Tool Dispatcher ───────────────────────────────────────────────────────────

async function executeTool(name, args) {
  switch (name) {
    case 'search_email':              return await toolSearchEmail(args || {});
    case 'get_recent_emails':         return await toolGetRecentEmails(args || {});
    case 'get_calendar_events':       return await toolGetCalendarEvents(args || {});
    case 'get_slack_messages':        return await toolGetSlackMessages(args || {});
    case 'get_whatsapp_conversations':return toolGetWhatsappConversations();
    case 'get_linkedin_messages':     return toolGetLinkedinMessages();
    case 'search_drive':              return await toolSearchDrive(args || {});
    case 'get_last_briefing':         return toolGetLastBriefing();
    case 'create_zoom_meeting':       return await toolCreateZoomMeeting(args || {});
    default: throw new Error('Unknown tool: ' + name);
  }
}

// ── MCP HTTP Handler ──────────────────────────────────────────────────────────

async function handleMCP(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Mcp-Session-Id'
    });
    res.end();
    return;
  }

  // Auth: accept EITHER the dashboard Basic auth (Claude Desktop, unchanged) OR an
  // OAuth bearer token (Claude web/mobile custom connector). If neither, advertise OAuth.
  var dashUser = process.env.DASHBOARD_USER || 'admin';
  var dashPass = process.env.DASHBOARD_PASS;
  var authHeader = req.headers['authorization'] || '';
  var authed = false;
  if (!dashPass) {
    authed = true; // unconfigured -> open (preserves prior behaviour)
  } else if (authHeader === 'Basic ' + Buffer.from(dashUser + ':' + dashPass).toString('base64')) {
    authed = true; // Claude Desktop Basic-auth path — unchanged
  } else if (authHeader.indexOf('Bearer ') === 0) {
    try { authed = require('./mcp-oauth').validateToken(authHeader.slice(7).trim()); } catch (e) { authed = false; }
  }
  if (!authed) {
    var host = req.headers['x-forwarded-host'] || req.headers.host;
    var proto = req.headers['x-forwarded-proto'] || 'https';
    res.writeHead(401, {
      'WWW-Authenticate': 'Bearer resource_metadata="' + proto + '://' + host + '/.well-known/oauth-protected-resource"',
      'Content-Type':     'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({ error: 'Unauthorised' }));
    return;
  }

  // GET — Claude Desktop opens this for the SSE channel (server-initiated messages)
  // We have no server-initiated messages so we just keep the connection open
  if (req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    req.on('close', function() {});
    return;
  }

  var chunks = [];
  for await (var chunk of req) chunks.push(chunk);

  var body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString());
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
    return;
  }

  var id     = body.id !== undefined ? body.id : null;
  var method = body.method || '';
  var params = body.params || {};

  res.writeHead(200, { 'Content-Type': 'application/json' });

  try {
    if (method === 'initialize') {
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities:    { tools: {} },
          serverInfo:      { name: 'ops-briefing', version: '1.0.0' }
        }
      }));

    } else if (method === 'notifications/initialized' || method === 'ping') {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: id, result: {} }));

    } else if (method === 'tools/list') {
      res.end(JSON.stringify({ jsonrpc: '2.0', id: id, result: { tools: TOOLS } }));

    } else if (method === 'tools/call') {
      var toolName = params.name;
      var toolArgs = params.arguments || {};
      console.log('  MCP call: ' + toolName, JSON.stringify(toolArgs).substring(0, 100));
      var result = await executeTool(toolName, toolArgs);
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: id,
        result: { content: [{ type: 'text', text: result }] }
      }));

    } else {
      res.end(JSON.stringify({
        jsonrpc: '2.0', id: id,
        error: { code: -32601, message: 'Method not found: ' + method }
      }));
    }
  } catch (e) {
    console.error('  MCP error (' + method + '):', e.message);
    res.end(JSON.stringify({
      jsonrpc: '2.0', id: id,
      error: { code: -32603, message: e.message }
    }));
  }
}

module.exports = { handleMCP };
