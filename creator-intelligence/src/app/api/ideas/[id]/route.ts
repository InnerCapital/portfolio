import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanUrl, detectPlatform } from "@/lib/platform";
import { enrichIdea } from "@/lib/enrich";

type Ctx = { params: Promise<{ id: string }> };

const editable = ["title", "url", "platform", "note", "sourceComments", "ownComments", "ownPostRef", "tags", "pillar", "status", "creatorId"] as const;

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const idea = await prisma.idea.findUnique({ where: { id } });
  if (!idea) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(idea);
}

export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const before = await prisma.idea.findUnique({ where: { id }, select: { url: true, enriching: true } });
  const data: Record<string, unknown> = {};
  for (const k of editable) if (k in body) data[k] = body[k];
  if (typeof data.url === "string") {
    data.url = cleanUrl(data.url);
    if (!body.platform) data.platform = detectPlatform(data.url as string);
  }
  if (data.pillar === "") data.pillar = null;
  if (data.creatorId === "") data.creatorId = null;
  if (Array.isArray(data.tags)) data.tags = (data.tags as unknown[]).map(String);
  // A URL just got pasted into an idea that was started blank: kick off the
  // same background enrichment a fresh link gets.
  const gotNewUrl = typeof data.url === "string" && data.url && data.url !== before?.url;
  if (gotNewUrl && !before?.enriching) data.enriching = true;
  const idea = await prisma.idea.update({ where: { id }, data });
  if (gotNewUrl) void enrichIdea(id);
  return NextResponse.json(idea);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  await prisma.idea.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
