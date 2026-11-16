import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refineIdea, type Analysis } from "@/lib/intelligence";
import { loadIdeaInput } from "@/lib/ideaInput";
import { FORMAT_GUIDES } from "@/lib/brand";

export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const format = String(body.format || "");
  if (!(format in FORMAT_GUIDES)) return NextResponse.json({ error: "Unknown format" }, { status: 400 });
  try {
    const { idea, input, persona } = await loadIdeaInput(id);
    const brief = await refineIdea(persona, input, (idea.analysis as unknown as Analysis) || null, format as keyof typeof FORMAT_GUIDES, body.angle ? String(body.angle) : undefined);
    const saved = await prisma.refinement.create({
      data: { ideaId: id, format: format as "LONG_FORM" | "SHORT_FORM" | "CAROUSEL" | "LINKEDIN", brief: JSON.parse(JSON.stringify(brief)) },
    });
    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Refinement failed" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { refinementId } = await req.json();
  await prisma.refinement.deleteMany({ where: { id: refinementId, ideaId: id } });
  return NextResponse.json({ ok: true });
}
