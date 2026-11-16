import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import PostsPanel from "@/components/PostsPanel";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function PostsPage() {
  const profile = await activeProfile();
  const conns = await prisma.socialConnection.findMany({ where: { profileId: profile.id } });
  const posts = await prisma.post.findMany({
    where: { connection: { profileId: profile.id } },
    orderBy: { postedAt: "desc" },
    take: 60,
    include: { comments: { orderBy: [{ likeCount: "desc" }, { postedAt: "asc" }], take: 200 }, ideas: { select: { ideaId: true, role: true } } },
  });
  return (
    <main className="shell">
      <Nav who={profile.name} />
      <PostsPanel
        connected={conns.map((c) => ({ username: c.username, lastSyncAt: c.lastSyncAt?.toISOString() || null }))}
        posts={posts.map((p) => ({
          id: p.id, caption: p.caption, permalink: p.permalink, thumbnailUrl: p.thumbnailUrl, mediaType: p.mediaType,
          postedAt: p.postedAt?.toISOString() || null, likeCount: p.likeCount, commentsCount: p.commentsCount,
          comments: p.comments.map((c) => ({ id: c.id, username: c.username, text: c.text, likeCount: c.likeCount, reply: Boolean(c.parentId) })),
          ideas: p.ideas,
        }))}
      />
      <Toast />
    </main>
  );
}
