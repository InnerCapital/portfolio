/**
 * Signed session cookie using Web Crypto so it works in both the Edge
 * middleware and Node route handlers.
 */
export const SESSION_COOKIE = "ib_session";

export interface Session { uid: string; email: string; exp: number }

function secret() {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || "dev-secret";
}

const enc = new TextEncoder();

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  arr.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): string {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  return atob(pad);
}

async function key() {
  return crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signSession(s: Session): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify(s)));
  const sig = await crypto.subtle.sign("HMAC", await key(), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token || !token.includes(".")) return null;
  const [payload, sig] = token.split(".");
  try {
    const sigBytes = Uint8Array.from(fromB64url(sig), (c) => c.charCodeAt(0));
    const ok = await crypto.subtle.verify("HMAC", await key(), sigBytes, enc.encode(payload));
    if (!ok) return null;
    const s = JSON.parse(fromB64url(payload)) as Session;
    if (!s.uid || !s.exp || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}
