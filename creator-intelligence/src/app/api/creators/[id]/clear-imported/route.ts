import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

/**
 * Remove the Notion-imported posts for a creator, leaving only the live
 * scraped ones (which carry thumbnails and full metrics). The import can be
 * re-run any time from "Import from Notion", so this is reversible.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await activeProfile();
  const creator = await prisma.creator.findFirst({ where: { id, profileId: profile.id }, select: { id: true } });
  if (!creator) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const res = await prisma.contentPiece.deleteMany({
    where: { creatorId: creator.id, source: { startsWith: "notion:" } },
  });
  return NextResponse.json({ ok: true, removed: res.count });
}
