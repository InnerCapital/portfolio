// netlify/functions/get-progress.js
//
// Fetches a previously-saved progress snapshot (see save-progress.js) so a
// trader can resume on a different device than the one they started on —
// the reason a backend version of "save your place" exists at all;
// localStorage alone only resumes on the original browser. Keyed by
// folder_id, same as save-progress.js. Called from index.html's booqable
// prefill flow (CASE A) before it decides whether to land on the cover page
// or offer to resume where the trader left off.
exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", snapshot: null }) };
  }

  const folderId = (event.queryStringParameters || {}).folderId;
  if (!folderId) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", snapshot: null }) };
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/trader_briefing_bookings?folder_id=eq.${encodeURIComponent(folderId)}&select=progress_snapshot,progress_updated_at`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    );
    if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
    const rows = await res.json();
    const snapshot = rows[0] && rows[0].progress_snapshot ? rows[0].progress_snapshot : null;
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", snapshot }) };
  } catch (err) {
    console.error("get-progress error:", err);
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", snapshot: null }) };
  }
};
