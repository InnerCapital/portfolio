// netlify/functions/attio-update.js
//
// Ops-triggered Attio write from generate.html. Gated three ways:
//   1. Google ID token verified server-side (staff domains only)
//   2. Write passcode (prompted on the page, checked against ATTIO_WRITE_PASSCODE)
//   3. Event allowlist in lib/attio.js: only "briefing_sent" is accepted here
//
// Test mode (default until ATTIO_TEST_MODE=false, or testMode:true in the body)
// returns the exact Attio requests without sending them.
//
// Body: { dealId, event: "briefing_sent", testMode? }
const { applyEvent } = require("./lib/attio");
const { requireOpsUser, requirePasscode } = require("./lib/opsAuth");

const OPS_EVENTS = ["briefing_sent"];

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  let user;
  try {
    user = await requireOpsUser(event);
    requirePasscode(event);
  } catch (err) {
    return { statusCode: err.statusCode || 401, headers, body: JSON.stringify({ error: err.message }) };
  }

  let data;
  try { data = JSON.parse(event.body || "{}"); } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { dealId, event: eventName, testMode } = data;
  if (!OPS_EVENTS.includes(eventName)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Event not allowed" }) };
  }

  try {
    const result = await applyEvent(dealId, eventName, { by: user.email }, { testMode: testMode === true });
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", ...result }) };
  } catch (err) {
    console.error("attio-update error:", err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: err.message }) };
  }
};
