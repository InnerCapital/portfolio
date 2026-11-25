// netlify/functions/upload-insurance.js
//
// The actual hard gate: the trader can't complete their declaration without
// this succeeding (awaited, not fire-and-forget, unlike the signature upload —
// see submitDeclaration() in index.html). Uploads into the Job Folder created
// at link-generation time (folderId passed through the trader link's query
// params); if folderId is missing — an older link generated before this
// shipped, or create-job-folder.js wasn't configured yet at generation time —
// creates a folder on the fly so the upload still succeeds rather than failing
// the whole declaration over missing plumbing from an earlier step.
const { getDrive, safeName, createJobFolder, uploadToFolder } = require("./lib/driveJobFolder");
const { syncTraderEvent } = require("./lib/attioSync");

// The trader's browser only needs to know it happened, not the deal details.
const summarise = (r) => (r && (r.executed ? "updated" : r.testMode ? "test-mode" : r.skipped ? "skipped" : r.error ? "error" : "unchanged"));

exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

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

  const { folderId, ref, company, files } = data;
  if (!Array.isArray(files) || files.length === 0) {
    return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "At least one file is required" }) };
  }

  try {
    const drive = getDrive();

    let targetFolderId = folderId;
    if (!targetFolderId) {
      const folderName = [safeName(ref), safeName(company)].filter(Boolean).join(" - ") || `job-${Date.now()}`;
      const created = await createJobFolder(drive, folderName, parentId);
      targetFolderId = created.folderId;
    }

    const uploaded = [];
    for (const f of files) {
      if (!f || !f.base64 || !f.name) continue;
      const buffer = Buffer.from(f.base64, "base64");
      const filename = `Insurance_${safeName(f.name)}`;
      const result = await uploadToFolder(drive, targetFolderId, buffer, filename, f.mimeType || "application/octet-stream");
      uploaded.push({ name: filename, fileId: result.fileId });
    }

    if (uploaded.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ status: "error", message: "No valid files provided" }) };
    }

    // Insurance status -> "Uploaded" on the linked Attio deal (never overwrites
    // Ops' "Verified"). Awaited so Netlify doesn't freeze it mid-request, but
    // syncTraderEvent never throws, so it can't fail the upload.
    const attio = await syncTraderEvent(targetFolderId, "insurance_uploaded");

    return { statusCode: 200, headers, body: JSON.stringify({ status: "ok", folderId: targetFolderId, uploaded, attio: summarise(attio) }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ status: "error", message: err.toString() }) };
  }
};
