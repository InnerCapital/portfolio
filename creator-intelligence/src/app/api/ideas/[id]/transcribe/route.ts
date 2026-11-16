import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { transcribeScreenshots } from "@/lib/intelligence";

export const maxDuration = 120;

/** Read caption, handle and comments out of this idea's screenshots. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const shots = await prisma.screenshot.findMany({ where: { ideaId: id }, orderBy: { createdAt: "asc" }, take: 8 });
    if (!shots.length) return NextResponse.json({ error: "No screenshots on this idea" }, { status: 400 });
    const t = await transcribeScreenshots(shots.map((s) => ({ mimeType: s.mimeType, data: Buffer.from(s.data) })));
    const idea = await prisma.idea.findUniqueOrThrow({ where: { id } });
    const parts = [idea.sourceComments.trim(), t.caption ? `CAPTION: ${t.caption}` : "", t.comments.trim()].filter(Boolean);
    const data: Record<string, unknown> = { sourceComments: parts.join("\n") };
    if (t.platform && !idea.platform) data.platform = t.platform;
    const updated = await prisma.idea.update({ where: { id }, data });
    return NextResponse.json({ idea: updated, handle: t.handle, platform: t.platform });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Transcription failed" }, { status: 500 });
  }
}
