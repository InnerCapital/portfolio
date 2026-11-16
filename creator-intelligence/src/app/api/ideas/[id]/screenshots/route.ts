import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type Ctx = { params: Promise<{ id: string }> };
const MAX = 4 * 1024 * 1024;

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const form = await req.formData();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const saved = [];
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    if (f.size > MAX) return NextResponse.json({ error: `${f.name} is over 4 MB` }, { status: 413 });
    const buf = Buffer.from(await f.arrayBuffer());
    const s = await prisma.screenshot.create({ data: { ideaId: id, mimeType: f.type, data: buf }, select: { id: true, mimeType: true, createdAt: true } });
    saved.push(s);
  }
  return NextResponse.json(saved, { status: 201 });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { screenshotId } = await req.json();
  await prisma.screenshot.deleteMany({ where: { id: screenshotId, ideaId: id } });
  return NextResponse.json({ ok: true });
}
