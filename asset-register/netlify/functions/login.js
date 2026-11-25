// Acme Hire Asset Portal — staff sign-in
// Netlify Function: /api/login
//
//   POST   { credential }  Google ID token from sign-in → sets the ah_ops session cookie
//   GET                    → { email, name } if signed in, else 401
//   DELETE                 → signs out (clears the cookie)
//
// Needs SESSION_SECRET (or the older JWT_SECRET) set in Netlify.

const { verifyGoogleCredential, sessionCookie, clearCookie, requireStaff, logAttempt } = require('./lib/auth');

const json = (statusCode, body, extra = {}) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extra },
    body: JSON.stringify(body),
});

exports.handler = async (event) => {
    if (event.httpMethod === 'GET') {
        const auth = requireStaff(event);
        if (!auth.ok) return auth.response;
        return json(200, { email: auth.user.email, name: auth.user.name });
    }

    if (event.httpMethod === 'DELETE') {
        return json(200, { ok: true }, { 'Set-Cookie': clearCookie() });
    }

    if (event.httpMethod === 'POST') {
        let body;
        try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { error: 'Invalid request' }); }
        try {
            const user = await verifyGoogleCredential(body.credential);
            const cookie = sessionCookie(user);
            logAttempt('allowed', user.email);
            return json(200, { email: user.email, name: user.name }, { 'Set-Cookie': cookie });
        } catch (err) {
            if (!err.status) {
                console.error('[login] not configured:', err.message);
                return json(500, { error: 'Sign-in is not configured. Ask an admin.' });
            }
            logAttempt('denied', null, err.reason);
            return json(err.status, { error: err.message });
        }
    }

    return json(405, { error: 'Method not allowed' });
};
