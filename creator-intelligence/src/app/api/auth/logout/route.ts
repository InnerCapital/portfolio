import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";

export async function POST(req: Request) {
  const res = NextResponse.redirect(`${siteOrigin(req)}/login`, 303);
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
