// netlify/functions/lib/catalog.js
//
// The list of tools on the staff hub. Served only to signed-in staff by
// the `tools` function, so this list is never in the public page source.
//
// status: 'live'   → shown as a link
//         'setup'  → shown, not linked yet (being set up)
//         'build'  → shown, not linked yet (being built)
//
// When the DNS change sheet lands, swap the netlify.app / vercel.app
// addresses for quote., traders., handover. and assets.acmehire.example.

const GROUPS = [
  {
    title: 'Our tools',
    tools: [
      {
        name: 'Quote tool',
        what: 'Build hire and sale quotes, save the PDF, send to Booqable.',
        url: 'https://quote.acmehire.example',
        status: 'live',
      },
      {
        name: 'Trader briefing',
        what: 'Create a briefing and declaration link for a trader.',
        url: 'https://traders.acmehire.example/generate.html',
        status: 'live',
      },
      {
        name: 'Handover app',
        what: 'Depot checks, handover and collection inspections with photos.',
        url: 'https://handover.acmehire.example',
        status: 'live',
      },
      {
        name: 'Asset register',
        what: 'Every unit, its status, defects and history. QR codes open here.',
        url: 'https://assets.acmehire.example',
        status: 'live',
      },
      {
        name: 'Booqable to Xero',
        what: 'Deposit and balance invoices, payment matching.',
        status: 'build',
      },
    ],
  },
  {
    title: 'Hire and money',
    tools: [
      { name: 'Booqable', what: 'Orders, availability and stock.', url: 'https://acme-hire.booqable.com', status: 'live' },
      { name: 'Attio', what: 'CRM: leads, clients and deals.', url: 'https://app.attio.com/acme-hire', status: 'live' },
      { name: 'Xero', what: 'Invoices, bills and accounts.', url: 'https://go.xero.com', status: 'live' },
      { name: 'Revolut Business', what: 'Bank account and payments.', url: 'https://business.revolut.com', status: 'live' },
    ],
  },
  {
    title: 'Google Workspace',
    tools: [
      { name: 'Gmail', what: 'Email.', url: 'https://mail.google.com', status: 'live' },
      { name: 'Calendar', what: 'Bookings, deliveries and meetings.', url: 'https://calendar.google.com', status: 'live' },
      {
        name: 'Shared drive',
        what: 'Acme Hire Digital Storage: inspection photos and documents.',
        url: 'https://drive.google.com/drive/folders/YOUR_DRIVE_FOLDER_ID',
        status: 'live',
      },
    ],
  },
  {
    title: 'Website',
    tools: [
      { name: 'Webflow', what: 'Edit acmehire.example.', url: 'https://webflow.com/dashboard', status: 'live' },
    ],
  },
];

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// The vault holds API keys and passwords. Only the accounts in VAULT_ADMINS
// see its link; everyone else sees who to ask. Both env vars must be set,
// and the URL must be https, or nobody sees the link.
function vaultFor(email, env) {
  const admins = parseList(env.VAULT_ADMINS);
  const url = String(env.VAULT_URL || '').trim();
  if (!/^https:\/\//i.test(url)) return null;
  if (!admins.includes(String(email || '').toLowerCase())) return null;
  return {
    title: 'Admin',
    tools: [{ name: 'Vault', what: 'API keys and passwords. Admin access only.', url, status: 'live' }],
  };
}

function catalogFor(email, env) {
  const groups = GROUPS.map((g) => ({ title: g.title, tools: g.tools.map((t) => ({ ...t })) }));
  const vault = vaultFor(email, env);
  if (vault) groups.push(vault);
  return { groups, isVaultAdmin: Boolean(vault) };
}

module.exports = { catalogFor, GROUPS };
