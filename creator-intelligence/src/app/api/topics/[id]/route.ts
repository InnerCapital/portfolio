import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const t = await prisma.topic.update({ where: { id }, data: { name: body.name ? String(body.name) : undefined, description: "description" in body ? String(body.description) : undefined } });
  return NextResponse.json(t);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.topic.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
