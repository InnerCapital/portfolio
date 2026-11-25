// Reads the asset register Google Sheet on the server, so its address never
// reaches the browser. Set SHEET_CSV_URL / EQUIPMENT_SHEET_URL in Netlify to
// override; the defaults are the sheet's existing published-CSV links.

const DEFAULT_ASSETS = 'https://docs.google.com/spreadsheets/d/e/2PACX-YOUR_PUBLISHED_SHEET_ID/pub?gid=0&single=true&output=csv';
const DEFAULT_EQUIPMENT = 'https://docs.google.com/spreadsheets/d/e/2PACX-YOUR_PUBLISHED_SHEET_ID/pub?output=csv&sheet=Equipment';

function sheetUrl(tab) {
    if (tab === 'equipment') return process.env.EQUIPMENT_SHEET_URL || DEFAULT_EQUIPMENT;
    return process.env.SHEET_CSV_URL || DEFAULT_ASSETS;
}

async function fetchSheetCsv(tab) {
    const url = sheetUrl(tab);
    const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
    if (!res.ok) throw new Error('Sheet fetch failed: ' + res.status);
    return res.text();
}

// Minimal CSV parser that handles quoted fields with commas and "" escapes.
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', q = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (q) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') q = false;
            else field += c;
        } else if (c === '"') q = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++;
            row.push(field); field = '';
            if (row.some((v) => v.trim() !== '')) rows.push(row);
            row = [];
        } else field += c;
    }
    row.push(field);
    if (row.some((v) => v.trim() !== '')) rows.push(row);
    if (!rows.length) return [];
    const head = rows[0].map((h) => h.trim().toLowerCase());
    return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

module.exports = { fetchSheetCsv, parseCsv };
