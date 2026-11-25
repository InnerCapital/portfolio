// netlify/functions/submit.js
// Sends data to Apps Script via GET request with URL params (bypasses POST redirect),
// and sends the trader their confirmation email directly via Resend.
//
// The confirmation email used to be assumed to come from the Apps Script side (the
// frontend has always shown "Confirmation email sent" on any successful upstream
// call) but nothing in this function or the Apps Script call ever verified that —
// the Apps Script GET responds with a 302 that this function doesn't follow, so its
// actual result (including whether it emailed anyone) was never actually checked.
// Sending the confirmation here, via the same Resend setup already used for
// send-email.js, makes it a guarantee instead of an assumption.
const https = require("https");
const { generateDeclarationPdf } = require("./lib/generateDeclarationPdf");
const { getDrive, safeName, createJobFolder, uploadToFolder } = require("./lib/driveJobFolder");
const { markBriefingComplete } = require("./lib/briefingTracker");
const { postBookingsAlert, slackEscape, withBookingsBcc } = require("./lib/bookingsAlert");
const { syncTraderEvent } = require("./lib/attioSync");

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }
  const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbx0Wej64qeqehlRA0tIG2WDS09BkPuEcqcEIcHDqEAVbH1HGWqAtDsV4TSnvBtbYs0FFg/exec";
  try {
    const data = JSON.parse(event.body);
    delete data.userAgent;
    // signatureFull is the real, full-resolution signature capture — only
    // used for the PDF (below). Stripped here before forwarding: the Apps
    // Script call encodes the whole payload into a URL query string, and a
    // full-res PNG would blow well past URL length limits. The thumbnail
    // (`signature`) is what's small enough to actually go in that URL.
    const signatureFull = data.signatureFull;
    delete data.signatureFull;
    const encoded = encodeURIComponent(JSON.stringify(data));
    const fullUrl = APPS_SCRIPT_URL + "?payload=" + encoded;
    const url = new URL(fullUrl);
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json"
        }
      };
      const req = https.request(options, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => resolve({ status: res.statusCode, body }));
      });
      req.on("error", reject);
      req.end();
    });

    // Fire-and-forget confirmation email — never blocks or fails the submission
    // itself. The Apps Script/Sheet write above is the system of record; this is
    // purely the receipt the trader was always told they'd get.
    sendConfirmationEmail(data).catch((err) => console.error("Confirmation email failed:", err));

    // Fire-and-forget: generate the signed-declaration PDF and file it into the
    // same Job Folder as the Hire Agreement and the insurance certs (uploaded
    // separately, ahead of this call, by upload-insurance.js — that one's the
    // actual hard gate; this is just the paper trail, losing it isn't fatal).
    generateAndFileDeclarationPdf({ ...data, signature: signatureFull || data.signature }).catch((err) => console.error("Declaration PDF failed:", err));

    // Mark the booking's briefing complete (so the D-7/D-2 chase stops) and tell
    // #bookings. Awaited because Netlify can freeze the process once the response
    // is sent; both helpers swallow their own errors and time out quickly.
    const matched = await markBriefingComplete({ folderId: data.folderId, booqableRef: data.booqableRef });
    await postBookingsAlert(declarationAlertText(data, matched));
    // Trader Briefing status -> "Signed" on the linked Attio deal, plus a note
    // with the job folder link. The Sheet above stays the audit log. Deal ID
    // comes from the Supabase row for this folder, never from the request.
    // Never throws, so it can't fail the submission.
    if (data.folderId) {
      await syncTraderEvent(data.folderId, "briefing_signed", {
        signedBy: data.contactName || data.company,
        signedDate: data.signedDate,
        company: data.company,
        event: data.event,
        dates: data.dates,
        tradingPartner: data.tradingPartnerName
          ? data.tradingPartnerName + (data.tradingPartnerCompany ? " (" + data.tradingPartnerCompany + ")" : "")
          : "",
      });
    }

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "ok", upstream: result.status, body: result.body })
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "error", message: err.toString() })
    };
  }
};

async function sendConfirmationEmail(data) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !data.email) return;

  const row = (label, value) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:13px">${label}</td><td style="padding:4px 0;font-size:13px;color:#111"><strong>${escapeHtml(value)}</strong></td></tr>` : "";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
      <div style="background:#0c0c0c;padding:20px 24px"><span style="color:#f9a800;font-weight:800;letter-spacing:0.08em;font-size:13px;text-transform:uppercase">Acme Hire</span></div>
      <div style="padding:24px">
        <h2 style="margin:0 0 4px;font-size:18px;color:#111">Declaration received</h2>
        <p style="color:#555;font-size:14px;line-height:1.5;margin:0 0 20px">
          This confirms your Trader Briefing Pack declaration was submitted to Acme Hire's records (ref AH-TBP-2026).
        </p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          ${row("Company", data.company)}
          ${row("Trading Brand", data.brand)}
          ${row("Unit Type(s)", data.unitTypes)}
          ${row("Event & Venue", data.event)}
          ${row("Hire Dates", data.dates)}
          ${row("Signed", data.signedDate)}
        </table>
        <p style="color:#888;font-size:12px;line-height:1.5;margin:0">
          Questions or need another copy? Reply to this email or contact <a href="mailto:hello@acmehire.example" style="color:#c98800">hello@acmehire.example</a>.
        </p>
      </div>
    </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Acme Hire Operations <hello@acmehire.example>",
      to: [data.email],
      bcc: withBookingsBcc(["hello@acmehire.example"]),
      subject: `Acme Hire — Declaration confirmed${data.company ? ` (${data.company})` : ""}`,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

async function generateAndFileDeclarationPdf(data) {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) return;

  const pdfBuffer = await generateDeclarationPdf(data);
  const drive = getDrive();

  let folderId = data.folderId;
  if (!folderId) {
    const parentId = process.env.GOOGLE_DRIVE_JOB_FOLDERS_PARENT_ID;
    if (!parentId) return; // no configured parent to create a fallback folder under — skip silently
    const folderName = [safeName(data.booqableRef), safeName(data.company)].filter(Boolean).join(" - ") || `job-${Date.now()}`;
    const created = await createJobFolder(drive, folderName, parentId);
    folderId = created.folderId;
  }

  const filename = `Declaration_${safeName(data.company)}_${safeName(data.signedDate)}.pdf`;
  await uploadToFolder(drive, folderId, pdfBuffer, filename, "application/pdf");
}

function declarationAlertText(data, matched) {
  const who = [data.company, data.brand && data.brand !== data.company ? `(${data.brand})` : ""].filter(Boolean).join(" ");
  const lines = [
    `:white_check_mark: *Trader Briefing signed* · ${slackEscape(who || "Unknown company")}`,
    [data.booqableRef && `Ref ${data.booqableRef}`, data.event, data.dates].filter(Boolean).map(slackEscape).join(" · "),
    `Signed by ${slackEscape(data.contactName || data.email || "unknown")}${data.signedDate ? ` on ${slackEscape(data.signedDate)}` : ""}`,
  ];
  if (Array.isArray(matched) && matched.length === 0) {
    lines.push("_No tracked booking matched this submission, so it won't clear the D-7/D-2 chase. Check the ref._");
  }
  return lines.filter(Boolean).join("\n");
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
