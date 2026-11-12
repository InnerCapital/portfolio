// netlify/functions/lib/requireStaff.js
//
// Server-side staff check for the quote tool's write actions (Save PDF → Attio
// sync, Export to Xero). The page sends the Google ID token from staff sign-in
// as `Authorization: Bearer <token>`; this verifies it against Google:
// signature, expiry, audience (our OAuth client) and staff email domain.
// Same OAuth client and rules as the Trader Briefing ops tool.
//
// Google ID tokens last ~1 hour — an expired token gets a 401 and the page
// asks the user to sign in again.

const { OAuth2Client } = require('google-auth-library');

// Public OAuth client ID (also in index.html) — not a secret.
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const ALLOWED_DOMAINS = ['acmehire.example', 'acmecapital.example'];

const client = new OAuth2Client(CLIENT_ID);

function deny(statusCode, message) {
  return {
    ok: false,
    response: {
      statusCode,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message, authError: true }),
    },
  };
}

// Returns { ok: true, email, name } or { ok: false, response } — callers return
// `response` as-is.
async function requireStaff(event) {
  const headers = event.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return deny(401, 'Staff sign-in required');

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: match[1], audience: CLIENT_ID });
    payload = ticket.getPayload() || {};
  } catch (err) {
    return deny(401, 'Sign-in expired or invalid — please sign in again');
  }

  const email = String(payload.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  // `hd` is Google Workspace's hosted-domain claim — when present it must
  // match, so a personal Google account can't pass on an alias address.
  if (!payload.email_verified || !ALLOWED_DOMAINS.includes(domain) || (payload.hd && payload.hd !== domain)) {
    return deny(403, 'This account is not authorised for Acme Hire tools');
  }
  return { ok: true, email, name: payload.name || '' };
}

module.exports = { requireStaff };
