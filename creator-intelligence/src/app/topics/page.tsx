import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import TopicsPanel from "@/components/TopicsPanel";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function TopicsPage() {
  const profile = await activeProfile();
  const topics = await prisma.topic.findMany({
    where: { profileId: profile.id },
    orderBy: { name: "asc" },
    include: { creators: { include: { creator: { select: { id: true, handle: true } } } }, ideas: { include: { idea: { select: { id: true, title: true } } } } },
  });
  return (
    <main className="shell">
      <Nav who={profile.name} />
      <TopicsPanel initial={topics.map((t) => ({ id: t.id, name: t.name, description: t.description, creators: t.creators.map((c) => c.creator), ideas: t.ideas.map((i) => i.idea) }))} />
      <Toast />
    </main>
  );
}
