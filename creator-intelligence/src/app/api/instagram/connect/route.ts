import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authorizeUrl, isConfigured } from "@/lib/instagram";
import { siteOrigin } from "@/lib/origin";

export async function GET(req: Request) {
  const origin = siteOrigin(req);
  if (!isConfigured()) return NextResponse.redirect(`${origin}/settings?error=${encodeURIComponent("Instagram app is not configured. Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and APP_URL.")}`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authorizeUrl(state));
  res.cookies.set("ig_state", state, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
