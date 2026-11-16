import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { suggestTopics, type Analysis } from "@/lib/intelligence";
import { personaOf } from "@/lib/ideaInput";

export const maxDuration = 120;

/** Ask the intelligence layer to group creators and ideas into topics, then apply it. */
export async function POST() {
  const p = await activeProfile();
  try {
    const creators = await prisma.creator.findMany({ where: { profileId: p.id }, include: { topics: { include: { topic: true } } } });
    const ideas = await prisma.idea.findMany({ where: { profileId: p.id }, take: 150, orderBy: { createdAt: "desc" } });
    const existing = await prisma.topic.findMany({ where: { profileId: p.id } });
    if (!creators.length && !ideas.length) return NextResponse.json({ error: "Nothing to group yet" }, { status: 400 });
    const s = await suggestTopics(
      personaOf(p),
      creators.map((c) => ({ id: c.id, handle: c.handle, niche: c.niche, topics: c.topics.map((t) => t.topic.name) })),
      ideas.map((i) => ({ id: i.id, title: i.title, note: i.note, themes: ((i.analysis as unknown as Analysis | null)?.themes || []).map((t) => t.theme), tags: i.tags })),
      existing.map((t) => t.name),
    );
    const creatorIds = new Set(creators.map((c) => c.id));
    const ideaIds = new Set(ideas.map((i) => i.id));
    let links = 0;
    for (const g of s.groups || []) {
      const name = g.name.trim();
      if (!name) continue;
      const t = await prisma.topic.upsert({ where: { profileId_name: { profileId: p.id, name } }, create: { profileId: p.id, name, description: g.description || "" }, update: { description: g.description || undefined } });
      for (const cid of g.creators || []) if (creatorIds.has(cid)) { await prisma.creatorTopic.upsert({ where: { creatorId_topicId: { creatorId: cid, topicId: t.id } }, create: { creatorId: cid, topicId: t.id }, update: {} }); links++; }
      for (const iid of g.ideas || []) if (ideaIds.has(iid)) { await prisma.ideaTopic.upsert({ where: { ideaId_topicId: { ideaId: iid, topicId: t.id } }, create: { ideaId: iid, topicId: t.id }, update: {} }); links++; }
    }
    return NextResponse.json({ groups: (s.groups || []).length, links });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Grouping failed" }, { status: 500 });
  }
}
