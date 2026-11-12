// Acme Hire Asset Portal — Server-side Authentication
// Netlify Function: /api/login
//
// Environment variables required (set in Netlify dashboard):
//   PORTAL_PASSWORD   — the login password
//   JWT_SECRET        — a long random string for signing tokens
//
// Generate a good JWT_SECRET with:
//   node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

const crypto = require('crypto');

function base64url(str) {
    return Buffer.from(str).toString('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function createToken(payload, secret) {
    const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
    const body = base64url(JSON.stringify(payload));
    const sig = crypto.createHmac('sha256', secret)
        .update(`${header}.${body}`).digest('base64')
        .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    return `${header}.${body}.${sig}`;
}

function verifyToken(token, secret) {
    try {
        const [header, body, sig] = token.split('.');
        const expected = crypto.createHmac('sha256', secret)
            .update(`${header}.${body}`).digest('base64')
            .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
        if (sig !== expected) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64').toString());
        if (payload.exp && Date.now() / 1000 > payload.exp) return null;
        return payload;
    } catch { return null; }
}

exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };

    const JWT_SECRET = process.env.JWT_SECRET;
    const PORTAL_PASSWORD = process.env.PORTAL_PASSWORD;

    if (!JWT_SECRET || !PORTAL_PASSWORD) {
        console.error('Missing env vars: JWT_SECRET or PORTAL_PASSWORD — set these in Netlify dashboard');
        // Return 404 so the portal falls through cleanly to local password fallback
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not configured' }) };
    }

    // POST — verify password, return token
    if (event.httpMethod === 'POST') {
        let body;
        try { body = JSON.parse(event.body || '{}'); }
        catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid request' }) }; }

        const { password } = body;
        if (!password) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Password required' }) };

        // Constant-time comparison prevents timing attacks
        const inputHash = crypto.createHash('sha256').update(password).digest('hex');
        const correctHash = crypto.createHash('sha256').update(PORTAL_PASSWORD).digest('hex');
        const isValid = crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(correctHash));

        if (!isValid) {
            await new Promise(r => setTimeout(r, 500)); // slow brute force
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Incorrect password' }) };
        }

        const token = createToken({
            sub: 'ops',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60), // 8 hours
        }, JWT_SECRET);

        return { statusCode: 200, headers, body: JSON.stringify({ token }) };
    }

    // GET — validate existing token
    if (event.httpMethod === 'GET') {
        const token = (event.headers['authorization'] || '').replace('Bearer ', '');
        if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'No token' }) };
        const payload = verifyToken(token, JWT_SECRET);
        if (!payload) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid or expired token' }) };
        return { statusCode: 200, headers, body: JSON.stringify({ valid: true, expires: payload.exp }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
