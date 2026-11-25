// Run: npm test  (no network; fetch is mocked)
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");

const DEAL = "11111111-2222-3333-4444-555555555555";
let calls, supabaseRows, supabaseFailFirst, attioQueryRows, currentStatus;

global.fetch = async (url, opts = {}) => {
  calls.push({ url, method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  const ok = (j) => ({ ok: true, status: 200, json: async () => j, text: async () => JSON.stringify(j) });
  if (url.includes("supabase.test")) {
    if (supabaseFailFirst && url.includes("attio_deal_id")) return { ok: false, status: 400, json: async () => ({}), text: async () => "no column" };
    return ok(supabaseRows);
  }
  if (url.endsWith("/records/query")) return ok({ data: attioQueryRows });
  if (opts.method === "GET" || !opts.method) return ok({ data: { values: currentStatus ? { briefing_status: [{ option: { title: currentStatus } }], insurance_status: [{ option: { title: currentStatus } }] } : {} } });
  return ok({ data: {} });
};

const { syncTraderEvent } = require(path.join(__dirname, "../netlify/functions/lib/attioSync.js"));

function reset({ testMode = "false" } = {}) {
  calls = []; supabaseRows = []; supabaseFailFirst = false; attioQueryRows = []; currentStatus = null;
  process.env.ATTIO_API_KEY = "k";
  process.env.ATTIO_TEST_MODE = testMode;
  process.env.SUPABASE_URL = "https://supabase.test";
  process.env.SUPABASE_SERVICE_KEY = "s";
}
const writes = () => calls.filter((c) => c.url.includes("attio.com") && (c.method === "PATCH" || c.method === "POST") && !c.url.endsWith("/records/query"));

test("uses the deal Ops linked, and writes status + note on sign", async () => {
  reset();
  supabaseRows = [{ attio_deal_id: DEAL, booqable_ref: "1001" }];
  const r = await syncTraderEvent("fold-1", "briefing_signed", { signedBy: "Jo", company: "Tacos Ltd", event: "Fest", tradingPartner: "Jo (Jo Co)" });
  assert.equal(r.executed, true);
  const w = writes();
  assert.equal(w.length, 2);
  assert.ok(w[0].url.endsWith(`/records/${DEAL}`));
  assert.deepEqual(w[0].body.data.values, { briefing_status: "Signed" });
  assert.match(w[1].body.data.content, /Tacos Ltd[\s\S]*Event: Fest[\s\S]*Trading Partner: Jo \(Jo Co\)[\s\S]*fold-1/);
  assert.equal(calls.filter((c) => c.url.endsWith("/records/query")).length, 0, "no ref lookup when linked");
});

test("falls back to the single deal matching the stored Booqable ref", async () => {
  reset();
  supabaseRows = [{ attio_deal_id: null, booqable_ref: "#2002" }];
  attioQueryRows = [{ id: { record_id: DEAL } }];
  const r = await syncTraderEvent("fold-2", "insurance_uploaded");
  assert.equal(r.executed, true);
  const q = calls.find((c) => c.url.endsWith("/records/query"));
  assert.deepEqual(q.body.filter, { booqable_order_id: "2002" });
});

test("works before the attio_deal_id column exists", async () => {
  reset();
  supabaseFailFirst = true;
  supabaseRows = [{ booqable_ref: "3003" }];
  attioQueryRows = [{ id: { record_id: DEAL } }];
  const r = await syncTraderEvent("fold-3", "insurance_uploaded");
  assert.equal(r.executed, true);
});

test("skips when two deals share the ref, or no booking row", async () => {
  reset();
  supabaseRows = [{ booqable_ref: "4004" }];
  attioQueryRows = [{ id: { record_id: DEAL } }, { id: { record_id: DEAL } }];
  assert.ok((await syncTraderEvent("fold-4", "insurance_uploaded")).skipped);
  reset();
  assert.ok((await syncTraderEvent("nope", "insurance_uploaded")).skipped);
  assert.equal(writes().length, 0);
});

test("forward only: Verified insurance and repeat signs are left alone, no duplicate note", async () => {
  reset();
  supabaseRows = [{ attio_deal_id: DEAL }];
  currentStatus = "Verified";
  await syncTraderEvent("f", "insurance_uploaded");
  currentStatus = "Signed";
  await syncTraderEvent("f", "briefing_signed", { signedBy: "Jo" });
  assert.equal(writes().length, 0);
});

test("test mode logs but writes nothing", async () => {
  reset({ testMode: undefined });
  delete process.env.ATTIO_TEST_MODE;
  supabaseRows = [{ attio_deal_id: DEAL }];
  const r = await syncTraderEvent("f", "briefing_signed", { signedBy: "Jo" });
  assert.equal(r.executed, false);
  assert.equal(r.requests.length, 2);
  assert.equal(writes().length, 0);
});

test("never throws when Supabase is down", async () => {
  reset();
  global.fetchBackup = global.fetch;
  global.fetch = async () => { throw new Error("network down"); };
  const r = await syncTraderEvent("f", "briefing_signed");
  global.fetch = global.fetchBackup;
  assert.match(r.error, /network down/);
});
