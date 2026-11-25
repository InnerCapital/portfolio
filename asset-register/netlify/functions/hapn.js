// Acme Hire Asset Portal — Hapn GPS API Proxy
// Netlify Function: /api/hapn
//
// Environment variables required (set in Netlify dashboard):
//   HAPN_CLIENT_ID     — API Key from Hapn dashboard
//   HAPN_CLIENT_SECRET — API Secret from Hapn dashboard
//
// Endpoints served:
//   GET /api/hapn?action=devices          — all devices on account, each merged with its
//                                            latest GPS fix (lat/lng/speed/battery/moving)
//   GET /api/hapn?action=device&id=XXX    — single device by ID

const { requireStaff } = require('./lib/auth');
const HAPN_AUTH_URL  = 'https://auth.usehapn.com/oauth2/token';
const HAPN_API_BASE  = 'https://api.iotgps.io/v1';

// In-memory token cache — persists for the lifetime of the function instance
// Netlify function instances are reused within a short window, so this
// reduces auth calls significantly
let _tokenCache = null;

const headers = {
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

// ── TOKEN MANAGEMENT ──────────────────────────────────────────────────────────
async function getToken(clientId, clientSecret) {
    const now = Date.now();

    // Return cached token if still valid (with 60s buffer before expiry)
    if (_tokenCache && _tokenCache.expiresAt > now + 60000) {
        return _tokenCache.token;
    }

    const body = new URLSearchParams({
        grant_type:    'client_credentials',
        client_id:     clientId,
        client_secret: clientSecret,
    });

    const res = await fetch(HAPN_AUTH_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    body.toString(),
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Hapn auth failed (${res.status}): ${text}`);
    }

    const data = await res.json();

    // Cache the token — expires_in is seconds
    _tokenCache = {
        token:     data.access_token,
        expiresAt: now + (data.expires_in * 1000),
    };

    return _tokenCache.token;
}

// ── API CALLS ─────────────────────────────────────────────────────────────────
async function hapnGet(path, token) {
    const res = await fetch(`${HAPN_API_BASE}${path}`, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept':        'application/json',
        },
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Hapn API error (${res.status}) on ${path}: ${text}`);
    }

    return res.json();
}

// The device list has no GPS fields at all — location only comes from each
// device's latest message. Merge it in so index.html's renderHapnDevice()
// (which reads lat/lng/speed/battery/moving) has real coordinates to show.
async function enrichWithLocation(devices, token) {
    return Promise.all(devices.map(async (device) => {
        if (!device.imei) return device;
        let latest = null;
        try {
            const msgData = await hapnGet(`/messages/latest/${device.imei}`, token);
            latest = (msgData && msgData.result) || null;
        } catch (err) {
            // No message yet for this device, or a transient error — leave it unlocated.
            console.warn(`[Hapn] latest message failed for ${device.imei}:`, err.message);
        }
        return {
            ...device,
            lat:      latest ? latest.latitude  : null,
            lng:      latest ? latest.longitude : null,
            speed:    latest ? latest.speed     : null,
            battery:  latest ? latest.batteryPercentage : null,
            moving:   !!(latest && latest.speed > 0),
        };
    }));
}

// ── HANDLER ───────────────────────────────────────────────────────────────────
exports.handler = async (event) => {
    const auth = requireStaff(event);
    if (!auth.ok) return auth.response;

    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const clientId     = process.env.HAPN_CLIENT_ID;
    const clientSecret = process.env.HAPN_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        console.error('Missing HAPN_CLIENT_ID or HAPN_CLIENT_SECRET env vars');
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Hapn not configured' }) };
    }

    const params = event.queryStringParameters || {};
    const action = params.action || 'devices';

    try {
        const token = await getToken(clientId, clientSecret);

        // ── GET ALL DEVICES ───────────────────────────────────────────────────
        if (action === 'devices') {
            const data = await hapnGet('/devices', token);
            // Hapn wraps devices in: { success, result: { items: [...] } }
            const rawDevices = (data.result && data.result.items)
                || data.devices || data.data || data || [];
            const devices = await enrichWithLocation(rawDevices, token);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok:      true,
                    devices: devices,
                    raw:     data,   // pass raw through for debugging
                }),
            };
        }

        // ── GET SINGLE DEVICE ─────────────────────────────────────────────────
        if (action === 'device') {
            const deviceId = params.id;
            if (!deviceId) {
                return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing device id' }) };
            }
            const data = await hapnGet(`/devices/${deviceId}`, token);
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ ok: true, device: data }),
            };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };

    } catch (err) {
        console.error('Hapn function error:', err.message);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Hapn API unavailable', detail: err.message }),
        };
    }
};
