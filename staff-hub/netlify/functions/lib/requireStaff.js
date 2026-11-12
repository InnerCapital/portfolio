// netlify/functions/lib/requireStaff.js
//
// Server-side staff check, same rules and OAuth client as the quote tool and
// the Trader Briefing ops tool. The page sends the Google ID token from staff
// sign-in as `Authorization: Bearer <token>`; this verifies it against Google:
// signature, expiry, audience (our OAuth client) and staff email domain.

const { OAuth2Client } = require('google-auth-library');

// Public OAuth client ID (also in public/app.js) — not a secret.
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const ALLOWED_DOMAINS = ['acmehire.example', 'acmecapital.example'];

const client = new OAuth2Client(CLIENT_ID);

async function googleVerify(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
  return ticket.getPayload() || {};
}

// One line per sign-in attempt in Netlify's function logs. Never logs the token.
function logAttempt(outcome, email, reason) {
  console.log(JSON.stringify({ event: 'staff_signin', outcome, email: email || null, reason: reason || null }));
}

function deny(statusCode, message, email, reason) {
  logAttempt('denied', email, reason);
  return {
    ok: false,
    response: {
      statusCode,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: message, authError: true }),
    },
  };
}

// Returns { ok: true, email, name } or { ok: false, response }.
// `verify` is injectable for tests only; production always uses Google.
async function requireStaff(event, verify = googleVerify) {
  const headers = event.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return deny(401, 'Staff sign-in required', null, 'no_token');

  let payload;
  try {
    payload = await verify(match[1]);
  } catch (err) {
    return deny(401, 'Sign-in expired or invalid. Please sign in again.', null, 'invalid_token');
  }

  const email = String(payload.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  // `hd` is Google Workspace's hosted-domain claim: when present it must
  // match, so a personal Google account can't pass on an alias address.
  if (!payload.email_verified || !ALLOWED_DOMAINS.includes(domain) || (payload.hd && payload.hd !== domain)) {
    return deny(403, 'This account is not a Acme Hire staff account.', email, 'not_staff');
  }
  logAttempt('allowed', email);
  return { ok: true, email, name: payload.name || '' };
}

module.exports = { requireStaff, CLIENT_ID, ALLOWED_DOMAINS };
