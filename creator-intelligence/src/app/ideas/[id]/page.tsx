import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import IdeaEditor, { type IdeaFull } from "@/components/IdeaEditor";
import SavedVideoPanel from "@/components/SavedVideoPanel";
import ResultPerformance, { type LinkedPiece } from "@/components/ResultPerformance";
import SendToNotion from "@/components/SendToNotion";
import { prisma } from "@/lib/prisma";
import { activeProfile, pillarsOf } from "@/lib/profile";
import { measuredPiecesForIdea, linkableSelfPieces, apifyReady, notionReady } from "@/lib/measure";

export const dynamic = "force-dynamic";

export default async function IdeaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await activeProfile();
  const idea = await prisma.idea.findFirst({
    where: { id, profileId: profile.id },
    include: {
      screenshots: { select: { id: true }, orderBy: { createdAt: "asc" } },
      refinements: { orderBy: { createdAt: "desc" } },
      linkedPosts: { include: { post: { select: { id: true, caption: true, permalink: true, commentsCount: true, likeCount: true, postedAt: true } } } },
      topics: { include: { topic: true } },
      creator: true,
    },
  });
  if (!idea) notFound();
  const [creators, topics, posts, resultPieces, linkable] = await Promise.all([
    prisma.creator.findMany({ where: { profileId: profile.id }, orderBy: { handle: "asc" }, select: { id: true, handle: true, platform: true } }),
    prisma.topic.findMany({ where: { profileId: profile.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.post.findMany({ where: { connection: { profileId: profile.id } }, orderBy: { postedAt: "desc" }, take: 40, select: { id: true, caption: true, permalink: true, commentsCount: true, likeCount: true, postedAt: true } }),
    measuredPiecesForIdea(idea.id),
    linkableSelfPieces(profile.id),
  ]);

  const full: IdeaFull = {
    id: idea.id,
    title: idea.title,
    url: idea.url,
    platform: idea.platform,
    note: idea.note,
    sourceComments: idea.sourceComments,
    ownComments: idea.ownComments,
    ownPostRef: idea.ownPostRef,
    tags: idea.tags,
    pillar: idea.pillar,
    status: idea.status,
    creatorId: idea.creatorId,
    enriching: idea.enriching,
    analysis: (idea.analysis as unknown as IdeaFull["analysis"]) || null,
    createdAt: idea.createdAt.toISOString(),
    screenshots: idea.screenshots.map((s) => s.id),
    refinements: idea.refinements.map((r) => ({ id: r.id, format: r.format, brief: r.brief as unknown as IdeaFull["refinements"][number]["brief"], createdAt: r.createdAt.toISOString() })),
    linkedPosts: idea.linkedPosts.map((lp) => ({ postId: lp.postId, role: lp.role })),
    topicIds: idea.topics.map((t) => t.topicId),
  };

  return (
    <main className="shell">
      <Nav who={profile.name} />
      <SavedVideoPanel
        ideaId={idea.id}
        url={idea.url}
        platform={idea.platform}
        initialAnalysis={JSON.parse(JSON.stringify(idea.videoAnalysis ?? null))}
        initialRecreation={JSON.parse(JSON.stringify(idea.recreation ?? null))}
        initialAnalysing={idea.videoAnalysing}
      />
      <IdeaEditor
        initial={full}
        creators={creators}
        topics={topics}
        posts={posts.map((p) => ({ ...p, postedAt: p.postedAt?.toISOString() || null }))}
        pillars={pillarsOf(profile)}
      />
      <ResultPerformance
        ideaId={idea.id}
        linked={resultPieces as unknown as LinkedPiece[]}
        linkable={linkable}
        apifyReady={apifyReady()}
      />
      <SendToNotion ideaId={idea.id} notionReady={notionReady()} />
      <Toast />
    </main>
  );
}
