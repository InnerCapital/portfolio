import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { createPipelineRow, isConfigured } from "@/lib/notion";
import type { Brief } from "@/lib/intelligence";

export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    if (!isConfigured()) return NextResponse.json({ error: "NOTION_TOKEN is not set on the server." }, { status: 400 });
    const profile = await activeProfile();
    const idea = await prisma.idea.findFirst({
      where: { id, profileId: profile.id },
      include: { refinements: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

    const brief = idea.refinements[0]?.brief as unknown as Brief | undefined;
    const notes = [
      idea.note,
      brief?.bigIdea ? `Big idea: ${brief.bigIdea}` : "",
      brief?.hooks?.[0]?.line ? `Hook: ${brief.hooks[0].line}` : "",
      brief?.cta?.ask ? `CTA: ${brief.cta.ask}` : "",
      idea.url ? `Inspiration: ${idea.url}` : "",
    ].filter(Boolean).join("\n");

    const { url } = await createPipelineRow({ title: idea.title || "Untitled idea", platform: idea.platform, notes });
    return NextResponse.json({ url });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send to Notion failed" }, { status: 500 });
  }
}
