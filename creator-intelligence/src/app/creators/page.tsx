import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import CreatorsList from "@/components/CreatorsList";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function CreatorsPage() {
  const profile = await activeProfile();
  const creators = await prisma.creator.findMany({
    where: { profileId: profile.id },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { ideas: true } }, topics: { include: { topic: { select: { name: true } } } } },
  });
  return (
    <main className="shell">
      <Nav who={profile.name} />
      <CreatorsList initial={creators.map((c) => ({ id: c.id, handle: c.handle, platform: c.platform, niche: c.niche, analysed: Boolean(c.breakdown), ideas: c._count.ideas, topics: c.topics.map((t) => t.topic.name), summary: ((c.breakdown as { summary?: string } | null)?.summary) || "" }))} />
      <Toast />
    </main>
  );
}
