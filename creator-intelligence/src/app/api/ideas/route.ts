import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanUrl, detectPlatform, titleFromUrl } from "@/lib/platform";
import { activeProfile } from "@/lib/profile";
import { enrichIdea } from "@/lib/enrich";

export async function GET() {
  const p = await activeProfile();
  const ideas = await prisma.idea.findMany({ where: { profileId: p.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(ideas);
}

export async function POST(req: Request) {
  const p = await activeProfile();
  const body = await req.json().catch(() => ({}));
  const url = body.url ? cleanUrl(String(body.url)) : "";
  const idea = await prisma.idea.create({
    data: {
      profileId: p.id,
      title: String(body.title || (url ? titleFromUrl(url) : "")),
      url,
      platform: String(body.platform || detectPlatform(url)),
      note: String(body.note || ""),
      sourceComments: String(body.sourceComments || ""),
      ownComments: String(body.ownComments || ""),
      ownPostRef: String(body.ownPostRef || ""),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      pillar: body.pillar || null,
      status: body.status || "SPARK",
      creatorId: body.creatorId || null,
      enriching: Boolean(url),
    },
  });
  if (url) void enrichIdea(idea.id);
  return NextResponse.json(idea, { status: 201 });
}
