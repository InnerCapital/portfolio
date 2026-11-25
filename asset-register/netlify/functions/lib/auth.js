// netlify/functions/lib/auth.js
//
// Staff sign-in for the asset portal, checked on the server.
//
// 1. The page gets a Google ID token from Google sign-in and POSTs it to
//    /api/login. We ask Google to verify it (signature, expiry, audience =
//    our OAuth client) and check the email is a verified Acme Hire address.
// 2. We then set our own signed, HttpOnly session cookie (8 hours). Every
//    protected function calls requireStaff(event), which checks that cookie.
//
// No dependencies: Google's tokeninfo endpoint does the signature check, and
// the session cookie is an HMAC from SESSION_SECRET (falls back to JWT_SECRET).

const crypto = require('crypto');

// Public OAuth client ID (also in index.html) — not a secret.
const CLIENT_ID = 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com';
const ALLOWED_DOMAINS = ['acmehire.example', 'acmecapital.example'];
const COOKIE = 'ah_ops';
const MAX_AGE = 8 * 60 * 60;

function secret() {
    const s = process.env.SESSION_SECRET || process.env.JWT_SECRET;
    if (!s) throw new Error('SESSION_SECRET (or JWT_SECRET) is not set');
    return s;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(payload) {
    const body = b64url(JSON.stringify(payload));
    const sig = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
    return `${body}.${sig}`;
}

function verifySession(token, now = Date.now()) {
    if (!token || typeof token !== 'string') return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    let expected;
    try { expected = crypto.createHmac('sha256', secret()).update(body).digest(); } catch { return null; }
    const given = fromB64url(sig);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
        const data = JSON.parse(fromB64url(body).toString('utf8'));
        if (typeof data.exp !== 'number' || data.exp * 1000 <= now) return null;
        if (!isStaffEmail(data.email)) return null;
        return data;
    } catch { return null; }
}

function isStaffEmail(email) {
    const domain = String(email || '').toLowerCase().split('@')[1] || '';
    return ALLOWED_DOMAINS.includes(domain);
}

// Google checks the token's signature and expiry; we check the rest.
async function googleTokenInfo(idToken) {
    const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!res.ok) throw new Error('tokeninfo ' + res.status);
    return res.json();
}

// Returns { email, name } for a genuine staff token, or throws with .status.
async function verifyGoogleCredential(idToken, lookup = googleTokenInfo) {
    const fail = (status, message, reason) => Object.assign(new Error(message), { status, reason });
    if (!idToken || typeof idToken !== 'string') throw fail(400, 'Sign-in token missing.', 'no_token');
    let info;
    try { info = await lookup(idToken); } catch { throw fail(401, 'Sign-in expired or invalid. Please try again.', 'invalid_token'); }
    const email = String(info.email || '').toLowerCase();
    const domain = email.split('@')[1] || '';
    const verified = info.email_verified === true || info.email_verified === 'true';
    if (info.aud !== CLIENT_ID) throw fail(401, 'Sign-in expired or invalid. Please try again.', 'wrong_audience');
    if (Number(info.exp) * 1000 <= Date.now()) throw fail(401, 'Sign-in expired. Please try again.', 'expired');
    // `hd` is the Workspace domain claim: if present it must match, so a
    // personal Google account can't pass on an alias address.
    if (!verified || !ALLOWED_DOMAINS.includes(domain) || (info.hd && info.hd !== domain)) {
        throw fail(403, 'This account is not an Acme Hire staff account.', 'not_staff');
    }
    return { email, name: info.name || email };
}

function sessionCookie(user) {
    const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
    const value = sign({ email: user.email, name: user.name, exp });
    return `${COOKIE}=${value}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
}

const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;

function readCookie(event, name = COOKIE) {
    const h = (event.headers || {});
    const raw = h.cookie || h.Cookie || '';
    for (const part of raw.split(';')) {
        const i = part.indexOf('=');
        if (i > -1 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
    }
    return null;
}

// One line per sign-in attempt in Netlify's function logs. Never logs tokens.
function logAttempt(outcome, email, reason) {
    console.log(JSON.stringify({ event: 'staff_signin', app: 'asset-portal', outcome, email: email || null, reason: reason || null }));
}

// For protected functions. Returns { ok: true, user } or { ok: false, response }.
function requireStaff(event) {
    const user = verifySession(readCookie(event));
    if (user) return { ok: true, user };
    return {
        ok: false,
        response: {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
            body: JSON.stringify({ error: 'Staff sign-in required', authError: true }),
        },
    };
}

module.exports = {
    CLIENT_ID, ALLOWED_DOMAINS, COOKIE,
    verifyGoogleCredential, sessionCookie, clearCookie, requireStaff,
    verifySession, readCookie, logAttempt, sign,
};
