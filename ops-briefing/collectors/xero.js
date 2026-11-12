/**
 * Xero Collector (placeholder)
 * Requires Xero OAuth2 app — coordinate with Sam Patel
 *
 * Build approach from Jordan's spec:
 * - Register OAuth 2.0 app at developer.xero.com
 * - Pull: outstanding invoices, bills awaiting payment, bank balance, items needing approval
 * - Flag anything overdue or due within 3 days
 */

async function collectXero(config) {
  const clientId = process.env.XERO_CLIENT_ID;
  const clientSecret = process.env.XERO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log('  Xero: Not configured (needs XERO_CLIENT_ID and XERO_CLIENT_SECRET)');
    return null;
  }

  // TODO: Implement Xero API integration
  // 1. Use xero-node SDK: npm install xero-node
  // 2. OAuth2 token management (similar to Google auth)
  // 3. Pull invoices: GET /api.xro/2.0/Invoices?where=Status=="AUTHORISED"
  // 4. Pull bills: GET /api.xro/2.0/Invoices?where=Type=="ACCPAY"
  // 5. Pull bank balance: GET /api.xro/2.0/Accounts?where=Type=="BANK"

  console.log('  Xero: Placeholder — implementation pending Sam\'s input');

  return {
    invoices: [],
    bills: [],
    balance: null,
    overdueCount: 0,
    _note: 'Xero integration not yet built. Coordinate with Sam Patel for access.',
  };
}

module.exports = { collectXero };
