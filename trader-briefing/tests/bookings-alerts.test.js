// Run with: npm test  (node --test, no extra dependencies)
// Mocks global fetch so nothing reaches Supabase, Zapier or Slack.
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = "https://supabase.test";
process.env.SUPABASE_SERVICE_KEY = "service-key";
process.env.BOOKINGS_ALERT_WEBHOOK_URL = "https://hooks.test/catch";

const calls = [];
let rows = [];
let hookOk = true;
let booqableOrders = [];
global.fetch = async (url, opts = {}) => {
  calls.push({ url: String(url), method: opts.method || "GET", body: opts.body ? JSON.parse(opts.body) : null });
  if (String(url).startsWith("https://hooks.test")) return { ok: hookOk, status: hookOk ? 200 : 500, json: async () => ({}) };
  if (String(url).startsWith("https://acme-hire.booqable.com")) return { ok: true, status: 200, json: async () => ({ orders: booqableOrders }) };
  if (opts.method === "PATCH") return { ok: true, status: 200, json: async () => [{ id: "row-1" }] };
  return { ok: true, status: 200, json: async () => rows };
};

const isoInDays = (n) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const reminders = require("../netlify/functions/send-briefing-reminders.js");
const { slackEscape, postBookingsAlert } = require("../netlify/functions/lib/bookingsAlert.js");
const { markBriefingComplete } = require("../netlify/functions/lib/briefingTracker.js");

const reset = () => { calls.length = 0; hookOk = true; };
const hooks = () => calls.filter((c) => c.url.startsWith("https://hooks.test"));
const patches = () => calls.filter((c) => c.method === "PATCH");

test("slackEscape neutralises Slack control characters", () => {
  assert.equal(slackEscape("A&B <x>"), "A&amp;B &lt;x&gt;");
});

test("postBookingsAlert is a no-op without a webhook URL", async () => {
  reset();
  const saved = process.env.BOOKINGS_ALERT_WEBHOOK_URL;
  delete process.env.BOOKINGS_ALERT_WEBHOOK_URL;
  assert.equal(await postBookingsAlert("hi"), false);
  assert.equal(calls.length, 0);
  process.env.BOOKINGS_ALERT_WEBHOOK_URL = saved;
});

test("markBriefingComplete matches folder id first, then ref", async () => {
  reset();
  await markBriefingComplete({ folderId: "F1", booqableRef: "19" });
  assert.match(patches()[0].url, /folder_id=eq\.F1/);
  assert.equal(patches()[0].body.status, "complete");
  reset();
  await markBriefingComplete({ booqableRef: "19" });
  assert.match(patches()[0].url, /booqable_ref=eq\.19/);
  reset();
  assert.deepEqual(await markBriefingComplete({}), []);
  assert.equal(calls.length, 0);
});

test("D-7: pending booking gets a warning and moves to reminded", async () => {
  reset();
  rows = [{ id: "a", status: "pending", artwork_status: "complete", company: "Acme", booqable_ref: "19", delivery_date: isoInDays(6), contact_email: "a@x.co" }];
  const res = await reminders.handler({});
  const body = JSON.parse(res.body);
  assert.equal(body.declarations.d7, 1);
  assert.equal(hooks().length, 1);
  assert.match(hooks()[0].body.text, /not signed yet, delivery in 6 day/);
  assert.equal(hooks()[0].body.source, "trader-briefing");
  const p = patches().find((x) => x.body.status);
  assert.equal(p.body.status, "reminded");
});

test("D-2 or later: pending or reminded booking escalates to overdue", async () => {
  for (const status of ["pending", "reminded"]) {
    reset();
    rows = [{ id: "b", status, artwork_status: "complete", company: "Acme", delivery_date: isoInDays(1) }];
    const body = JSON.parse((await reminders.handler({})).body);
    assert.equal(body.declarations.overdue, 1, status);
    assert.match(hooks()[0].body.text, /still not signed/);
    assert.equal(patches().find((x) => x.body.status).body.status, "overdue");
  }
});

test("far-off bookings and reminded bookings before D-2 are left alone", async () => {
  reset();
  rows = [
    { id: "c", status: "pending", artwork_status: "complete", delivery_date: isoInDays(20) },
    { id: "d", status: "reminded", artwork_status: "complete", delivery_date: isoInDays(5) },
  ];
  const body = JSON.parse((await reminders.handler({})).body);
  assert.equal(body.declarations.d7 + body.declarations.overdue, 0);
  assert.equal(hooks().length, 0);
});

test("if the alert fails, status is not advanced so it retries tomorrow", async () => {
  reset();
  hookOk = false;
  rows = [{ id: "e", status: "pending", artwork_status: "complete", delivery_date: isoInDays(3) }];
  await reminders.handler({});
  assert.equal(hooks().length, 1);
  assert.equal(patches().filter((x) => x.body.status).length, 0);
});

test("flags confirmed bookings with no briefing on alert days only", async () => {
  reset();
  process.env.BOOQABLE_API_KEY = "test-key";
  booqableOrders = [
    { id: "o1", number: 41, status: "reserved", starts_at: `${isoInDays(7)}T09:00:00Z`, customer: { name: "No Link Ltd" } },
    { id: "o2", number: 42, status: "reserved", starts_at: `${isoInDays(7)}T09:00:00Z`, customer: { name: "Has Link Ltd" } },
    { id: "o3", number: 43, status: "reserved", starts_at: `${isoInDays(9)}T09:00:00Z` }, // not an alert day
    { id: "o4", number: 44, status: "concept", starts_at: `${isoInDays(7)}T09:00:00Z` }, // not confirmed
  ];
  // trader_briefing_bookings: chase query returns nothing; tracked refs contain 42
  rows = [{ booqable_ref: "42", status: "complete" }];
  const body = JSON.parse((await reminders.handler({})).body);
  assert.equal(body.missing.flagged, 1);
  const msgs = hooks().map((h) => h.body.text).filter((t) => /No Trader Briefing sent/.test(t));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /booking #41, starting in 7 day/);
  assert.match(msgs[0], /No Link Ltd/);
  delete process.env.BOOQABLE_API_KEY;
  booqableOrders = [];
});

test("#bookings Slack address is BCC'd once, and can be switched off", () => {
  const { withBookingsBcc } = require("../netlify/functions/lib/bookingsAlert.js");
  const slack = "bookings-channel@acme-workspace.slack.com";
  assert.deepEqual(withBookingsBcc(["hello@acmehire.example"]), ["hello@acmehire.example", slack]);
  assert.deepEqual(withBookingsBcc([slack.toUpperCase()]), [slack.toUpperCase()]);
  assert.deepEqual(withBookingsBcc(undefined), [slack]);
  process.env.BOOKINGS_BCC_EMAIL = "off";
  assert.deepEqual(withBookingsBcc(["a@b.co"]), ["a@b.co"]);
  delete process.env.BOOKINGS_BCC_EMAIL;
});

test("reminder emails carry the #bookings BCC", async () => {
  reset();
  process.env.RESEND_API_KEY = "re_test";
  rows = [{ id: "r1", status: "complete", artwork_status: "pending", company: "Acme", contact_email: "t@acme.co", delivery_date: isoInDays(6) }];
  await reminders.handler({});
  const email = calls.find((c) => c.url === "https://api.resend.com/emails");
  assert.ok(email, "reminder email sent");
  assert.deepEqual(email.body.bcc, ["bookings-channel@acme-workspace.slack.com"]);
  delete process.env.RESEND_API_KEY;
});
