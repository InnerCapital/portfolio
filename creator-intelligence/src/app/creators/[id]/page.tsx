import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import CreatorDetail from "@/components/CreatorDetail";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import type { CreatorBreakdown } from "@/lib/intelligence";

export const dynamic = "force-dynamic";

export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await activeProfile();
  const c = await prisma.creator.findFirst({
    where: { id, profileId: profile.id },
    include: { ideas: { orderBy: { createdAt: "desc" }, select: { id: true, title: true, url: true, platform: true, analysedAt: true } }, topics: { include: { topic: true } } },
  });
  if (!c) notFound();
  const topics = await prisma.topic.findMany({ where: { profileId: profile.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <main className="shell">
      <Nav who={profile.name} />
      <CreatorDetail
        initial={{ id: c.id, handle: c.handle, platform: c.platform, name: c.name, url: c.url, niche: c.niche, notes: c.notes, evidence: c.evidence, breakdown: (c.breakdown as unknown as CreatorBreakdown) || null, topicIds: c.topics.map((t) => t.topicId) }}
        ideas={c.ideas.map((i) => ({ ...i, analysed: Boolean(i.analysedAt) }))}
        topics={topics}
        profileName={profile.name}
      />
      <Toast />
    </main>
  );
}
