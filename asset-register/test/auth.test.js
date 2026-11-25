// Run: node --test test/
const test = require('node:test');
const assert = require('node:assert');

process.env.SESSION_SECRET = 'test-secret-' + 'x'.repeat(40);
process.env.BOOQABLE_API_KEY = 'k';
process.env.ANTHROPIC_API_KEY = 'k';
process.env.SUPABASE_URL = 'https://supabase.test';
process.env.SUPABASE_SERVICE_KEY = 'k';

const auth = require('../netlify/functions/lib/auth');
const { CLIENT_ID } = auth;
const future = () => String(Math.floor(Date.now() / 1000) + 600);
const info = (o = {}) => async () => ({ aud: CLIENT_ID, exp: future(), email: 'jo@acmehire.example', email_verified: 'true', hd: 'acmehire.example', name: 'Jo', ...o });

test('accepts a verified Acme Hire Google token', async () => {
  const u = await auth.verifyGoogleCredential('tok', info());
  assert.equal(u.email, 'jo@acmehire.example');
});

for (const [name, o, status] of [
  ['wrong audience', { aud: 'someone-else' }, 401],
  ['expired', { exp: '1' }, 401],
  ['personal gmail', { email: 'jo@gmail.com', hd: undefined }, 403],
  ['unverified email', { email_verified: 'false' }, 403],
  ['hd mismatch', { hd: 'evil.com' }, 403],
]) {
  test('rejects ' + name, async () => {
    await assert.rejects(auth.verifyGoogleCredential('tok', info(o)), (e) => e.status === status);
  });
}

test('rejects when Google says the token is invalid', async () => {
  await assert.rejects(auth.verifyGoogleCredential('tok', async () => { throw new Error('400'); }), (e) => e.status === 401);
});

const cookieFor = (user) => auth.sessionCookie(user).split(';')[0];
const ev = (cookie, extra = {}) => ({ httpMethod: 'GET', headers: cookie ? { cookie } : {}, queryStringParameters: {}, ...extra });

test('session cookie round-trips and is HttpOnly/Secure', () => {
  const full = auth.sessionCookie({ email: 'jo@acmehire.example', name: 'Jo' });
  assert.match(full, /HttpOnly/); assert.match(full, /Secure/); assert.match(full, /SameSite=Lax/);
  const r = auth.requireStaff(ev(cookieFor({ email: 'jo@acmehire.example', name: 'Jo' })));
  assert.equal(r.ok, true); assert.equal(r.user.email, 'jo@acmehire.example');
});

test('tampered, expired or non-staff cookies are refused', () => {
  const good = cookieFor({ email: 'jo@acmehire.example' });
  const [body, sig] = good.split('=')[1].split('.');
  const forged = Buffer.from(JSON.stringify({ email: 'x@acmehire.example', exp: 9e9 })).toString('base64url');
  assert.equal(auth.requireStaff(ev(`ah_ops=${forged}.${sig}`)).ok, false);
  assert.equal(auth.requireStaff(ev(`ah_ops=${body}.AAAA`)).ok, false);
  assert.equal(auth.requireStaff(ev('ah_ops=' + auth.sign({ email: 'jo@acmehire.example', exp: 1 }))).ok, false);
  assert.equal(auth.requireStaff(ev('ah_ops=' + auth.sign({ email: 'jo@gmail.com', exp: 9e9 }))).ok, false);
  assert.equal(auth.requireStaff(ev(null)).ok, false);
});

test('every data function returns 401 without a session', async () => {
  for (const [name, method] of [['booqable', 'GET'], ['hapn', 'GET'], ['intelligence', 'POST'], ['asset-register', 'GET'], ['sheet', 'GET']]) {
    const fn = require('../netlify/functions/' + name);
    const r = await fn.handler(ev(null, { httpMethod: method, body: '{}', queryStringParameters: { action: 'get', id: 'AHUKB260001' } }));
    assert.equal(r.statusCode, 401, name);
  }
});

test('login GET says 401 when signed out and returns the user when signed in', async () => {
  const login = require('../netlify/functions/login');
  assert.equal((await login.handler(ev(null))).statusCode, 401);
  const r = await login.handler(ev(cookieFor({ email: 'jo@acmehire.example', name: 'Jo' })));
  assert.equal(r.statusCode, 200);
  assert.equal(JSON.parse(r.body).email, 'jo@acmehire.example');
  const out = await login.handler(ev(null, { httpMethod: 'DELETE' }));
  assert.match(out.headers['Set-Cookie'], /Max-Age=0/);
});

test('public asset lookup returns only ID, type and inspection badge', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).startsWith('https://docs.google.com')) {
      return new Response('Asset ID,Category,Status,Location,Client,Manufacturer Serial,Notes\nAHUKB260001,Bar,On Hire,"1 Secret St, London",Acme Ltd,SN123,"has a ""quote"""\n');
    }
    return new Response(JSON.stringify([{ status: 'pass' }]));
  };
  try {
    const fn = require('../netlify/functions/asset-public');
    const r = await fn.handler(ev(null, { queryStringParameters: { id: 'ahukb260001' } }));
    assert.equal(r.statusCode, 200);
    assert.deepEqual(JSON.parse(r.body), { found: true, id: 'AHUKB260001', type: 'Bar', registerStatus: 'pass' });
    assert.doesNotMatch(r.body, /Secret|Acme|SN123|On Hire/);
    const missing = await fn.handler(ev(null, { queryStringParameters: { id: 'AHUKB269999' } }));
    assert.equal(missing.statusCode, 404);
    const bad = await fn.handler(ev(null, { queryStringParameters: { id: '../../etc' } }));
    assert.equal(bad.statusCode, 400);
  } finally { global.fetch = realFetch; }
});
