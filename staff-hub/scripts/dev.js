// Local preview only — never deployed (Netlify serves public/ and netlify/functions/).
// Serves the page and the tools function with a FAKE signed-in user, so the
// layout can be checked without Google sign-in. Usage:
//   node scripts/dev.js            → staff view
//   DEV_EMAIL=hello@acmehire.example node scripts/dev.js   → admin view
//   open /?signedout                                       → sign-in view
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handle } = require('../netlify/functions/tools');

const PORT = Number(process.env.PORT || 3021);
const EMAIL = process.env.DEV_EMAIL || 'staff@acmehire.example';
const ENV = { VAULT_URL: 'https://vault.example.test', VAULT_ADMINS: 'hello@acmehire.example' };
const fakeVerify = async () => ({ email: EMAIL, email_verified: true, hd: EMAIL.split('@')[1], name: 'Dev' });
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };
const PUBLIC = path.join(__dirname, '..', 'public');

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/.netlify/functions/tools') {
    const r = await handle({ httpMethod: req.method, headers: req.headers }, ENV, fakeVerify);
    res.writeHead(r.statusCode, r.headers || {});
    return res.end(r.body);
  }
  const file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : path.normalize(url.pathname));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  let body = fs.readFileSync(file);
  if (file.endsWith('index.html') && !url.searchParams.has('signedout')) {
    body = body.toString().replace('<script src="/app.js"', '<script>window.__AH_DEV_TOKEN="dev"</script><script src="/app.js"');
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}).listen(PORT, () => console.log(`Staff hub preview on http://localhost:${PORT} as ${EMAIL}`));
