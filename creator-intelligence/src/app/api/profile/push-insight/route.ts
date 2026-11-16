import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

/**
 * Append a finding (batch insight, outlier read, chat answer) to the profile's
 * accumulated insights context, so the Ideas Bank builds on prior analysis
 * instead of siloed one-off pushes. Newest first, length-bounded.
 */
export async function POST(req: Request) {
  try {
    const profile = await activeProfile();
    const body = await req.json().catch(() => ({}));
    const text = String(body.text || "").trim();
    const source = String(body.source || "insight").slice(0, 40);
    if (!text) return NextResponse.json({ error: "Nothing to push." }, { status: 400 });
    const stamp = new Date().toISOString().slice(0, 10);
    const entry = `[${stamp}] ${source}: ${text}`.slice(0, 4000);
    const current = (profile as { insightsContext?: string }).insightsContext || "";
    const next = `${entry}\n\n${current}`.trim().slice(0, 12000);
    await prisma.profile.update({ where: { id: profile.id }, data: { insightsContext: next } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Push failed" }, { status: 500 });
  }
}
