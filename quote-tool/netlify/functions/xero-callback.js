// netlify/functions/xero-callback.js
//
// Part of the one-time setup — Xero redirects here after Jordan approves the
// connection in xero-authorize.js. Exchanges the auth code for tokens, finds
// the Acme Hire Xero organisation (tenant), and stores both for xero-export.js
// to use going forward. Nothing to run manually here.

const { getStore } = require('@netlify/blobs');

const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';

exports.handler = async function (event) {
  const code = event.queryStringParameters && event.queryStringParameters.code;
  if (!code) {
    return { statusCode: 400, body: 'Missing authorization code from Xero.' };
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;
  const redirectUri = process.env.XERO_REDIRECT_URI;

  try {
    const tokenRes = await fetch(XERO_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return { statusCode: 502, body: 'Token exchange failed: ' + (tokenData.error_description || tokenData.error) };
    }

    const connRes = await fetch(XERO_CONNECTIONS_URL, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const connections = await connRes.json();
    if (!connRes.ok || !connections.length) {
      return { statusCode: 502, body: 'Could not find a connected Xero organisation. Did you select Acme Hire when approving?' };
    }

    // If more than one organisation is connected to this app, take the first —
    // flag this in the response so Jordan can confirm it's the right one.
    const tenantId = connections[0].tenantId;
    const tenantName = connections[0].tenantName;

    const store = getStore('xero-tokens');
    await store.setJSON('connection', { refreshToken: tokenData.refresh_token, tenantId });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html' },
      body: `<h2>Xero connected</h2><p>Connected organisation: <strong>${tenantName}</strong></p><p>If that's not Acme Hire/AcmeCo, disconnect the app in Xero and run the authorize step again, selecting the right organisation.</p><p>You can close this tab.</p>`,
    };
  } catch (e) {
    return { statusCode: 500, body: 'Unexpected error during Xero connection: ' + e.message };
  }
};
