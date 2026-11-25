// netlify/functions/lib/bookingsAlert.js
//
// Posts a short alert into the private Slack #bookings channel via the
// "Acme Hire #bookings Alert Relay" Zapier workflow (a catch hook). The hook
// URL lives only in the BOOKINGS_ALERT_WEBHOOK_URL env var, never in code.
//
// Never throws and never blocks for long: an alert is a side channel, so a
// Slack or Zapier hiccup must not break a trader's submission or the daily job.
const TIMEOUT_MS = 5000;

// Slack mrkdwn treats &, < and > as control characters.
function slackEscape(value) {
  return String(value ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

async function postBookingsAlert(text) {
  const url = process.env.BOOKINGS_ALERT_WEBHOOK_URL;
  if (!url || !text) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "trader-briefing", text }),
      signal: controller.signal,
    });
    if (!res.ok) console.error(`#bookings alert failed: ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("#bookings alert failed:", err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// The #bookings Slack channel's email address. BCC'd on every Trader Briefing
// email (link sent from /generate, submission confirmations, reminders) so the
// team sees them in Slack. Override with BOOKINGS_BCC_EMAIL; set it to "off" to stop.
const DEFAULT_BOOKINGS_BCC = "bookings-channel@acme-workspace.slack.com";

function bookingsBcc() {
  const v = (process.env.BOOKINGS_BCC_EMAIL || DEFAULT_BOOKINGS_BCC).trim();
  return v && v.toLowerCase() !== "off" ? v : null;
}

// Adds the #bookings address to an existing BCC list (deduplicated).
function withBookingsBcc(list) {
  const base = Array.isArray(list) ? list.filter(Boolean) : list ? [list] : [];
  const extra = bookingsBcc();
  if (extra && !base.some((a) => String(a).toLowerCase() === extra.toLowerCase())) base.push(extra);
  return base;
}

module.exports = { postBookingsAlert, slackEscape, bookingsBcc, withBookingsBcc };
