import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";


export async function GET() {

  const profiles = await prisma.profile.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, handle: true, context: true } });
  return NextResponse.json(profiles.map((p) => ({ id: p.id, name: p.name, handle: p.handle, complete: p.context.trim().length > 200 })));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const p = await prisma.profile.create({ data: { name, handle: String(body.handle || ""), answers: {} } });
  return NextResponse.json(p, { status: 201 });
}
