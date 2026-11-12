/**
 * Dashboard Basic Auth
 *
 * Protects the settings dashboard with HTTP Basic Authentication.
 * The dashboard has no auth by default and would be publicly accessible
 * once deployed to Railway.
 *
 * Set these in Railway Variables panel (or .env locally):
 *   DASHBOARD_USER   — username (default: admin)
 *   DASHBOARD_PASS   — password (required — dashboard is locked if unset)
 *
 * Usage: call checkAuth(req, res) at the top of the request handler.
 * Returns true if authenticated, false if it has already sent a 401 response.
 */

function checkAuth(req, res) {
  const user = process.env.DASHBOARD_USER || 'admin';
  const pass = process.env.DASHBOARD_PASS;

  // If no password is set, block access entirely rather than running open
  if (!pass) {
    res.writeHead(503, { 'Content-Type': 'text/plain' });
    res.end('Dashboard locked: set DASHBOARD_USER and DASHBOARD_PASS environment variables.');
    return false;
  }

  // Skip auth for the Google OAuth callback and the MCP endpoint —
  // both handle their own auth internally
  const pathname = require('url').parse(req.url).pathname;
  if (pathname === '/auth/callback') return true;
  if (pathname === '/mcp') return true;
  // Skip auth for the MCP connector OAuth endpoints — they must be publicly
  // reachable for Claude to discover + complete the OAuth flow (the /authorize
  // page has its own password gate).
  if (pathname === '/.well-known/oauth-protected-resource') return true;
  if (pathname === '/.well-known/oauth-authorization-server') return true;
  if (pathname === '/.well-known/openid-configuration') return true;
  if (pathname === '/register') return true;
  if (pathname === '/authorize') return true;
  if (pathname === '/token') return true;

  const authHeader = req.headers['authorization'] || '';
  const b64 = authHeader.replace(/^Basic\s+/, '');

  if (b64) {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    const [u, ...pParts] = decoded.split(':');
    const p = pParts.join(':'); // passwords may contain colons
    if (u === user && p === pass) return true;
  }

  res.writeHead(401, {
    'Content-Type': 'text/plain',
    'WWW-Authenticate': 'Basic realm="AH Daily Briefing"'
  });
  res.end('Unauthorized');
  return false;
}

module.exports = { checkAuth };
