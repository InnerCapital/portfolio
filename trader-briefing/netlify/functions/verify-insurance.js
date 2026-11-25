// netlify/functions/verify-insurance.js
//
// Quick Haiku sanity check on an uploaded insurance certificate against the
// Hire Agreement's actual minimums (Cl.15.1 in both agreement versions):
// Public Liability >= £10m, Products Liability >= £5m, Employers' Liability
// >= £5m where staff are employed. Deliberately a SOFT check, not a hard block —
// same pattern as check-photo.js in the sibling app (handover-app):
// flag concerns, let the trader retry with a different file or confirm and
// continue anyway. A vision model misreading a legitimate certificate and
// permanently blocking a real trader would be worse than an occasional false
// pass — this is a first-pass sanity check, not the final word. Ops still
// reviews the actual file in the Job Folder before delivery is confirmed.
const { anthropicPost } = require("./lib/anthropic");

const PROMPT = `You are doing a quick sanity check on an uploaded insurance certificate for a commercial kitchen unit hire.

Acme Hire's minimum requirements (from the Hire Agreement):
- Public Liability insurance: at least £10,000,000
- Products Liability insurance: at least £5,000,000
- Employers' Liability insurance: at least £5,000,000, required only if the business employs staff (if it is shown, check it meets £5,000,000)

Look at the document and assess it. Return ONLY a valid JSON object, no markdown, no preamble:
{
  "looksLikeCertificate": true or false,
  "coverTypes": ["Public Liability", "Products Liability", "Employers' Liability"] (whichever are identifiable, empty array if none),
  "publicLiabilityAmount": "amount as shown, e.g. £10,000,000, or null if not found",
  "productsLiabilityAmount": "amount as shown, or null if not found",
  "employersLiabilityAmount": "amount as shown, or null if not found",
  "expiryDate": "date as shown, or null if not found",
  "expired": true, false, or null if the date can't be determined against today,
  "meetsMinimums": true or false or null if not enough information is visible to tell,
  "concerns": ["short plain-English notes on anything that looks wrong or unclear — wrong document type, illegible, expired, amount below minimum, cover type missing, etc. Empty array if it all looks fine."]
}

Be conservative: if the document is blurry, cropped, or you genuinely can't read the key figures, say so in concerns and set meetsMinimums to null rather than guessing.`;

exports.handler = async function (event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };

  if (!process.env.ANTHROPIC_API_KEY) {
    // Non-fatal from the caller's point of view — the upload/gate itself
    // doesn't depend on this check existing. See index.html: an unreachable
    // check is treated as "unable to verify", not as a failure.
    return { statusCode: 200, headers, body: JSON.stringify({ checked: false, reason: "Not configured" }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  const { base64, mimeType } = body;
  if (!base64 || !mimeType) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "base64 and mimeType required" }) };
  }

  const isPdf = mimeType === "application/pdf";
  const contentBlock = isPdf
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
    : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } };

  try {
    const response = await anthropicPost({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: [contentBlock, { type: "text", text: PROMPT }] }],
    });

    if (response.status !== 200) {
      console.error("Anthropic error:", response.body);
      return { statusCode: 200, headers, body: JSON.stringify({ checked: false, reason: "Check failed" }) };
    }

    const rawText = (response.body.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const clean = rawText.replace(/```json|```/g, "").trim();

    let result;
    try {
      result = JSON.parse(clean);
    } catch (e) {
      return { statusCode: 200, headers, body: JSON.stringify({ checked: false, reason: "Could not parse check result" }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ checked: true, ...result }) };
  } catch (e) {
    console.error("verify-insurance error:", e);
    return { statusCode: 200, headers, body: JSON.stringify({ checked: false, reason: "Check failed" }) };
  }
};
