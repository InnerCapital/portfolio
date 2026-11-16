import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyseIdea } from "@/lib/intelligence";
import { loadIdeaInput } from "@/lib/ideaInput";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { idea, input, persona } = await loadIdeaInput(id);
    const analysis = await analyseIdea(persona, input);
    const pillar = idea.pillar || analysis.angles?.[0]?.pillar || null;
    const updated = await prisma.idea.update({
      where: { id },
      data: { analysis: JSON.parse(JSON.stringify(analysis)), analysedAt: new Date(), pillar },
    });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}
