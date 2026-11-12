// netlify/functions/upload-signature.js
//
// Uploads the trader's full-resolution signature (the browser only ever sent a
// small JPEG thumbnail to Code.gs — a real PNG is too big for that GET/query-string
// call) to Google Drive as a standalone file. Independent of the Sheet-logging
// submit() call — one failing doesn't block the other.
//
// Reuses the same service account pattern as the Handover app's lib/googleDrive.ts.

const { google } = require("googleapis");

function getDrive() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
  return google.drive({ version: "v3", auth });
}

function safeName(part) {
  return String(part || "").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  const folderId = process.env.GOOGLE_DRIVE_TRADER_SIGNATURES_FOLDER_ID;
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON || !folderId) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        status: "error",
        message: "GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_DRIVE_TRADER_SIGNATURES_FOLDER_ID not configured",
      }),
    };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "error", message: "Invalid JSON body" }),
    };
  }

  const { signatureFull, company, event: eventName, signedDate } = data;
  if (!signatureFull || !signatureFull.startsWith("data:image/")) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "error", message: "Missing or invalid signatureFull" }),
    };
  }

  try {
    const base64 = signatureFull.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    const filename = `Signature_${safeName(company)}_${safeName(eventName)}_${safeName(signedDate)}_${Date.now()}.png`;

    const drive = getDrive();
    const { Readable } = require("stream");

    const res = await drive.files.create({
      requestBody: { name: filename, parents: [folderId] },
      media: { mimeType: "image/png", body: Readable.from(buffer) },
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });

    return {
      statusCode: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "ok", fileId: res.data.id, webViewLink: res.data.webViewLink }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ status: "error", message: err.toString() }),
    };
  }
};
