// netlify/functions/upload-artwork-file.js
//
// Uploads ONE artwork file (an original per-screen upload, or a rendered
// preview) at a time. submit-artwork.js used to bundle every unit's media
// into a single request; Netlify Functions (AWS Lambda under the hood)
// reject request bodies over ~6MB before the function even runs, which is
// trivial to hit with base64-encoded video or more than one full-resolution
// image in one POST — confirmed live as "Failed to execute 'json' on
// 'Response': Unexpected end of JSON input" (the browser's fetch got an
// empty body back from a rejected invocation). One file per call keeps each
// request comfortably under that ceiling; index.html's artSubmit() now
// calls this once per file, then a lightweight submit-artwork.js call (no
// media) to finalize.
const { getDrive, safeName, createJobFolder, uploadToFolder } = require("./lib/driveJobFolder");

exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ status: "error", message: "Method not allowed" }) };
  }

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    // Non-fatal — matches submit-artwork.js's own degrade-gracefully behaviour
    // when Drive isn't configured. The trader still gets to "submitted".
    return { statusCode: 200, headers, body: JSON.stringify({ status: "skipped", reason: "Drive not configured" }) };
  }

  let data;
  try {
    data = JSON.parse(event.body);
  } catch (err) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "Invalid JSON body" }) };
  }

  const { folderId, ref, company, filename, mimeType, base64 } = data;
  if (!filename || !base64) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "filename and base64 are required" }) };
  }

  try {
    const drive = getDrive();

    let targetFolderId = folderId;
    if (!targetFolderId) {
      const parentId = process.env.GOOGLE_DRIVE_JOB_FOLDERS_PARENT_ID;
      if (!parentId) {
        return { statusCode: 200, headers, body: JSON.stringify({ status: "skipped", reason: "No folderId and no parent configured to create one" }) };
      }
      const folderName = [safeName(ref), safeName(company)].filter(Boolean).join(" - ") || `job-${Date.now()}`;
      const created = await createJobFolder(drive, folderName, parentId);
      targetFolderId = created.folderId;
    }

    const buffer = Buffer.from(base64, "base64");
    const result = await uploadToFolder(drive, targetFolderId, buffer, safeName(filename), mimeType || "application/octet-stream");

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", folderId: targetFolderId, fileId: result.fileId }) };
  } catch (err) {
    console.error("upload-artwork-file error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};
