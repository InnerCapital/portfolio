import { requireUser } from "@/lib/guard";
import { resetFactor } from "@/lib/mfa";
import { emailAllowed } from "@/auth";

export const dynamic = "force-dynamic";

// Admin only (and the admin must have passed both sign-in steps): clears someone's
// authenticator so they set it up again next time they sign in. For a lost phone.
export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Bad request" }, { status: 415 });
  }
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });
  if (!user.admin) return Response.json({ error: "Admins only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!emailAllowed(email)) return Response.json({ error: "Enter an Acme Hire email address" }, { status: 400 });

  const existed = await resetFactor(user.email, email);
  return Response.json({ ok: true, existed });
}
