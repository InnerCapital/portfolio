// netlify/functions/daily-handover-checks.mjs
//
// Netlify scheduled function (runs once a day, see `config` below). Posts two
// kinds of reminder to private Slack #bookings via the Zapier relay:
//
//  1. Unsigned certificates: a site handover/collection certificate sent to the
//     customer but still unsigned, on day 3 and day 7 (the 7-day response
//     window) after the signing link went out, then weekly.
//  2. Deposit refund clock: a collection certificate signed, deposit refund due
//     within 14 days. Reminder on day 10, then "due today / overdue" on day 14.
//
// Stateless: it alerts on fixed days rather than storing "already alerted"
// flags, so it never needs a migration and a missed run only skips one nudge.
// Needs SUPABASE_URL, SUPABASE_SERVICE_KEY, BOOKINGS_ALERT_WEBHOOK_URL and
// NEXT_PUBLIC_BASE_URL (all already used by the app).

const DAY_MS = 24 * 60 * 60 * 1000;
const UNSIGNED_DAYS = new Set([3, 7, 14, 21, 28]);
const DEPOSIT_DAYS = new Set([10, 14]);

function slackEscape(value) {
  return String(value ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Whole calendar days between an ISO timestamp and `now` (UTC dates).
export function daysSince(iso, now = new Date()) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const a = Date.UTC(then.getUTCFullYear(), then.getUTCMonth(), then.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((b - a) / DAY_MS);
}

async function supabaseSelect(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
  return res.json();
}

async function postBookingsAlert(text) {
  const url = process.env.BOOKINGS_ALERT_WEBHOOK_URL;
  if (!url || !text) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "handover-app", text }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch (e) {
    console.error("#bookings alert failed:", e);
    return false;
  }
}

function label(row) {
  const ref = row.booqable_order_id ? `Booking ${row.booqable_order_id}` : `Record ${String(row.id).slice(0, 8)}`;
  const who = row.company_name || row.customer_name;
  return `${slackEscape(ref)}${who ? ` · ${slackEscape(who)}` : ""}`;
}

export function unsignedAlertText(row, days, baseUrl) {
  const what = row.type === "checkin" ? "Collection certificate" : "Handover certificate";
  return [
    `${days >= 7 ? ":rotating_light:" : ":hourglass_flowing_sand:"} *${what} still unsigned after ${days} days* · ${label(row)}`,
    row.customer_email ? `Sent to ${slackEscape(row.customer_email)}` : "",
    days >= 7
      ? "The 7-day response window has passed. Chase the customer, or treat the record as accepted under the Hire Agreement."
      : "Give the customer a nudge to sign.",
    baseUrl ? `Record: ${baseUrl}/inspection/${row.id}` : "",
  ].filter(Boolean).join("\n");
}

export function depositAlertText(row, days, baseUrl) {
  const due = new Date(new Date(row.signed_at).getTime() + 14 * DAY_MS).toISOString().slice(0, 10);
  const head = days >= 14
    ? `:rotating_light: *Deposit refund due today (${due})* · ${label(row)}`
    : `:moneybag: *Deposit refund due in ${14 - days} days (${due})* · ${label(row)}`;
  return [
    head,
    "Collected and signed. Finance: release the deposit (credit note, then refund), with any deductions invoiced separately. Ignore if already done.",
    baseUrl ? `Record: ${baseUrl}/record/${row.id}` : "",
  ].filter(Boolean).join("\n");
}

export async function runChecks(now = new Date()) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { status: "skipped", reason: "Supabase not configured" };
  }
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "";
  const cols = "id,booqable_order_id,type,company_name,customer_name,customer_email,link_sent_at,signed_at,updated_at";

  const unsigned = await supabaseSelect(`inspections?select=${cols}&location=eq.site&status=eq.awaiting_signature`);
  let unsignedAlerts = 0;
  for (const row of unsigned) {
    const days = daysSince(row.link_sent_at || row.updated_at, now);
    if (days != null && UNSIGNED_DAYS.has(days) && (await postBookingsAlert(unsignedAlertText(row, days, baseUrl)))) {
      unsignedAlerts++;
    }
  }

  const since = new Date(now.getTime() - 20 * DAY_MS).toISOString();
  const collected = await supabaseSelect(
    `inspections?select=${cols}&location=eq.site&type=eq.checkin&status=in.(signed,complete)&signed_at=gte.${encodeURIComponent(since)}`
  );
  let depositAlerts = 0;
  for (const row of collected) {
    const days = daysSince(row.signed_at, now);
    if (days != null && DEPOSIT_DAYS.has(days) && (await postBookingsAlert(depositAlertText(row, days, baseUrl)))) {
      depositAlerts++;
    }
  }

  return { status: "ok", unsignedChecked: unsigned.length, unsignedAlerts, collectedChecked: collected.length, depositAlerts };
}

export default async () => {
  try {
    const result = await runChecks();
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error("daily-handover-checks error:", err);
    return new Response(JSON.stringify({ status: "error", message: String(err) }), { status: 500 });
  }
};

export const config = { schedule: "@daily" };
