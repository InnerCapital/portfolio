import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { personaOf } from "@/lib/ideaInput";
import { measureCreator } from "@/lib/measure";
import { batchInsight, type BatchPieceCtx } from "@/lib/intelligence";

export const maxDuration = 90;

export async function POST(req: Request) {
  try {
    const profile = await activeProfile();
    const body = await req.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body.pieceIds) ? body.pieceIds.map(String) : [];
    if (ids.length < 2) return NextResponse.json({ error: "Select at least two posts to analyse together." }, { status: 400 });

    const self = await prisma.creator.findFirst({ where: { profileId: profile.id, isSelf: true }, select: { id: true } });
    if (!self) return NextResponse.json({ error: "Set your own account first." }, { status: 400 });

    const m = await measureCreator(self.id);
    const idset = new Set(ids);
    const chosen = m.pieces.filter((p) => idset.has(p.id));
    if (chosen.length < 2) return NextResponse.json({ error: "Those posts were not found on your account." }, { status: 400 });

    const ctx: BatchPieceCtx[] = chosen.map((p) => ({
      caption: p.caption, platform: p.platform, likes: p.likes, comments: p.comments, views: p.views,
      engagementRate: p.engagementRate, verdict: p.verdict, percentile: p.percentile, read: p.read || "",
      hook: p.teardown?.hookPreview || (p.teardown?.hookType ? `${p.teardown.hookType} hook` : ""),
      overall: p.teardown?.overall ?? null,
    }));
    const insight = await batchInsight(personaOf(profile), ctx);
    return NextResponse.json({ insight, count: chosen.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Batch analysis failed" }, { status: 500 });
  }
}
