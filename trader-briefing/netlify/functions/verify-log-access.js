// netlify/functions/verify-log-access.js
//
// Server-side check for the Submission Log access code. The code lives only
// in the LOG_ACCESS_CODE environment variable in Netlify, never in the page
// source. The page posts what the user typed; this returns { ok: true|false }.
//
// If LOG_ACCESS_CODE is not set, every attempt is refused (fail closed).
const crypto = require("crypto");

function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: "Method not allowed" }) };
  }

  const expected = process.env.LOG_ACCESS_CODE;
  if (!expected) {
    console.error("verify-log-access: LOG_ACCESS_CODE is not set");
    return { statusCode: 503, headers, body: JSON.stringify({ ok: false, error: "Not configured" }) };
  }

  let code = "";
  try {
    code = (JSON.parse(event.body || "{}").code || "").toString();
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ ok: false, error: "Invalid request body" }) };
  }

  const ok = code.length > 0 && code.length <= 200 && safeEqual(code, expected);
  return { statusCode: ok ? 200 : 401, headers, body: JSON.stringify({ ok }) };
};
