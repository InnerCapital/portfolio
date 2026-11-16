import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyseCreator, type Analysis } from "@/lib/intelligence";
import { personaOf } from "@/lib/ideaInput";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const c = await prisma.creator.findUniqueOrThrow({ where: { id }, include: { profile: true, ideas: true } });
    const breakdown = await analyseCreator(personaOf(c.profile), {
      handle: c.handle, platform: c.platform, name: c.name, niche: c.niche, notes: c.notes, evidence: c.evidence,
      linkedIdeas: c.ideas.map((i) => ({
        title: i.title, url: i.url, note: i.note, sourceComments: i.sourceComments,
        themes: ((i.analysis as unknown as Analysis | null)?.themes || []).map((t) => t.theme),
      })),
    });
    const data: Record<string, unknown> = { breakdown: JSON.parse(JSON.stringify(breakdown)), analysedAt: new Date() };
    if (!c.niche && breakdown.popularTopics?.[0]) data.niche = breakdown.popularTopics.slice(0, 3).map((t) => t.topic).join(", ");
    const updated = await prisma.creator.update({ where: { id }, data });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Breakdown failed" }, { status: 500 });
  }
}
