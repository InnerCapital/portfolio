'use strict';

/**
 * Minimal OAuth 2.1 authorization server for the MCP endpoint.
 *
 * Lets Claude's custom-connector flow (web + mobile) authenticate to /mcp via
 * OAuth, without touching the existing Basic-auth path used by Claude Desktop.
 *
 * Implements the subset the MCP auth spec needs:
 *   GET  /.well-known/oauth-protected-resource   discovery: points to this AS
 *   GET  /.well-known/oauth-authorization-server discovery: endpoints + PKCE
 *   POST /register                               Dynamic Client Registration
 *   GET  /authorize                              login page (dashboard password)
 *   POST /authorize                              verify password -> issue code
 *   POST /token                                  code+PKCE / refresh -> token
 *
 * Access is gated by the SAME dashboard password (DASHBOARD_PASS), so only the
 * account owner can mint a token. Clients + tokens are persisted on the Railway
 * volume so a redeploy doesn't force a re-auth. Auth codes are short-lived and
 * kept in memory.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const PATHS = require('./collectors/persistent-storage');

const STORE_FILE = path.join(PATHS.output(), 'mcp-oauth.json');
const ACCESS_TTL_S = 90 * 24 * 3600;   // 90 days
const CODE_TTL_MS = 10 * 60 * 1000;    // 10 minutes
const codes = new Map();               // authCode -> { clientId, redirectUri, codeChallenge, expiresAt }

function loadStore() {
  try { return JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')); } catch (e) { return { clients: {}, tokens: {}, refresh: {} }; }
}
function saveStore(s) {
  try { fs.writeFileSync(STORE_FILE, JSON.stringify(s, null, 2)); } catch (e) {}
}
function rand(n) { return crypto.randomBytes(n || 32).toString('base64url'); }
function sha256b64url(v) { return crypto.createHash('sha256').update(v).digest('base64url'); }
function baseUrl(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return proto + '://' + host;
}
function json(res, code, obj, extraHeaders) {
  res.writeHead(code, Object.assign({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, extraHeaders || {}));
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString();
}
function parseBody(raw, contentType) {
  if ((contentType || '').indexOf('application/json') !== -1) {
    try { return JSON.parse(raw); } catch (e) { return {}; }
  }
  return querystring.parse(raw);
}

/** True if the bearer token is known and not expired. */
function validateToken(token) {
  if (!token) return false;
  const s = loadStore();
  const t = s.tokens[token];
  if (!t) return false;
  if (t.expiresAt && t.expiresAt < Date.now()) return false;
  return true;
}

function loginPage(base, params, error) {
  const hidden = ['client_id', 'redirect_uri', 'response_type', 'scope', 'state', 'code_challenge', 'code_challenge_method', 'resource']
    .map(k => `<input type="hidden" name="${k}" value="${(params[k] || '').toString().replace(/"/g, '&quot;')}">`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize — Daily Briefing</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#f8f9fb;margin:0;padding:40px 16px;">
<div style="max-width:380px;margin:40px auto;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.08);padding:28px;">
  <h1 style="font-size:19px;color:#1a3c5e;margin:0 0 4px;">Connect to your Daily Briefing</h1>
  <p style="font-size:13px;color:#6b7a8d;margin:0 0 18px;">Enter the dashboard password to authorise Claude to access your briefing tools.</p>
  ${error ? `<div style="background:#fdecea;color:#b71c1c;font-size:13px;padding:10px 12px;border-radius:8px;margin-bottom:14px;">${error}</div>` : ''}
  <form method="POST" action="${base}/authorize">
    ${hidden}
    <input type="password" name="password" placeholder="Dashboard password" autofocus required
      style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #d7dde5;border-radius:8px;font-size:15px;margin-bottom:12px;">
    <button type="submit" style="width:100%;padding:12px;background:#2e86ab;color:#fff;border:0;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Authorise</button>
  </form>
</div></body></html>`;
}

/**
 * Handle an OAuth request. Returns true if it handled `pathname`, else false
 * so the caller continues its own routing.
 */
async function handleOAuth(req, res, pathname) {
  const base = baseUrl(req);

  // CORS preflight for the discovery/registration/token endpoints
  if (req.method === 'OPTIONS' && isOAuthPath(pathname)) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return true;
  }

  // ── Discovery: protected resource ──
  if (pathname === '/.well-known/oauth-protected-resource') {
    json(res, 200, { resource: base + '/mcp', authorization_servers: [base] });
    return true;
  }

  // ── Discovery: authorization server metadata ──
  if (pathname === '/.well-known/oauth-authorization-server' || pathname === '/.well-known/openid-configuration') {
    json(res, 200, {
      issuer: base,
      authorization_endpoint: base + '/authorize',
      token_endpoint: base + '/token',
      registration_endpoint: base + '/register',
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
      scopes_supported: ['mcp']
    });
    return true;
  }

  // ── Dynamic Client Registration ──
  if (pathname === '/register' && req.method === 'POST') {
    const raw = await readBody(req);
    const meta = parseBody(raw, req.headers['content-type']);
    const clientId = 'mcp-' + rand(12);
    const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris : (meta.redirect_uris ? [meta.redirect_uris] : []);
    const s = loadStore();
    s.clients[clientId] = { client_id: clientId, redirect_uris: redirectUris, created: Date.now() };
    saveStore(s);
    json(res, 201, {
      client_id: clientId,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id_issued_at: Math.floor(Date.now() / 1000)
    });
    return true;
  }

  // ── Authorization endpoint ──
  if (pathname === '/authorize') {
    if (req.method === 'GET') {
      const q = require('url').parse(req.url, true).query;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(loginPage(base, q));
      return true;
    }
    if (req.method === 'POST') {
      const raw = await readBody(req);
      const p = parseBody(raw, req.headers['content-type']);
      const expectedPass = process.env.DASHBOARD_PASS;
      if (!expectedPass || p.password !== expectedPass) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(loginPage(base, p, 'Incorrect password. Try again.'));
        return true;
      }
      // Validate the client + redirect
      const s = loadStore();
      const client = s.clients[p.client_id];
      const redirectUri = p.redirect_uri;
      if (!client || (client.redirect_uris.length && client.redirect_uris.indexOf(redirectUri) === -1)) {
        json(res, 400, { error: 'invalid_request', error_description: 'Unknown client or redirect_uri' });
        return true;
      }
      const code = rand(24);
      codes.set(code, {
        clientId: p.client_id, redirectUri: redirectUri,
        codeChallenge: p.code_challenge || null, expiresAt: Date.now() + CODE_TTL_MS
      });
      const sep = redirectUri.indexOf('?') === -1 ? '?' : '&';
      const loc = redirectUri + sep + 'code=' + encodeURIComponent(code) + (p.state ? '&state=' + encodeURIComponent(p.state) : '');
      res.writeHead(302, { Location: loc });
      res.end();
      return true;
    }
  }

  // ── Token endpoint ──
  if (pathname === '/token' && req.method === 'POST') {
    const raw = await readBody(req);
    const p = parseBody(raw, req.headers['content-type']);
    const s = loadStore();

    if (p.grant_type === 'authorization_code') {
      const entry = codes.get(p.code);
      if (!entry || entry.expiresAt < Date.now()) { json(res, 400, { error: 'invalid_grant', error_description: 'Code invalid or expired' }); return true; }
      if (entry.redirectUri && p.redirect_uri && entry.redirectUri !== p.redirect_uri) { json(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri mismatch' }); return true; }
      // PKCE
      if (entry.codeChallenge) {
        if (!p.code_verifier || sha256b64url(p.code_verifier) !== entry.codeChallenge) { json(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed' }); return true; }
      }
      codes.delete(p.code); // single use
      const accessToken = rand(32);
      const refreshToken = rand(32);
      s.tokens[accessToken] = { clientId: entry.clientId, issuedAt: Date.now(), expiresAt: Date.now() + ACCESS_TTL_S * 1000 };
      s.refresh[refreshToken] = { clientId: entry.clientId, issuedAt: Date.now() };
      saveStore(s);
      json(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refreshToken, scope: 'mcp' });
      return true;
    }

    if (p.grant_type === 'refresh_token') {
      const r = s.refresh[p.refresh_token];
      if (!r) { json(res, 400, { error: 'invalid_grant', error_description: 'Unknown refresh token' }); return true; }
      const accessToken = rand(32);
      s.tokens[accessToken] = { clientId: r.clientId, issuedAt: Date.now(), expiresAt: Date.now() + ACCESS_TTL_S * 1000 };
      saveStore(s);
      json(res, 200, { access_token: accessToken, token_type: 'Bearer', expires_in: ACCESS_TTL_S, scope: 'mcp' });
      return true;
    }

    json(res, 400, { error: 'unsupported_grant_type' });
    return true;
  }

  return false; // not an OAuth path
}

function isOAuthPath(pathname) {
  return pathname === '/.well-known/oauth-protected-resource' ||
    pathname === '/.well-known/oauth-authorization-server' ||
    pathname === '/.well-known/openid-configuration' ||
    pathname === '/register' || pathname === '/authorize' || pathname === '/token';
}

module.exports = { handleOAuth, validateToken, isOAuthPath };
