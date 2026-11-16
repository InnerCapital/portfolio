import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { completeConnection } from "@/lib/instagram";
import { activeProfile } from "@/lib/profile";
import { siteOrigin } from "@/lib/origin";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = siteOrigin(req);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const err = url.searchParams.get("error_description") || url.searchParams.get("error");
  const jar = await cookies();
  const expected = jar.get("ig_state")?.value;
  if (err) return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(err)}`);
  if (!code || !state || state !== expected) return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent("Instagram sign-in did not complete (state mismatch). Try again.")}`);
  try {
    const profile = await activeProfile();
    const c = await completeConnection(code, profile.id);
    const res = NextResponse.redirect(`${base}/settings?connected=${encodeURIComponent(c.username)}`);
    res.cookies.set("ig_state", "", { path: "/", maxAge: 0 });
    return res;
  } catch (e) {
    return NextResponse.redirect(`${base}/settings?error=${encodeURIComponent(e instanceof Error ? e.message : "Connection failed")}`);
  }
}
