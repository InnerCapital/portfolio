import { auth } from "@/auth";
import { MFA_COOKIE, mfaValid } from "@/lib/mfaCookie";

// Step 1: Google. Step 2: authenticator app (/mfa). Pages and API routes also
// check both steps themselves (lib/guard.ts); this just sends people to the right step.
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (pathname.startsWith("/login")) return;

  if (!req.auth) {
    if (isApi) return Response.json({ error: "Not signed in" }, { status: 401 });
    return Response.redirect(new URL("/login", req.nextUrl));
  }

  if (pathname === "/mfa" || pathname.startsWith("/api/mfa/")) return;

  const passed = await mfaValid(req.cookies.get(MFA_COOKIE)?.value, req.auth.user?.email);
  if (passed) return;
  if (isApi) return Response.json({ error: "Two-step sign-in required" }, { status: 401 });
  return Response.redirect(new URL("/mfa", req.nextUrl));
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};
