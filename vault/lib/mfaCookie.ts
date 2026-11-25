// The "second step passed" marker. A short signed cookie, separate from the
// Auth.js session, so the client can never set it itself (Auth.js session
// updates can be posted from the browser, so they are not trusted for this).
// Uses Web Crypto so it works in both middleware (edge) and route handlers (node).

export const MFA_MAX_AGE_SECONDS = 60 * 60 * 8; // same as the Google session

export const MFA_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-vault-mfa" : "vault-mfa";

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function key(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET must be set");
  // Separate key from Auth.js's own use of AUTH_SECRET.
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = new Uint8Array(await crypto.subtle.sign("HMAC", base, enc.encode("ah-vault-mfa-v1")));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signMfa(email: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + MFA_MAX_AGE_SECONDS;
  const payload = b64url(enc.encode(JSON.stringify({ e: email.toLowerCase(), x: exp })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** True only if the cookie is genuine, unexpired, and for this same Google account. */
export async function mfaValid(token: string | undefined, email: string | null | undefined): Promise<boolean> {
  if (!token || !email) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    const ok = await crypto.subtle.verify("HMAC", await key(), fromB64url(sig) as BufferSource, enc.encode(payload));
    if (!ok) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.e === email.toLowerCase() && typeof data.x === "number" && data.x > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function mfaCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: MFA_MAX_AGE_SECONDS,
  };
}
