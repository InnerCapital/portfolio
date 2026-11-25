// netlify/functions/lib/briefingTracker.js
//
// Reads and updates trader_briefing_bookings (same Supabase project as the
// Handover app). One row per booking is created by create-job-folder.js when
// Ops generates the trader's link. Until now nothing marked a row complete when
// the trader actually signed, so outstanding briefings could not be told apart
// from finished ones. markBriefingComplete closes that gap.

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  return url && key ? { url, key } : null;
}

// Marks the booking's briefing complete. Matches on the Drive folder id first
// (unique per generated link), then the Booqable ref. Returns the updated rows
// ([] when nothing matched, null when Supabase is not configured or fails).
async function markBriefingComplete({ folderId, booqableRef }) {
  const cfg = supabaseConfig();
  if (!cfg) return null;

  let filter;
  if (folderId) filter = `folder_id=eq.${encodeURIComponent(folderId)}`;
  else if (booqableRef) filter = `booqable_ref=eq.${encodeURIComponent(booqableRef)}`;
  else return [];

  try {
    const res = await fetch(`${cfg.url}/rest/v1/trader_briefing_bookings?${filter}`, {
      method: "PATCH",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "complete", updated_at: new Date().toISOString() }),
    });
    if (!res.ok) {
      console.error(`markBriefingComplete failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("markBriefingComplete failed:", err);
    return null;
  }
}

module.exports = { markBriefingComplete, supabaseConfig };
