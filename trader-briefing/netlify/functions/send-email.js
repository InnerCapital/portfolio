// netlify/functions/send-email.js
// Sends HTML email via Resend from hello@acmehire.example
//
// Environment variables required:
//   RESEND_API_KEY — from resend.com, requires acmehire.example verified as a sending domain

const { requireStaff } = require("./lib/requireStaff");
const { withBookingsBcc } = require("./lib/bookingsAlert");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  // Ops-only — verify the caller is signed-in staff (see lib/requireStaff.js).
  const staff = await requireStaff(event);
  if (!staff.ok) return staff.response;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Resend not configured" }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid JSON" }),
    };
  }

  const { to, subject, html, bcc } = payload;

  if (!to || !subject || !html) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing required fields: to, subject, html" }),
    };
  }

  const toList = Array.isArray(to) ? to : [to];
  // Always copy the #bookings Slack channel on briefing links sent from /generate.
  const bccList = withBookingsBcc(bcc);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Acme Hire Operations <hello@acmehire.example>",
        to: toList,
        ...(bccList.length ? { bcc: bccList } : {}),
        subject,
        html,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, id: data.id }),
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: data.message || `Resend API error ${res.status}` }),
    };
  } catch (err) {
    console.error("send-email error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
