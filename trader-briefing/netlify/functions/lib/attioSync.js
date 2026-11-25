// netlify/functions/lib/attioSync.js
//
// Trader-triggered Attio updates (insurance uploaded, declaration signed).
//
// The trader page is public, so it can't hold the Ops passcode. The gate here
// is server-side instead: the trader only ever sends the Drive folderId (an
// unguessable ID created by Ops at link-generation time). The Attio deal is
// found from the Supabase booking row Ops created for that folder, never from
// the trader's request:
//   1. the attio_deal_id Ops linked on the generate page, or
//   2. failing that, the one Attio deal whose "Booqable order ID" matches the
//      booqable_ref Ops stored on that row (bookings made before linking existed).
// Only the fixed events in lib/attio.js can be applied, and test mode applies
// as everywhere else.
//
// Always non-fatal: an Attio problem must never block a trader's submission.
const { applyEvent, attioRequest } = require("./attio");

async function bookingForFolder(folderId) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || !folderId) return null;
  const query = (select) => fetch(
    `${url}/rest/v1/trader_briefing_bookings?folder_id=eq.${encodeURIComponent(folderId)}&select=${select}&limit=1`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } }
  );
  let res = await query("attio_deal_id,booqable_ref");
  // attio_deal_id column not added yet (supabase/attio_deal_id.sql): still use the ref.
  if (!res.ok) res = await query("booqable_ref");
  if (!res.ok) throw new Error(`Supabase lookup ${res.status}`);
  const rows = await res.json();
  return rows[0] || null;
}

// Exactly one deal with this Booqable order ID, or nothing (never guess between two).
async function dealIdForRef(ref) {
  if (!ref) return null;
  const res = await attioRequest("POST", "/objects/deals/records/query", {
    filter: { booqable_order_id: String(ref).trim().replace(/^#/, "") },
    limit: 2,
  });
  const rows = (res && res.data) || [];
  return rows.length === 1 ? rows[0].id.record_id : null;
}

async function dealIdForFolder(folderId) {
  const booking = await bookingForFolder(folderId);
  if (!booking) return null;
  return booking.attio_deal_id || (await dealIdForRef(booking.booqable_ref));
}

async function syncTraderEvent(folderId, eventName, ctx = {}) {
  try {
    if (!process.env.ATTIO_API_KEY) return { skipped: "ATTIO_API_KEY not configured" };
    const dealId = await dealIdForFolder(folderId);
    if (!dealId) return { skipped: "No Attio deal linked to this booking" };
    return await applyEvent(dealId, eventName, { ...ctx, folderId });
  } catch (err) {
    console.error(`Attio sync (${eventName}) failed:`, err.message);
    return { error: err.message };
  }
}

module.exports = { syncTraderEvent, dealIdForFolder, dealIdForRef };
