import { requireGoogleUser } from "@/lib/guard";
import { sendEmailCode } from "@/lib/mfa";

export const dynamic = "force-dynamic";

// Emails a 6-digit sign-in code to the signed-in person's own @acmehire.example address.
// The address always comes from the Google session, never from the request.
export async function POST(req: Request) {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    return Response.json({ error: "Bad request" }, { status: 415 });
  }
  const user = await requireGoogleUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const result = await sendEmailCode(user.email);
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
  return Response.json({ ok: true });
}
