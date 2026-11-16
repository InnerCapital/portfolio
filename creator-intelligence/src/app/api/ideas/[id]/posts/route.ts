import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

/** Link or unlink one of our synced posts to this idea, as a signal (comments feed the idea) or a result (the post the idea became). */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { postId, linked, role } = await req.json();
  const r = role === "result" ? "result" : "signal";
  if (linked) {
    await prisma.ideaPost.upsert({ where: { ideaId_postId: { ideaId: id, postId } }, create: { ideaId: id, postId, role: r }, update: { role: r } });
    if (r === "result") await prisma.idea.update({ where: { id }, data: { status: "POSTED" } });
  } else {
    await prisma.ideaPost.deleteMany({ where: { ideaId: id, postId } });
  }
  return NextResponse.json({ ok: true });
}
