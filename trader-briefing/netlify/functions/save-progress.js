// netlify/functions/save-progress.js
//
// Backend half of "save your place". The client already autosaves a snapshot
// to localStorage on every page change (snapshotFields()/saveProgress() in
// index.html) — that resumes fine on the same browser, but a trader coming
// back via a D-7/D-2 reminder email, or just switching from phone to laptop,
// needs it resumable on a *different* device. This POSTs the same snapshot
// here too, keyed by folder_id (always set once create-job-folder.js has run
// for this booking — booqable_ref can be empty, folder_id can't).
//
// Silently a no-op (never surfaced to the trader) when Supabase isn't
// configured or there's no folderId to key against — localStorage is still
// there as the fallback in both cases, same as before this existed.
exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ status: "error", message: "Method not allowed" }) };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "skipped", reason: "Supabase not configured" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "Invalid JSON body" }) };
  }

  const { folderId, snapshot } = data;
  if (!folderId || !snapshot) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "skipped", reason: "No folderId — nothing to key the save against" }) };
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/trader_briefing_bookings?folder_id=eq.${encodeURIComponent(folderId)}`,
      {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          progress_snapshot: snapshot,
          progress_updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase PATCH ${res.status}: ${body}`);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };
  } catch (err) {
    console.error("save-progress error:", err);
    // Non-fatal either way — localStorage still has this trader's progress.
    return { statusCode: 200, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};
