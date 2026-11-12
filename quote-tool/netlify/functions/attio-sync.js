// netlify/functions/attio-sync.js
//
// Fired by the quote tool's "Save as PDF" action. Forwards the issued quote to
// an Attio workflow ("Webhook received" trigger), which creates/updates the deal.
//
// Env:
//   ATTIO_WEBHOOK_URL — the trigger URL from the Attio workflow. Server-side only,
//                       never sent to the browser. If unset, sync is skipped (the
//                       PDF still saves) so the tool works before Attio is set up.
//
// Staff-only: requires a valid Google sign-in (see lib/requireStaff.js).
// The same quote can be saved more than once — the Attio workflow should match
// the deal on `quoteRef` so repeat saves update rather than duplicate.

const { requireStaff } = require('./lib/requireStaff');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const staff = await requireStaff(event);
  if (!staff.ok) return staff.response;

  let quote;
  try {
    quote = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid request body' });
  }
  if (!quote.quoteRef || !quote.contact || !quote.contact.name) {
    return json(400, { error: 'Missing quote reference or customer name.' });
  }

  const webhookUrl = process.env.ATTIO_WEBHOOK_URL;
  if (!webhookUrl) return json(200, { skipped: true, reason: 'ATTIO_WEBHOOK_URL is not configured' });

  // Who issued it comes from the verified sign-in, not the request body.
  const payload = {
    ...quote,
    event: 'quote.issued',
    source: 'quote-tool',
    issuedByEmail: staff.email,
    issuedByName: staff.name || quote.issuedByName || '',
    sentAt: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('Attio webhook rejected:', res.status, text.slice(0, 500));
      return json(502, { error: `Attio rejected the quote (HTTP ${res.status}).` });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('Attio webhook unreachable:', e);
    return json(502, { error: 'Could not reach Attio.' });
  }
};
