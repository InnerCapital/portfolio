// Acme Hire Asset Portal — asset register sheet (staff only)
// Netlify Function: /api/sheet?tab=assets|equipment → the sheet as CSV text.

const { requireStaff } = require('./lib/auth');
const { fetchSheetCsv } = require('./lib/sheet');

exports.handler = async (event) => {
    const auth = requireStaff(event);
    if (!auth.ok) return auth.response;
    if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method not allowed' };
    const tab = (event.queryStringParameters || {}).tab === 'equipment' ? 'equipment' : 'assets';
    try {
        const csv = await fetchSheetCsv(tab);
        return { statusCode: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store' }, body: csv };
    } catch (err) {
        console.error('[sheet]', err.message);
        return { statusCode: 502, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Sheet unavailable' }) };
    }
};
