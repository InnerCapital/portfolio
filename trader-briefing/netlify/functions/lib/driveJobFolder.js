// netlify/functions/lib/driveJobFolder.js
//
// Shared Drive helpers for the per-booking Job Folder (Hire Agreement, insurance
// certs, and the generated signed-declaration PDF all live in one folder per
// booking). Reuses the same service account pattern as upload-signature.js.

const { google } = require("googleapis");
const { Readable } = require("stream");

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

// Creates a new folder under parentId. Always creates — the caller is
// responsible for deciding whether a folder already exists (e.g. via the
// folderId already threaded through the trader link) rather than this
// function searching by name, which would risk name-collision ambiguity.
async function createJobFolder(drive, name, parentId) {
  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
    },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  return { folderId: res.data.id, webViewLink: res.data.webViewLink };
}

async function uploadToFolder(drive, folderId, buffer, filename, mimeType) {
  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,webViewLink",
    supportsAllDrives: true,
  });
  return { fileId: res.data.id, webViewLink: res.data.webViewLink };
}

module.exports = { getDrive, safeName, createJobFolder, uploadToFolder };
