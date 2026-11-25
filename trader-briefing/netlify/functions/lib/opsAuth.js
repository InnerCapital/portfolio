// netlify/functions/lib/opsAuth.js
//
// Server-side checks for Ops-only endpoints called from generate.html.
//
// requireOpsUser(): the generate page already signs staff in with Google, but
// until now that was only checked in the browser. This verifies the Google ID
// token with Google and checks the audience and email domain, so the Attio
// endpoints can't be called by anyone who just knows the URL.
//
// requirePasscode(): the write gate for any endpoint that writes into a live
// business system. The generate page prompts for it; this validates it
// against ATTIO_WRITE_PASSCODE with a constant-time comparison.

const crypto = require("crypto");

const CLIENT_ID = "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
const ALLOWED_DOMAINS = ["acmehire.example", "acmecapital.example"];

class AuthError extends Error {
  constructor(message, statusCode = 401) { super(message); this.statusCode = statusCode; }
}

async function requireOpsUser(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new AuthError("Not signed in");

  const res = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(token));
  if (!res.ok) throw new AuthError("Google sign-in has expired. Sign out and sign in again.");
  const info = await res.json();

  const email = String(info.email || "").toLowerCase();
  const domain = email.split("@")[1] || "";
  if (info.aud !== CLIENT_ID) throw new AuthError("Token was not issued for this app", 403);
  if (String(info.email_verified) !== "true") throw new AuthError("Email not verified", 403);
  if (!ALLOWED_DOMAINS.includes(domain)) throw new AuthError(`${email} is not an authorised domain`, 403);
  return { email };
}

function requirePasscode(event) {
  const expected = process.env.ATTIO_WRITE_PASSCODE;
  if (!expected) throw new AuthError("ATTIO_WRITE_PASSCODE not configured", 500);
  const given = event.headers?.["x-ah-passcode"] || event.headers?.["X-AH-Passcode"] || "";
  const a = crypto.createHash("sha256").update(String(given)).digest();
  const b = crypto.createHash("sha256").update(String(expected)).digest();
  if (!given || !crypto.timingSafeEqual(a, b)) throw new AuthError("Incorrect passcode", 403);
}

module.exports = { requireOpsUser, requirePasscode, AuthError };
