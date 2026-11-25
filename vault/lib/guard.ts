import { cookies } from "next/headers";
import { auth } from "@/auth";
import { adminEmails, emailAllowed, isKeyholder } from "@/lib/access";
import { MFA_COOKIE, mfaValid } from "@/lib/mfaCookie";

export type VaultUser = { email: string; admin: boolean; keyholder: boolean };

/** Google sign-in only. Used by the two-step sign-in page and its API, nothing else. */
export async function requireGoogleUser(): Promise<VaultUser | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !emailAllowed(email)) return null;
  return { email, admin: adminEmails().includes(email), keyholder: isKeyholder(email) };
}

// Every API route and page calls this itself. Middleware is a convenience, not the only gate.
// A user is only let in after BOTH Google sign-in AND the authenticator-app step.
export async function requireUser(): Promise<VaultUser | null> {
  const user = await requireGoogleUser();
  if (!user) return null;
  const jar = await cookies();
  if (!(await mfaValid(jar.get(MFA_COOKIE)?.value, user.email))) return null;
  return user;
}
