import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { userForPassword, SESSION_COOKIE } from "@/lib/auth";
import { signSession } from "@/lib/session";
import { siteOrigin } from "@/lib/origin";

/** Development fallback: a shared password, used only when APP_PASSWORD is set. */
export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") || "");
  const next = String(form.get("next") || "/");
  const origin = siteOrigin(req);
  const pw = process.env.APP_PASSWORD || "";
  const ok = pw.length > 0 && password.length === pw.length && timingSafeEqual(Buffer.from(password), Buffer.from(pw));
  if (!ok) return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent("That password did not match.")}&next=${encodeURIComponent(next)}`, 303);
  const user = await userForPassword();
  const token = await signSession({ uid: user.id, email: user.email, exp: Date.now() + 1000 * 60 * 60 * 24 * 90 });
  const res = NextResponse.redirect(`${origin}${next.startsWith("/") ? next : "/"}`, 303);
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https"), path: "/", maxAge: 60 * 60 * 24 * 90 });
  return res;
}
