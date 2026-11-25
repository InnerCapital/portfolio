// Acme Hire Asset Portal — public QR page data
// Netlify Function: /api/asset-public?id=AHUKB260001
//
// The ONLY data the public sees when they scan a serial-plate QR code:
// asset ID, unit type and the latest inspection badge. Location, client,
// serials, GPS, hire status and defect detail stay behind staff sign-in.

const { fetchSheetCsv, parseCsv } = require('./lib/sheet');

const ASSET_ID_RE = /^AH[A-Z]{2}[A-Z]\d{6}(-[A-Z]\d{3})?$/;

const json = (statusCode, body, cache = 'no-store') => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cache },
    body: JSON.stringify(body),
});

async function registerStatus(id) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) return null;
    try {
        const res = await fetch(`${url}/rest/v1/assets?asset_id=eq.${encodeURIComponent(id)}&select=status`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (!res.ok) return null;
        const rows = await res.json();
        return (rows[0] && rows[0].status) || null;
    } catch { return null; }
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
    const id = String((event.queryStringParameters || {}).id || '').trim().toUpperCase();
    if (!ASSET_ID_RE.test(id)) return json(400, { error: 'Not an Acme Hire asset ID' });

    let rows;
    try {
        rows = parseCsv(await fetchSheetCsv('assets'));
    } catch (err) {
        console.error('[asset-public] sheet error:', err.message);
        return json(502, { error: 'Asset lookup unavailable' });
    }
    const row = rows.find((r) => String(r['asset id'] || r.id || '').trim().toUpperCase() === id);
    if (!row) return json(404, { found: false, id }, 'public, max-age=60');

    return json(200, {
        found: true,
        id,
        type: row.category || row.type || '',
        registerStatus: await registerStatus(id),
    }, 'public, max-age=60');
};
