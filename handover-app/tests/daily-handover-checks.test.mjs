// Run with: npm test  (node --test, mocks fetch; nothing reaches Supabase or Slack)
import test from "node:test";
import assert from "node:assert/strict";

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_KEY = "key";
process.env.BOOKINGS_ALERT_WEBHOOK_URL = "https://hooks.test/catch";
process.env.NEXT_PUBLIC_BASE_URL = "https://app.test";

const NOW = new Date("2026-11-20T09:00:00Z");
const ago = (d) => new Date(NOW.getTime() - d * 86400000).toISOString();

let unsignedRows = [];
let collectedRows = [];
const posts = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith("https://hooks.test")) {
    posts.push(JSON.parse(opts.body));
    return { ok: true, json: async () => ({}) };
  }
  if (u.includes("status=eq.awaiting_signature")) return { ok: true, json: async () => unsignedRows };
  if (u.includes("type=eq.checkin")) return { ok: true, json: async () => collectedRows };
  throw new Error(`unexpected fetch ${u}`);
};

const mod = await import("../netlify/functions/daily-handover-checks.mjs");

test("daysSince counts calendar days", () => {
  assert.equal(mod.daysSince("2026-11-17T23:59:00Z", NOW), 3);
  assert.equal(mod.daysSince(null, NOW), null);
});

test("unsigned certificates alert on day 3 and 7 only", async () => {
  posts.length = 0;
  unsignedRows = [
    { id: "a1", booqable_order_id: "19", type: "checkout", company_name: "Acme", customer_email: "a@x.co", link_sent_at: ago(3) },
    { id: "a2", type: "checkin", link_sent_at: ago(7) },
    { id: "a3", type: "checkout", link_sent_at: ago(5) },
  ];
  collectedRows = [];
  const r = await mod.runChecks(NOW);
  assert.equal(r.unsignedAlerts, 2);
  assert.match(posts[0].text, /Handover certificate still unsigned after 3 days/);
  assert.match(posts[1].text, /Collection certificate still unsigned after 7 days/);
  assert.match(posts[1].text, /7-day response window has passed/);
  assert.equal(posts[0].source, "handover-app");
});

test("deposit clock alerts on day 10 and day 14", async () => {
  posts.length = 0;
  unsignedRows = [];
  collectedRows = [
    { id: "c1", booqable_order_id: "20", type: "checkin", signed_at: ago(10) },
    { id: "c2", type: "checkin", signed_at: ago(14) },
    { id: "c3", type: "checkin", signed_at: ago(12) },
  ];
  const r = await mod.runChecks(NOW);
  assert.equal(r.depositAlerts, 2);
  assert.match(posts[0].text, /Deposit refund due in 4 days \(2026-11-24\)/);
  assert.match(posts[1].text, /Deposit refund due today \(2026-11-20\)/);
  assert.match(posts[1].text, /app\.test\/record\/c2/);
});
