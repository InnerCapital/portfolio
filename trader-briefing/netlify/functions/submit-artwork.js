// netlify/functions/submit-artwork.js
//
// Finalizes the Screen Artwork step: marks the booking artwork_status and
// sends the summary email. On 'skipped', just records that — never blocks
// the trader either way.
//
// The actual file uploads happen BEFORE this is called, one file per
// upload-artwork-file.js request — bundling every unit's media into this
// single request used to blow past Netlify Functions' ~6MB request-body
// ceiling (confirmed live: traders got "Failed to execute 'json' on
// 'Response': Unexpected end of JSON input" — an empty body from a rejected
// invocation). This call now only ever carries lightweight unit metadata
// (id/mode, no media) for the summary text.
//
// Also updates trader_briefing_bookings.artwork_status so the reminder
// function (send-briefing-reminders.js) knows to stop chasing once this
// fires, and so a completed step is never re-reminded.

const { withBookingsBcc } = require("./lib/bookingsAlert");

async function updateBookingStatus(booqableRef, status, summary) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey || !booqableRef) return; // non-fatal — see submit.js pattern

  const patch = {
    artwork_status: status,
    updated_at: new Date().toISOString(),
  };
  if (status === "complete") {
    patch.artwork_completed_at = new Date().toISOString();
    if (summary) patch.artwork_summary = summary;
  }

  await fetch(
    `${supabaseUrl}/rest/v1/trader_briefing_bookings?booqable_ref=eq.${encodeURIComponent(booqableRef)}`,
    {
      method: "PATCH",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    }
  ).catch((err) => console.error("Booking status update failed:", err));
}

async function sendArtworkEmail(company, contactEmail, unitsSummary, scheduleNotes) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;

  const notesBlock = scheduleNotes
    ? `<p style="color:#888;font-size:12px;line-height:1.5;margin:12px 0 0"><strong style="color:#555">Schedule / timing notes:</strong><br>${escapeHtml(scheduleNotes).replace(/\n/g, "<br>")}</p>`
    : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
      <div style="background:#0c0c0c;padding:20px 24px"><span style="color:#f9a800;font-weight:800;letter-spacing:0.08em;font-size:13px;text-transform:uppercase">Acme Hire</span></div>
      <div style="padding:24px">
        <h2 style="margin:0 0 4px;font-size:18px;color:#111">Screen artwork submitted</h2>
        <p style="color:#555;font-size:14px;line-height:1.5;margin:0 0 16px">${company ? `<strong>${company}</strong> has` : "A trader has"} submitted their screen artwork for review and scheduling.</p>
        <div style="background:#f7f5ee;padding:12px 16px;font-size:13px;color:#333">${unitsSummary}</div>
        ${notesBlock}
        <p style="color:#888;font-size:12px;line-height:1.5;margin:16px 0 0">Original files and rendered previews are in the booking's Job Folder in Drive.</p>
      </div>
    </div>`;

  const to = ["hello@acmehire.example"];
  const bcc = withBookingsBcc(contactEmail ? [contactEmail] : []);

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Acme Hire Operations <hello@acmehire.example>",
      to,
      ...(bcc.length ? { bcc } : {}),
      subject: `Screen artwork submitted${company ? ` — ${company}` : ""}`,
      html,
    }),
  }).catch((err) => console.error("Artwork confirmation email failed:", err));
}

exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ status: "error", message: "Method not allowed" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "Invalid JSON body" }) };
  }

  const { folderId, ref, company, contactEmail, status, units, scheduleNotes } = data;

  if (status === "skipped") {
    await updateBookingStatus(ref, "skipped", null);
    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok" }) };
  }

  if (!Array.isArray(units) || units.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "No units provided" }) };
  }

  try {
    const summary = units.map((u) => `Unit ${u.id} (${u.mode})`).join(", ");
    const storedSummary = scheduleNotes ? `${summary} — Notes: ${scheduleNotes}` : summary;
    await Promise.all([
      updateBookingStatus(ref, "complete", storedSummary),
      sendArtworkEmail(company, contactEmail, summary, scheduleNotes),
    ]);

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", folderId, summary }) };
  } catch (err) {
    console.error("submit-artwork error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
