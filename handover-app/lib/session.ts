// Signed cookies for the two kinds of access, both HMAC-SHA256 via Web Crypto
// (so they work in proxy.ts and route handlers alike):
//   - staff: issued after a Google ID token is verified (app/api/auth/login)
//   - job:   issued when a one-off job link is opened (app/job/[token]); scoped
//            to a single inspection's photo and checklist steps
// The `kind` field stops one kind of cookie being replayed as the other.

export const SESSION_COOKIE = 'ah_staff';
export const SESSION_TTL_SECONDS = 12 * 60 * 60;
export const JOB_COOKIE = 'ah_job';

export interface StaffSession {
  kind: 'staff';
  email: string;
  name: string;
  exp: number; // unix seconds
}

export interface JobSession {
  kind: 'job';
  inspectionId: string;
  exp: number; // unix seconds
}

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function hmacKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('SESSION_SECRET must be set (32+ characters)');
  }
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function sign(data: StaffSession | JobSession): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(data)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), encoder.encode(payload));
  return `${payload}.${base64url(new Uint8Array(sig))}`;
}

// Returns the payload if the signature is valid and it has not expired, else null.
async function verify(token: string | undefined): Promise<StaffSession | JobSession | null> {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  try {
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(),
      fromBase64url(sig) as BufferSource,
      encoder.encode(payload)
    );
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export function createSessionToken(email: string, name: string): Promise<string> {
  return sign({ kind: 'staff', email, name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS });
}

export async function verifySessionToken(token: string | undefined): Promise<StaffSession | null> {
  const data = await verify(token);
  return data?.kind === 'staff' ? data : null;
}

export function createJobSessionToken(inspectionId: string, expiresAt: Date): Promise<string> {
  return sign({ kind: 'job', inspectionId, exp: Math.floor(expiresAt.getTime() / 1000) });
}

export async function verifyJobSessionToken(token: string | undefined): Promise<JobSession | null> {
  const data = await verify(token);
  return data?.kind === 'job' ? data : null;
}
