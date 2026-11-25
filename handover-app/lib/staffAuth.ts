import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CLIENT_ID } from '@/lib/googleClientId';

// Same staff domains as the quote tool and Trader Briefing ops tool.
export const STAFF_DOMAINS = ['acmehire.example', 'acmecapital.example'];

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export type StaffCheck =
  | { ok: true; email: string; name: string }
  | { ok: false; status: 401 | 403; error: string };

// Verifies a Google ID token (signature, expiry, audience) and that the account
// belongs to an Acme Hire domain.
export async function verifyStaffIdToken(idToken: string): Promise<StaffCheck> {
  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
    payload = ticket.getPayload() || {};
  } catch {
    return { ok: false, status: 401, error: 'Sign-in failed or expired, please try again' };
  }

  const email = String(payload.email || '').toLowerCase();
  const domain = email.split('@')[1] || '';
  // `hd` is Google Workspace's hosted-domain claim. When present it must match,
  // so a personal Google account can't pass on an alias address.
  if (!payload.email_verified || !STAFF_DOMAINS.includes(domain) || (payload.hd && payload.hd !== domain)) {
    return { ok: false, status: 403, error: 'Use your Acme Hire Google account to sign in' };
  }
  return { ok: true, email, name: payload.name || email };
}
