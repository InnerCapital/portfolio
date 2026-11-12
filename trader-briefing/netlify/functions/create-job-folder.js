// netlify/functions/create-job-folder.js
//
// Called once, at trader-link generation time in generate.html, when Ops has
// the Hire Agreement PDF in hand. Creates the per-booking Job Folder and files
// the Hire Agreement into it. The returned folderId travels forward through the
// generated trader link's query params so upload-insurance.js and submit.js's
// PDF generation both file into the SAME folder later, without any by-name
// folder search.
const { getDrive, safeName, createJobFolder, uploadToFolder } = require("./lib/driveJobFolder");
const { requireStaff } = require("./lib/requireStaff");

exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Ops-only — verify the caller is signed-in staff (see lib/requireStaff.js).
  const staff = await requireStaff(event);
  if (!staff.ok) return staff.response;

  const parentId = process.env.GOOGLE_DRIVE_JOB_FOLDERS_PARENT_ID;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !parentId) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        status: "error",
        message: "GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_JOB_FOLDERS_PARENT_ID not configured",
      }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "Invalid JSON body" }) };
  }

  const { ref, company, hireAgreementBase64, contactEmail, deliveryDate } = data;
  if (!ref && !company) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "ref or company required" }) };
  }

  try {
    const drive = getDrive();
    const folderName = [safeName(ref), safeName(company)].filter(Boolean).join(" - ") || `job-${Date.now()}`;
    const { folderId, webViewLink } = await createJobFolder(drive, folderName, parentId);

    if (hireAgreementBase64) {
      const buffer = Buffer.from(hireAgreementBase64, "base64");
      await uploadToFolder(drive, folderId, buffer, `HireAgreement_${safeName(ref || company)}.pdf`, "application/pdf");
    }

    // Non-fatal — the folder/link still work without this. Creates the
    // per-booking row send-briefing-reminders.js later queries. Needs
    // SUPABASE_URL/SUPABASE_SERVICE_KEY copied in from the handover-app
    // site (same project, reused credentials — see README).
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (supabaseUrl && supabaseKey) {
      // Awaited (not fire-and-forget) — Netlify Functions can freeze/terminate
      // the process as soon as the response is sent, so an un-awaited insert
      // here risks silently never completing. Still non-fatal to the caller:
      // wrapped so a Supabase hiccup doesn't break folder creation itself.
      try {
        await fetch(`${supabaseUrl}/rest/v1/trader_briefing_bookings`, {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({
            booqable_ref: ref || null,
            company: company || null,
            contact_email: contactEmail || null,
            delivery_date: deliveryDate || null,
            folder_id: folderId,
          }),
        });
      } catch (err) {
        console.error("trader_briefing_bookings insert failed:", err);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", folderId, webViewLink }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};
