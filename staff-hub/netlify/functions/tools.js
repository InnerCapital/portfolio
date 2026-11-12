// netlify/functions/tools.js
//
// GET /.netlify/functions/tools — the staff hub's tool list.
// Signed-in Acme Hire staff only (Google ID token in the Authorization header).

const { requireStaff } = require('./lib/requireStaff');
const { catalogFor } = require('./lib/catalog');

async function handle(event, env = process.env, verify) {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: { Allow: 'GET' }, body: '' };
  }
  const staff = await requireStaff(event, verify);
  if (!staff.ok) return staff.response;

  const { groups, isVaultAdmin } = catalogFor(staff.email, env);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify({ user: { email: staff.email, name: staff.name }, groups, isVaultAdmin }),
  };
}

exports.handler = (event) => handle(event);
exports.handle = handle;
