import { cookies } from "next/headers";
import { requireGoogleUser } from "@/lib/guard";
import { checkSignIn, confirmEnrollment, isEnrolled } from "@/lib/mfa";
import { MFA_COOKIE, mfaCookieOptions, signMfa } from "@/lib/mfaCookie";

export const dynamic = "force-dynamic";

// Second sign-in step. Needs a Google session first. On success sets the signed
// two-step cookie; on first setup also returns the one-time recovery codes.
export async function POST(req: Request) {
  // JSON only: a cross-site form can't send this without a CORS preflight.
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Bad request" }, { status: 415 });
  }
  const user = await requireGoogleUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = typeof body.code === "string" ? body.code.slice(0, 40) : "";
  if (!code.trim()) return Response.json({ error: "Enter the code" }, { status: 400 });

  const result = (await isEnrolled(user.email))
    ? await checkSignIn(user.email, code)
    : await confirmEnrollment(user.email, code);

  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  (await cookies()).set(MFA_COOKIE, await signMfa(user.email), mfaCookieOptions());
  return Response.json({
    ok: true,
    recoveryCodes: result.recoveryCodes ?? null,
    remaining: result.usedRecovery ? result.remaining : null,
  });
}
