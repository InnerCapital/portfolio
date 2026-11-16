import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

function normHandle(h: string) {
  const t = h.trim().replace(/^https?:\/\/(www\.)?(instagram|tiktok|linkedin|youtube)\.com\/(@)?/i, "").replace(/\/.*$/, "");
  return t.startsWith("@") ? t : `@${t}`;
}

export async function GET() {
  const p = await activeProfile();
  const creators = await prisma.creator.findMany({
    where: { profileId: p.id },
    orderBy: { handle: "asc" },
    include: { _count: { select: { ideas: true } }, topics: { include: { topic: true } } },
  });
  return NextResponse.json(creators.map((c) => ({ ...c, topics: c.topics.map((t) => t.topic) })));
}

export async function POST(req: Request) {
  const p = await activeProfile();
  const body = await req.json().catch(() => ({}));
  const handle = normHandle(String(body.handle || ""));
  if (handle.length < 2) return NextResponse.json({ error: "Handle is required" }, { status: 400 });
  const platform = String(body.platform || "Instagram");
  const creator = await prisma.creator.upsert({
    where: { profileId_platform_handle: { profileId: p.id, platform, handle } },
    create: { profileId: p.id, handle, platform, name: String(body.name || ""), url: String(body.url || ""), niche: String(body.niche || ""), notes: String(body.notes || ""), evidence: String(body.evidence || "") },
    update: { niche: body.niche ? String(body.niche) : undefined, notes: body.notes ? String(body.notes) : undefined },
  });
  if (body.ideaId) await prisma.idea.update({ where: { id: String(body.ideaId) }, data: { creatorId: creator.id } });
  return NextResponse.json(creator, { status: 201 });
}
