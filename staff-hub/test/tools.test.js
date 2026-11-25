const test = require('node:test');
const assert = require('node:assert');
const { handle } = require('../netlify/functions/tools');

const ok = (email, extra = {}) => async () => ({ email, email_verified: true, hd: email.split('@')[1], name: 'Test', ...extra });
const get = (token) => ({ httpMethod: 'GET', headers: token ? { authorization: 'Bearer ' + token } : {} });
const ENV = { VAULT_URL: 'https://vault.example.test/ah', VAULT_ADMINS: 'hello@acmehire.example, director@acmehire.example' };

test('no token → 401, no tool list', async () => {
  const r = await handle(get(), ENV, ok('staff@acmehire.example'));
  assert.equal(r.statusCode, 401);
  assert.ok(!r.body.includes('Quote tool'));
});

test('bad or expired token → 401', async () => {
  const r = await handle(get('x'), ENV, async () => { throw new Error('bad'); });
  assert.equal(r.statusCode, 401);
});

test('personal Gmail → 403', async () => {
  const r = await handle(get('x'), ENV, ok('someone@gmail.com'));
  assert.equal(r.statusCode, 403);
});

test('unverified email → 403', async () => {
  const r = await handle(get('x'), ENV, ok('staff@acmehire.example', { email_verified: false }));
  assert.equal(r.statusCode, 403);
});

test('hd claim mismatch → 403', async () => {
  const r = await handle(get('x'), ENV, ok('staff@acmehire.example', { hd: 'gmail.com' }));
  assert.equal(r.statusCode, 403);
});

test('staff gets tools, no vault link', async () => {
  const r = await handle(get('x'), ENV, ok('staff@acmehire.example'));
  assert.equal(r.statusCode, 200);
  const body = JSON.parse(r.body);
  assert.ok(body.groups.some((g) => g.tools.some((t) => t.name === 'Quote tool')));
  assert.equal(body.isVaultAdmin, false);
  assert.ok(!r.body.includes('vault.example.test'));
});

test('acmecapital.example staff allowed', async () => {
  const r = await handle(get('x'), ENV, ok('ops@acmecapital.example'));
  assert.equal(r.statusCode, 200);
});

test('vault admins see vault (case-insensitive)', async () => {
  for (const email of ['hello@acmehire.example', 'director@acmehire.example']) {
    const body = JSON.parse((await handle(get('x'), ENV, ok(email))).body);
    assert.equal(body.isVaultAdmin, true, email);
    assert.ok(body.groups.at(-1).tools[0].url === ENV.VAULT_URL);
  }
});

test('vault hidden when URL missing or not https', async () => {
  for (const env of [{ VAULT_ADMINS: 'hello@acmehire.example' }, { ...ENV, VAULT_URL: 'http://x.test' }, { ...ENV, VAULT_URL: 'javascript:alert(1)' }]) {
    const body = JSON.parse((await handle(get('x'), env, ok('hello@acmehire.example'))).body);
    assert.equal(body.isVaultAdmin, false);
  }
});

test('non-GET → 405', async () => {
  const r = await handle({ httpMethod: 'POST', headers: {} }, ENV, ok('staff@acmehire.example'));
  assert.equal(r.statusCode, 405);
});

test('every live tool link is https', () => {
  const { GROUPS } = require('../netlify/functions/lib/catalog');
  for (const g of GROUPS) for (const t of g.tools) if (t.status === 'live') assert.match(t.url, /^https:\/\//, t.name);
});
