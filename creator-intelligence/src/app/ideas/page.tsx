import Link from "next/link";
import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import IdeasList, { type IdeaRow } from "@/components/IdeasList";
import { prisma } from "@/lib/prisma";
import { activeProfile, isComplete } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const profile = await activeProfile();
  const ideas = await prisma.idea.findMany({
    where: { profileId: profile.id },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { screenshots: true, refinements: true, linkedPosts: true, resultPieces: true } }, creator: { select: { handle: true } }, topics: { include: { topic: { select: { name: true } } } } },
  });
  const rows: IdeaRow[] = ideas.map((i) => ({
    id: i.id,
    title: i.title,
    url: i.url,
    platform: i.platform,
    note: i.note,
    tags: i.tags,
    pillar: i.pillar,
    status: i.status,
    creator: i.creator?.handle || "",
    topics: i.topics.map((t) => t.topic.name),
    createdAt: i.createdAt.toISOString(),
    analysis: (i.analysis as unknown as IdeaRow["analysis"]) || null,
    enriching: i.enriching,
    counts: i._count,
    hasComments: Boolean(i.sourceComments.trim() || i.ownComments.trim() || i._count.linkedPosts),
    hasResult: i._count.resultPieces > 0,
    videoAnalysed: Boolean(i.videoAnalysis),
    videoAnalysing: i.videoAnalysing,
    hasRecipe: Boolean(i.recreation),
  }));
  return (
    <main className="shell">
      <Nav who={profile.name} />
      {!isComplete(profile) ? (
        <div className="notice">
          The intelligence layer does not know who it is writing for yet. <Link href="/profile">Complete your profile</Link> so every analysis and brief is written for you, not for a generic creator.
        </div>
      ) : null}
      <IdeasList initial={rows} />
      <Toast />
    </main>
  );
}
