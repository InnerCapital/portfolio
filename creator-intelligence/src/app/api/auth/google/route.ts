import { NextResponse } from "next/server";
import { googleConfigured } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!googleConfigured()) return NextResponse.redirect(`${siteOrigin(req)}/login?error=${encodeURIComponent("Google sign-in is not configured yet.")}`);
  const state = crypto.randomUUID();
  const next = url.searchParams.get("next") || "/";
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || "",
    redirect_uri: `${siteOrigin(req)}/api/auth/google/callback`,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
  res.cookies.set("g_state", `${state}|${next}`, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
