import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };
const editable = ["handle", "platform", "name", "url", "niche", "notes", "evidence", "tiktokHandle", "linkedinUrl"] as const;

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | boolean> = {};
  for (const k of editable) if (k in body) data[k] = String(body[k]);
  if ("isSelf" in body) {
    const isSelf = Boolean(body.isSelf);
    data.isSelf = isSelf;
    // Only one "self" account per profile + platform: clear any others first.
    if (isSelf) {
      const me = await prisma.creator.findUniqueOrThrow({ where: { id }, select: { profileId: true, platform: true } });
      await prisma.creator.updateMany({ where: { profileId: me.profileId, platform: me.platform, isSelf: true, NOT: { id } }, data: { isSelf: false } });
    }
  }
  const c = await prisma.creator.update({ where: { id }, data });
  return NextResponse.json(c);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.creator.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
