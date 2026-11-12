// netlify/functions/xero-authorize.js
//
// ONE-TIME SETUP STEP — run by Jordan only, not part of daily use.
// Visit https://YOUR-SITE.netlify.app/.netlify/functions/xero-authorize?passcode=YOUR_ADMIN_PASSCODE
// in a browser while logged into the Acme Hire Xero account. It redirects to
// Xero's consent screen; approving it sends you to xero-callback.js, which
// stores the connection. Do this once, then never again unless you
// disconnect the app in Xero or the refresh token gets revoked.

exports.handler = async function (event) {
  const expected = process.env.XERO_ADMIN_PASSCODE;
  const given = event.queryStringParameters && event.queryStringParameters.passcode;
  if (!expected || given !== expected) {
    return { statusCode: 401, body: 'Incorrect or missing passcode.' };
  }

  const clientId = process.env.XERO_CLIENT_ID;
  const redirectUri = process.env.XERO_REDIRECT_URI; // e.g. https://quote-tool-demo.netlify.app/.netlify/functions/xero-callback
  if (!clientId || !redirectUri) {
    return { statusCode: 500, body: 'XERO_CLIENT_ID or XERO_REDIRECT_URI is not configured.' };
  }

  const scope = encodeURIComponent('offline_access accounting.transactions accounting.contacts');
  const authorizeUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=quote-tool`;

  return {
    statusCode: 302,
    headers: { Location: authorizeUrl },
    body: '',
  };
};
