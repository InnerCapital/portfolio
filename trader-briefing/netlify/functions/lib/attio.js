// netlify/functions/lib/attio.js
//
// Attio is the system of record for the booking (company, contacts, dates,
// unit types, and the pre-delivery status fields the D-90/30/14 hire reminder
// workflow chases). This tool is the system of record for the trader's
// evidence (declaration, signature, insurance files in the Drive job folder).
//
// Everything that touches Attio goes through here:
//   - getDealByBooqableRef(): read-only lookup used by the generate page
//   - applyEvent(): the ONLY way this tool writes to Attio. A fixed allowlist
//     of events, each mapped to a fixed set of deal fields. Nothing else can be
//     written, whatever the caller sends.
//
// Test mode: unless ATTIO_TEST_MODE is explicitly "false", every write builds
// and logs the exact request it would send and returns it, without calling
// Attio. Flip to "false" in Netlify only once the test payloads look right.
//
// Env: ATTIO_API_KEY (read + write on deals, read on companies/people, notes)

const ATTIO_BASE = "https://api.attio.com/v2";

// Attio select option titles <-> the unit type names this tool uses on the
// trader page and in the link params.
const UNIT_TYPE_FROM_ATTIO = {
  "Street Food Kitchen": "Street Food",
  "Dark Kitchen": "Dark Kitchen",
  "Bar Unit": "Bar",
};

function isTestMode(requested) {
  if (requested === true) return true;
  return process.env.ATTIO_TEST_MODE !== "false";
}

async function attioRequest(method, path, body) {
  const key = process.env.ATTIO_API_KEY;
  if (!key) throw new Error("ATTIO_API_KEY not configured");
  const res = await fetch(ATTIO_BASE + path, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON error body */ }
  if (!res.ok) {
    const msg = (json && (json.message || json.code)) || text || "no body";
    throw new Error(`Attio ${method} ${path} ${res.status}: ${msg}`);
  }
  return json;
}

// ── Value helpers (Attio returns every attribute as an array of values) ──
const first = (values, key) => (Array.isArray(values?.[key]) && values[key][0]) || null;
const text = (values, key) => first(values, key)?.value ?? null;
const date = (values, key) => first(values, key)?.value ?? null; // YYYY-MM-DD
const selectTitle = (values, key) => first(values, key)?.option?.title ?? null;
const selectTitles = (values, key) => (values?.[key] || []).map((v) => v?.option?.title).filter(Boolean);
const statusTitle = (values, key) => first(values, key)?.status?.title ?? null;
const refIds = (values, key) => (values?.[key] || []).map((v) => v?.target_record_id).filter(Boolean);

async function getRecord(object, id) {
  const res = await attioRequest("GET", `/objects/${object}/records/${encodeURIComponent(id)}`);
  return res?.data || null;
}

async function getDealById(dealId) {
  return getRecord("deals", dealId);
}

// Find the deal by Booqable order ID (unique on deals, set by Sales or the
// Booqable->Attio Zap) and return everything the generate page needs.
async function getDealByBooqableRef(ref) {
  const res = await attioRequest("POST", "/objects/deals/records/query", {
    filter: { booqable_order_id: String(ref).trim() },
    limit: 2,
  });
  const rows = res?.data || [];
  if (!rows.length) return null;
  return mapDeal(rows[0]);
}

async function mapDeal(deal) {
  const v = deal.values || {};
  const dealId = deal.id?.record_id;

  // Company
  let company = "";
  const companyId = refIds(v, "associated_company")[0];
  if (companyId) {
    try {
      const c = await getRecord("companies", companyId);
      company = text(c?.values, "name") || "";
    } catch (e) { console.error("Attio company fetch failed:", e.message); }
  }

  // People: first associated person is the primary contact; every associated
  // person's first email goes into the (comma-separated) email field.
  const people = [];
  for (const pid of refIds(v, "associated_people").slice(0, 5)) {
    try {
      const p = await getRecord("people", pid);
      const pv = p?.values || {};
      people.push({
        name: first(pv, "name")?.full_name || "",
        email: first(pv, "email_addresses")?.email_address || "",
        phone: first(pv, "phone_numbers")?.phone_number || first(pv, "phone_numbers")?.original_phone_number || "",
      });
    } catch (e) { console.error("Attio person fetch failed:", e.message); }
  }
  const primary = people[0] || {};

  // "Unit types" (multi-choice) replaced the single-choice "Unit type"; read the
  // old field only for deals that haven't been given the new one yet.
  const attioTypes = selectTitles(v, "unit_types").length ? selectTitles(v, "unit_types") : selectTitles(v, "unit_type");
  const unitTypes = [...new Set(attioTypes.map((t) => UNIT_TYPE_FROM_ATTIO[t]).filter(Boolean))];

  return {
    dealId,
    dealName: text(v, "name") || "",
    stage: statusTitle(v, "stage"),
    booqableRef: text(v, "booqable_order_id") || "",
    company,
    contactName: primary.name || "",
    contactPhone: primary.phone || "",
    email: people.map((p) => p.email).filter(Boolean).join(", "),
    deliveryDate: date(v, "delivery_date"),
    collectionDate: date(v, "collection_date"),
    unitTypes,
    briefingStatus: selectTitle(v, "briefing_status"),
    insuranceStatus: selectTitle(v, "insurance_status"),
  };
}

// ── Writes ───────────────────────────────────────────────────────────────
// Each event: which fields it sets, and which current values it must not
// overwrite (so a late "Sent" can't knock a deal back from "Signed", and an
// upload can't knock Ops' "Verified" back to "Uploaded").
const EVENTS = {
  briefing_sent: {
    field: "briefing_status", value: "Sent", keepIf: ["Signed"],
  },
  briefing_signed: {
    field: "briefing_status", value: "Signed", keepIf: [],
    note: (ctx) => ({
      title: "Trader Briefing signed",
      content: [
        `Declaration signed by ${ctx.signedBy || "the trader"}${ctx.company ? " for " + ctx.company : ""}${ctx.signedDate ? " on " + ctx.signedDate : ""}.`,
        ctx.event ? `Event: ${ctx.event}` : "",
        ctx.dates ? `Hire dates: ${ctx.dates}` : "",
        ctx.tradingPartner ? `Trading Partner: ${ctx.tradingPartner}` : "",
        ctx.folderId ? `Job folder: https://drive.google.com/drive/folders/${ctx.folderId}` : "",
      ].filter(Boolean).join("\n"),
    }),
  },
  insurance_uploaded: {
    field: "insurance_status", value: "Uploaded", keepIf: ["Verified"],
  },
};

async function applyEvent(dealId, eventName, ctx = {}, opts = {}) {
  const def = EVENTS[eventName];
  if (!def) throw new Error(`Unknown Attio event: ${eventName}`);
  if (!dealId || !/^[0-9a-f-]{36}$/i.test(dealId)) throw new Error("Invalid Attio deal ID");

  const testMode = isTestMode(opts.testMode);

  // Read current value so we never regress a status. In test mode this read
  // still runs (it's harmless) so the logged plan reflects reality.
  let current = null;
  try {
    const deal = await getDealById(dealId);
    current = selectTitle(deal?.values, def.field);
  } catch (e) {
    if (!testMode) throw e;
    console.error("[attio test mode] could not read current value:", e.message);
  }

  const requests = [];
  if (current !== def.value && !def.keepIf.includes(current)) {
    requests.push({
      method: "PATCH",
      path: `/objects/deals/records/${dealId}`,
      body: { data: { values: { [def.field]: def.value } } },
    });
  }
  // Note only alongside a real change, so a repeat submit can't pile
  // duplicate notes onto the deal.
  if (def.note && requests.length) {
    const n = def.note(ctx);
    requests.push({
      method: "POST",
      path: "/notes",
      body: { data: { parent_object: "deals", parent_record_id: dealId, title: n.title, format: "plaintext", content: n.content } },
    });
  }

  const summary = { event: eventName, dealId, field: def.field, current, target: def.value, testMode, requests };

  if (testMode) {
    console.log("[attio test mode] would send:", JSON.stringify(summary));
    return { ...summary, executed: false };
  }

  for (const r of requests) await attioRequest(r.method, r.path, r.body);
  console.log("[attio] sent:", JSON.stringify({ event: eventName, dealId, count: requests.length }));
  return { ...summary, executed: true };
}

module.exports = { getDealByBooqableRef, getDealById, applyEvent, isTestMode, EVENTS, date, attioRequest };
