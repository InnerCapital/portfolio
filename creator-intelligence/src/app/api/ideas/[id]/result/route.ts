import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await activeProfile();
  const body = await req.json().catch(() => ({}));
  const pieceId = String(body.pieceId || "");
  const unlink = Boolean(body.unlink);
  if (!pieceId) return NextResponse.json({ error: "pieceId is required" }, { status: 400 });

  const idea = await prisma.idea.findFirst({ where: { id, profileId: profile.id }, select: { id: true } });
  if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

  const piece = await prisma.contentPiece.findUnique({ where: { id: pieceId }, include: { creator: { select: { profileId: true, isSelf: true } } } });
  if (!piece || piece.creator.profileId !== profile.id) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (unlink) {
    if (piece.ideaId !== id) return NextResponse.json({ error: "That post is not linked to this idea" }, { status: 400 });
    await prisma.contentPiece.update({ where: { id: pieceId }, data: { ideaId: null } });
    return NextResponse.json({ ok: true, linked: false });
  }

  if (!piece.creator.isSelf) {
    return NextResponse.json({ error: "Only your own posts can be a published result. Mark that account as yours on the Measure page first." }, { status: 400 });
  }
  await prisma.contentPiece.update({ where: { id: pieceId }, data: { ideaId: id } });
  // Publishing a result means the idea is posted; reflect that in its status.
  await prisma.idea.update({ where: { id }, data: { status: "POSTED" } });
  return NextResponse.json({ ok: true, linked: true });
}
