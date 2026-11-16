import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { allowedEmail, userForGoogle, SESSION_COOKIE } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { siteOrigin } from "@/lib/origin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = siteOrigin(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const [expected, next = "/"] = (jar.get("g_state")?.value || "").split("|");
  const fail = (msg: string) => NextResponse.redirect(`${base}/login?error=${encodeURIComponent(msg)}`);
  if (!code || !state || state !== expected) return fail("Google sign-in did not complete. Try again.");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: `${base}/api/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  const tok = await tokenRes.json();
  if (!tok.access_token) return fail(tok.error_description || "Google token exchange failed");

  const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
  const info = await infoRes.json();
  const email = String(info.email || "").toLowerCase();
  if (!email || !info.email_verified) return fail("Google did not return a verified email");
  if (!allowedEmail(email)) return fail(`${email} is not on the allowed list for this bank.`);

  const user = await userForGoogle(email, String(info.name || ""), String(info.picture || ""));
  const token = await signSession({ uid: user.id, email, exp: Date.now() + 1000 * 60 * 60 * 24 * 90 });
  const res = NextResponse.redirect(`${base}${next.startsWith("/") ? next : "/"}`);
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: base.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 90 });
  res.cookies.set("g_state", "", { path: "/", maxAge: 0 });
  return res;
}
