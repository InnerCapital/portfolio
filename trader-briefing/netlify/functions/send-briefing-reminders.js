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
//
// Also chases the briefing itself: a booking whose declaration is still not
// signed gets a #bookings alert at D-7 ("reminded") and again at D-2 or later
// ("overdue"). These are staff alerts, not customer emails. submit.js marks the
// row "complete" when the trader signs, which drops it out of this query.
const { postBookingsAlert, slackEscape, withBookingsBcc } = require("./lib/bookingsAlert");
const { upcomingReservedOrders } = require("./lib/booqableOrders");

// Bookings that never had a briefing link generated are invisible to the chase
// above (no trader_briefing_bookings row). This catches them from Booqable:
// confirmed bookings starting within 14 days with no matching row. Stateless,
// so it alerts on set days (D-14, D-10, D-7) and daily from D-3 to the day.
const MISSING_ALERT_DAYS = new Set([14, 10, 7, 3, 2, 1, 0]);
const GENERATE_URL = "https://trader-briefing-demo.netlify.app/generate";

const BRIEFING_URL = "https://trader-briefing-demo.netlify.app/briefing";
const { getDealById, date: attioDate } = require("./lib/attio");

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

function buildBriefingLink(booking, step = "artwork") {
  const params = new URLSearchParams();
  if (booking.company) params.set("company", booking.company);
  if (booking.contact_email) params.set("email", booking.contact_email);
  if (booking.booqable_ref) params.set("ref", booking.booqable_ref);
  if (booking.folder_id) params.set("folderId", booking.folder_id);
  if (step) params.set("step", step); // index.html reads "artwork" to jump straight to the Artwork & Scheduling page
  return `${BRIEFING_URL}?${params.toString()}`;
}

// Decides what, if anything, to do for one unsigned booking today.
// Returns { alert: "d7" | "overdue", nextStatus } or null.
function declarationAction(booking, daysLeft) {
  if (daysLeft <= 2 && (booking.status === "pending" || booking.status === "reminded")) {
    return { alert: "overdue", nextStatus: "overdue" };
  }
  if (daysLeft <= 7 && booking.status === "pending") {
    return { alert: "d7", nextStatus: "reminded" };
  }
  return null;
}

function declarationAlertText(booking, daysLeft, kind) {
  const when = daysLeft < 0 ? `${-daysLeft} day(s) ago` : daysLeft === 0 ? "today" : `in ${daysLeft} day(s)`;
  const head = kind === "overdue"
    ? `:rotating_light: *Trader Briefing still not signed, delivery ${when}*`
    : `:warning: *Trader Briefing not signed yet, delivery ${when}*`;
  return [
    head,
    [booking.company || "Unknown company", booking.booqable_ref && `Ref ${booking.booqable_ref}`, booking.delivery_date && `Delivery ${booking.delivery_date}`]
      .filter(Boolean).map(slackEscape).join(" · "),
    booking.contact_email ? `Contact: ${slackEscape(booking.contact_email)}` : "No contact email on file",
    `Their link: ${buildBriefingLink(booking, null)}`,
    kind === "overdue" ? "Chase them before the unit leaves, or hold the delivery." : "Give them a nudge.",
  ].join("\n");
}

async function chaseUnsignedDeclarations() {
  const unsigned = await supabaseQuery(
    "trader_briefing_bookings?status=in.(pending,reminded)&delivery_date=not.is.null&select=*"
  );
  let d7 = 0;
  let overdue = 0;
  for (const booking of unsigned) {
    const daysLeft = daysUntil(booking.delivery_date);
    const action = declarationAction(booking, daysLeft);
    if (!action) continue;
    const posted = await postBookingsAlert(declarationAlertText(booking, daysLeft, action.alert));
    // Only advance the status once the alert actually went out, so a Slack or
    // relay outage retries tomorrow instead of silently skipping the chase.
    if (!posted) continue;
    await supabasePatch(booking.id, { status: action.nextStatus, last_reminded_at: new Date().toISOString() });
    if (action.alert === "d7") d7++;
    else overdue++;
  }
  return { checked: unsigned.length, d7, overdue };
}

async function flagBookingsWithoutBriefing() {
  const orders = await upcomingReservedOrders(14);
  if (!orders.length) return { checked: 0, flagged: 0 };

  const tracked = await supabaseQuery("trader_briefing_bookings?select=booqable_ref&booqable_ref=not.is.null");
  const trackedRefs = new Set(tracked.map((r) => String(r.booqable_ref).trim().replace(/^#/, "")));

  let flagged = 0;
  for (const order of orders) {
    if (!order.number || trackedRefs.has(order.number)) continue;
    const daysLeft = daysUntil(order.startsOn);
    if (!MISSING_ALERT_DAYS.has(daysLeft)) continue;
    const when = daysLeft === 0 ? "today" : `in ${daysLeft} day(s)`;
    const text = [
      `${daysLeft <= 3 ? ":rotating_light:" : ":warning:"} *No Trader Briefing sent for booking #${slackEscape(order.number)}, starting ${when}*`,
      [order.customerName, `Starts ${order.startsOn}`].filter(Boolean).map(slackEscape).join(" · "),
      `Create and send their link: ${GENERATE_URL}`,
    ].join("\n");
    if (await postBookingsAlert(text)) flagged++;
  }
  return { checked: orders.length, flagged };
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
      bcc: withBookingsBcc([]),
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
      // Attio owns the delivery date. For linked bookings, re-read it so a
      // date moved in Attio moves these reminders too, and keep Supabase in
      // step. Falls back to the stored date if Attio can't be reached.
      if (booking.attio_deal_id && process.env.ATTIO_API_KEY) {
        try {
          const deal = await getDealById(booking.attio_deal_id);
          const attioDelivery = attioDate(deal && deal.values, "delivery_date");
          if (attioDelivery && attioDelivery !== booking.delivery_date) {
            await supabasePatch(booking.id, { delivery_date: attioDelivery });
            booking.delivery_date = attioDelivery;
          }
        } catch (err) {
          console.error(`Attio delivery date refresh failed for ${booking.id}:`, err.message);
        }
      }

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

    // Separate try so an artwork-side failure above never hides, and a
    // declaration-side failure here never undoes, the other check.
    let declarations;
    try {
      declarations = await chaseUnsignedDeclarations();
    } catch (err) {
      console.error("declaration chase error:", err);
      declarations = { error: err.toString() };
    }

    let missing;
    try {
      missing = await flagBookingsWithoutBriefing();
    } catch (err) {
      console.error("missing-briefing check error:", err);
      missing = { error: err.toString() };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", checked: pending.length, sent7d, sent48h, declarations, missing }) };
  } catch (err) {
    console.error("send-briefing-reminders error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};
