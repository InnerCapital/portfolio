// netlify/functions/send-briefing-reminders.js
//
// Runs daily (see netlify.toml). Checks trader_briefing_bookings for the
// Screen Artwork step's two reminder triggers — D-7 and D-2 (48 hours)
// before delivery — and emails the trader a link straight back into their
// specific booking's artwork step if it's still outstanding. A completed or
// skipped step is excluded by the query itself, so there's no separate
// "cancel the reminder" step to build — see submit-artwork.js, which is what
// actually flips artwork_status.
//
// Exported as a plain handler AND as a scheduled function per Netlify's
// convention (netlify.toml wires the schedule; this file works either way,
// including a manual POST for testing per the plan's verification steps).
const BRIEFING_URL = "https://trader-briefing-demo.netlify.app/briefing";

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

async function supabaseQuery(path) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
  });
  if (!res.ok) throw new Error(`Supabase query failed: ${res.status}`);
  return res.json();
}

async function supabasePatch(id, patch) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
  await fetch(`${supabaseUrl}/rest/v1/trader_briefing_bookings?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
}

function buildBriefingLink(booking) {
  const params = new URLSearchParams();
  if (booking.company) params.set("company", booking.company);
  if (booking.contact_email) params.set("email", booking.contact_email);
  if (booking.booqable_ref) params.set("ref", booking.booqable_ref);
  if (booking.folder_id) params.set("folderId", booking.folder_id);
  params.set("step", "artwork"); // index.html reads this to jump straight to the Artwork & Scheduling page
  return `${BRIEFING_URL}?${params.toString()}`;
}

async function sendReminderEmail(booking, label) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !booking.contact_email) return;

  const link = buildBriefingLink(booking);
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
      <div style="background:#0c0c0c;padding:20px 24px"><span style="color:#f9a800;font-weight:800;letter-spacing:0.08em;font-size:13px;text-transform:uppercase">Acme Hire</span></div>
      <div style="padding:24px">
        <h2 style="margin:0 0 4px;font-size:18px;color:#111">Screen artwork still needed</h2>
        <p style="color:#555;font-size:14px;line-height:1.5;margin:0 0 20px">
          ${label} until your delivery${booking.company ? ` for <strong>${booking.company}</strong>` : ""}, and we don't have your screen artwork yet. It takes a few minutes.
        </p>
        <a href="${link}" style="display:inline-block;background:#f9a800;color:#111;text-decoration:none;font-weight:700;padding:12px 20px;font-size:14px">Set up your screen artwork &rarr;</a>
        <p style="color:#888;font-size:12px;line-height:1.5;margin:20px 0 0">This link goes straight to your booking — no need to re-enter anything.</p>
      </div>
    </div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Acme Hire Operations <hello@acmehire.example>",
      to: [booking.contact_email],
      subject: "Acme Hire — screen artwork still needed",
      html,
    }),
  });
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    return { statusCode: 200, headers, body: JSON.stringify({ status: "skipped", reason: "Supabase not configured" }) };
  }

  try {
    const pending = await supabaseQuery(
      "trader_briefing_bookings?artwork_status=in.(pending,reminded_7d)&delivery_date=not.is.null&select=*"
    );

    let sent7d = 0;
    let sent48h = 0;

    for (const booking of pending) {
      const daysLeft = daysUntil(booking.delivery_date);

      if (booking.artwork_status === "pending" && daysLeft <= 7) {
        await sendReminderEmail(booking, "It's 7 days");
        await supabasePatch(booking.id, {
          artwork_status: "reminded_7d",
          artwork_reminder_7d_sent_at: new Date().toISOString(),
        });
        sent7d++;
      } else if (booking.artwork_status === "reminded_7d" && daysLeft <= 2) {
        await sendReminderEmail(booking, "It's 48 hours");
        await supabasePatch(booking.id, {
          artwork_status: "reminded_48h",
          artwork_reminder_48h_sent_at: new Date().toISOString(),
        });
        sent48h++;
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", checked: pending.length, sent7d, sent48h }) };
  } catch (err) {
    console.error("send-briefing-reminders error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};
