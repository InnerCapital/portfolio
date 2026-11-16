import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = String(body.name);
  if ("handle" in body) data.handle = String(body.handle);
  if ("platforms" in body && Array.isArray(body.platforms)) data.platforms = body.platforms.map(String);
  if ("answers" in body && body.answers && typeof body.answers === "object") data.answers = body.answers;
  if ("context" in body) data.context = String(body.context);
  if ("pillars" in body && body.pillars) data.pillars = body.pillars;
  const p = await prisma.profile.update({ where: { id }, data });
  return NextResponse.json(p);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const n = await prisma.profile.count();
  if (n <= 1) return NextResponse.json({ error: "Keep at least one profile" }, { status: 400 });
  await prisma.profile.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
