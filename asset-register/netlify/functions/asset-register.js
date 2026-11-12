// Acme Hire Asset Portal — Asset Register Proxy
// Netlify Function: /api/asset-register
//
// Reads the persistent per-unit Asset Register (assets / asset_events / asset_defects)
// from the same Supabase project the handover-app Inspections app writes to.
//
// Environment variables required:
//   SUPABASE_URL         — e.g. https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY — service-role key (server-side only, never exposed to the browser)
//
// GET /api/asset-register?action=get&id=AHUKK250017 -> { asset, events, defects }
// `asset` is null (not a 404) when the unit has no register history yet — that's an
// expected state for units that predate this feature or haven't been inspected yet.

const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

async function supabaseGet(path, supabaseUrl, serviceKey) {
    const res = await fetch(`${supabaseUrl}/rest/v1${path}`, {
        headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase error (${res.status}) on ${path}: ${text}`);
    }
    return res.json();
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
        console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env var');
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Asset Register not configured' }) };
    }

    const params = event.queryStringParameters || {};
    const action = params.action || 'get';

    if (action === 'get') {
        const id = (params.id || '').trim().toUpperCase();
        if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing id' }) };

        try {
            const [assets, events, defects] = await Promise.all([
                supabaseGet(`/assets?asset_id=eq.${encodeURIComponent(id)}&select=*`, supabaseUrl, serviceKey),
                supabaseGet(`/asset_events?asset_id=eq.${encodeURIComponent(id)}&select=*&order=occurred_at.desc`, supabaseUrl, serviceKey),
                supabaseGet(`/asset_defects?asset_id=eq.${encodeURIComponent(id)}&select=*&order=created_at.desc`, supabaseUrl, serviceKey),
            ]);

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    asset: assets[0] || null,
                    events: events || [],
                    defects: defects || [],
                }),
            };
        } catch (err) {
            console.error('Asset Register function error:', err.message);
            return {
                statusCode: 502,
                headers,
                body: JSON.stringify({ error: 'Asset Register unavailable', detail: err.message }),
            };
        }
    }

    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };
};
