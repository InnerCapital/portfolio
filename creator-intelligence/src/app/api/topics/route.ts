import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

export async function GET() {
  const p = await activeProfile();
  const topics = await prisma.topic.findMany({ where: { profileId: p.id }, orderBy: { name: "asc" }, include: { _count: { select: { creators: true, ideas: true } } } });
  return NextResponse.json(topics);
}

export async function POST(req: Request) {
  const p = await activeProfile();
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const t = await prisma.topic.upsert({
    where: { profileId_name: { profileId: p.id, name } },
    create: { profileId: p.id, name, description: String(body.description || "") },
    update: {},
  });
  return NextResponse.json(t, { status: 201 });
}
