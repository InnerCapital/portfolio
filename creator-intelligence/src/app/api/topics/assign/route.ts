import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

/** Attach or detach a topic (by id or name) to a creator or an idea. */
export async function POST(req: Request) {
  const p = await activeProfile();
  const body = await req.json().catch(() => ({}));
  let topicId: string | undefined = body.topicId;
  if (!topicId && body.name) {
    const t = await prisma.topic.upsert({ where: { profileId_name: { profileId: p.id, name: String(body.name).trim() } }, create: { profileId: p.id, name: String(body.name).trim() }, update: {} });
    topicId = t.id;
  }
  if (!topicId) return NextResponse.json({ error: "topicId or name required" }, { status: 400 });
  const attach = body.attached !== false;
  if (body.creatorId) {
    if (attach) await prisma.creatorTopic.upsert({ where: { creatorId_topicId: { creatorId: body.creatorId, topicId } }, create: { creatorId: body.creatorId, topicId }, update: {} });
    else await prisma.creatorTopic.deleteMany({ where: { creatorId: body.creatorId, topicId } });
  }
  if (body.ideaId) {
    if (attach) await prisma.ideaTopic.upsert({ where: { ideaId_topicId: { ideaId: body.ideaId, topicId } }, create: { ideaId: body.ideaId, topicId }, update: {} });
    else await prisma.ideaTopic.deleteMany({ where: { ideaId: body.ideaId, topicId } });
  }
  return NextResponse.json({ ok: true, topicId });
}
