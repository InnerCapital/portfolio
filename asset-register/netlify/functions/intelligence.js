// Acme Hire Asset Portal — AI Fleet Intelligence
// Netlify Function: /api/intelligence
//
// Environment variables required:
//   ANTHROPIC_API_KEY — Anthropic API key for Claude Haiku
//
// POST /api/intelligence
//   Body: { fleet: [...assets with booqable data], stats: {...} }
//   Returns: { summary: "plain English fleet summary" }

const { requireStaff } = require('./lib/auth');
const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

exports.handler = async (event) => {
    const auth = requireStaff(event);
    if (!auth.ok) return auth.response;
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Intelligence not configured' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON body' }) };
    }

    const { assets = [], booqableFleet = {}, stats = {} } = body;

    // Build a concise fleet snapshot for the prompt
    const fleetLines = assets.map(a => {
        const bq = booqableFleet[a.id] || {};
        const status   = bq.status || a.status || 'Unknown';
        const client   = bq.client || a.client || null;
        const endsAt   = bq.stopsAt ? new Date(bq.stopsAt).toLocaleDateString('en-GB') : null;
        const startsAt = bq.startsAt ? new Date(bq.startsAt).toLocaleDateString('en-GB') : null;
        const location = a.location || null;

        let line = `${a.id} (${a.type || 'Unit'}): ${status}`;
        if (client)   line += ` — hired to ${client}`;
        if (startsAt) line += `, from ${startsAt}`;
        if (endsAt)   line += ` to ${endsAt}`;
        if (location) line += ` at ${location}`;
        return line;
    }).join('\n');

    const totalUnits  = assets.length;
    const onHire      = stats.onHire      || assets.filter(a => (booqableFleet[a.id] || {}).rawStatus === 'started').length;
    const reserved    = stats.reserved    || assets.filter(a => (booqableFleet[a.id] || {}).rawStatus === 'reserved').length;
    const inBuild     = assets.filter(a => (a.status || '').toLowerCase().includes('build')).length;
    const available   = totalUnits - onHire - reserved - inBuild;
    const utilisation = totalUnits > 0 ? Math.round((onHire / totalUnits) * 100) : 0;

    const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const prompt = `You are the operations intelligence system for Acme Hire, a company that rents plug-and-play container kitchens and bars for the events and hospitality industry.

Today is ${today}.

Fleet snapshot:
${fleetLines}

Summary stats:
- Total units: ${totalUnits}
- On hire: ${onHire} (${utilisation}% utilisation)
- Reserved/upcoming: ${reserved}
- In build: ${inBuild}
- Available: ${available}

Write a concise 3-4 sentence operational summary of the fleet status. Be direct and practical — this is for the ops team. Mention utilisation, highlight anything notable (units coming off hire soon, high demand, idle units, units in build), and give one actionable observation if relevant. Do not use bullet points. Do not start with "Acme Hire" or repeat the company name. Write in present tense.`;

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type':      'application/json',
                'x-api-key':         apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model:      'claude-haiku-4-5-20251001',
                max_tokens: 300,
                messages: [{ role: 'user', content: prompt }],
            }),
        });

        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Anthropic API error (${res.status}): ${text}`);
        }

        const data = await res.json();
        const summary = data.content && data.content[0] && data.content[0].text
            ? data.content[0].text.trim()
            : 'Fleet summary unavailable.';

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ok: true,
                summary,
                stats: { totalUnits, onHire, reserved, inBuild, available, utilisation },
                generatedAt: new Date().toISOString(),
            }),
        };

    } catch (err) {
        console.error('Intelligence function error:', err.message);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Intelligence unavailable', detail: err.message }),
        };
    }
};
