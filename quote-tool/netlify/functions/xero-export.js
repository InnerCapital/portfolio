// netlify/functions/xero-export.js
//
// Called from the quote tool's "Export to Xero" button. Protected two ways:
//   1. Google staff sign-in (acmehire.example / acmecapital.example), verified server-side
//   2. A test mode (XERO_EXPORT_TEST_MODE=true) that builds the exact payload
//      but never calls Xero, so it can be verified safely before going live
//
// Requires the one-time OAuth connection to already exist (see xero-authorize.js
// and xero-callback.js) — this function only refreshes and uses an existing
// connection, it does not create one.

const { getStore } = require('@netlify/blobs');
const { requireStaff } = require('./lib/requireStaff');

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_QUOTES_URL = 'https://api.xero.com/api.xro/2.0/Quotes';

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  // ── Staff gate ─────────────────────────────────────────
  // Google staff sign-in, verified server-side (see lib/requireStaff.js).
  const staff = await requireStaff(event);
  if (!staff.ok) return staff.response;

  const { quoteRef, quoteDate, expiryDate, contact, depot, lineItems } = body;
  if (!contact || !contact.name) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing customer/contact name.' }) };
  }
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No line items to export.' }) };
  }

  const xeroQuote = {
    Contact: {
      Name: contact.name,
      ...(contact.vatNumber ? { TaxNumber: contact.vatNumber } : {}),
    },
    LineItems: lineItems,
    Date: new Date().toISOString().slice(0, 10),
    ...(expiryDate ? { ExpiryDate: parseExpiry(expiryDate) } : {}),
    Reference: `Acme Hire quote tool ref: ${quoteRef || 'n/a'}${depot ? ' — ' + depot : ''}`,
    Status: 'DRAFT',
    LineAmountTypes: 'Exclusive',
  };

  // ── Test mode — build the payload, never call Xero ─────
  if (String(process.env.XERO_EXPORT_TEST_MODE).toLowerCase() === 'true') {
    return {
      statusCode: 200,
      body: JSON.stringify({ testMode: true, payloadSent: xeroQuote }),
    };
  }

  // ── Real send ───────────────────────────────────────────
  try {
    const store = getStore('xero-tokens');
    const stored = await store.get('connection', { type: 'json' });
    if (!stored || !stored.refreshToken || !stored.tenantId) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Xero is not connected yet. Run the one-time authorize step first (see xero-authorize.js) before using this button for real.',
        }),
      };
    }

    // Refresh the access token (Xero rotates the refresh token every use)
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: stored.refreshToken,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Xero token refresh failed: ' + (tokenData.error_description || tokenData.error || 'unknown error') }) };
    }

    // Persist the new refresh token immediately — Xero invalidates the old one
    await store.setJSON('connection', { refreshToken: tokenData.refresh_token, tenantId: stored.tenantId });

    const quoteRes = await fetch(XERO_QUOTES_URL, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'Xero-tenant-id': stored.tenantId,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ Quotes: [xeroQuote] }),
    });
    const quoteData = await quoteRes.json();

    if (!quoteRes.ok) {
      const msg = (quoteData.Elements && quoteData.Elements[0] && quoteData.Elements[0].ValidationErrors)
        ? quoteData.Elements[0].ValidationErrors.map(e => e.Message).join('; ')
        : (quoteData.Detail || quoteRes.statusText);
      return { statusCode: 502, body: JSON.stringify({ error: 'Xero rejected the quote: ' + msg }) };
    }

    const created = quoteData.Quotes && quoteData.Quotes[0];
    return {
      statusCode: 200,
      body: JSON.stringify({ xeroQuoteNumber: created ? created.QuoteNumber : null, xeroQuoteId: created ? created.QuoteID : null }),
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Unexpected error: ' + e.message }) };
  }
};

function parseExpiry(fmtDateString) {
  // Best-effort parse of the tool's "9 June 2026" style date back to ISO.
  const d = new Date(fmtDateString);
  return isNaN(d) ? undefined : d.toISOString().slice(0, 10);
}
