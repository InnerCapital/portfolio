import { prisma } from "./prisma";
import type { IdeaInput, Persona } from "./intelligence";
import { pillarsOf } from "./profile";

export function personaOf(p: { name: string; context: string; pillars: unknown; insightsContext?: string }): Persona {
  const ctx = p.insightsContext && p.insightsContext.trim()
    ? `${p.context}\n\nACCUMULATED FINDINGS FROM YOUR OWN CONTENT ANALYSIS (real patterns pushed from measurement, build on these):\n${p.insightsContext.trim()}`
    : p.context;
  return { name: p.name, context: ctx, pillars: pillarsOf(p) };
}

export async function loadIdeaInput(id: string) {
  const idea = await prisma.idea.findUniqueOrThrow({
    where: { id },
    include: {
      profile: true,
      creator: true,
      linkedPosts: { include: { post: { include: { comments: { orderBy: { postedAt: "asc" } } } } } },
    },
  });
  const input: IdeaInput = {
    title: idea.title,
    url: idea.url,
    platform: idea.platform,
    note: idea.note,
    creator: idea.creator ? `${idea.creator.handle} (${idea.creator.platform}${idea.creator.niche ? `, ${idea.creator.niche}` : ""})` : undefined,
    sourceComments: idea.sourceComments,
    ownComments: idea.ownComments,
    ownPostRef: idea.ownPostRef,
    linkedPostComments: idea.linkedPosts.map((lp) => ({
      post: lp.post.caption.slice(0, 120) || lp.post.permalink,
      comments: lp.post.comments.map((c) => `${c.parentId ? "  > " : ""}${c.username}: ${c.text}`).join("\n") || "(no comments synced)",
    })),
  };
  return { idea, input, persona: personaOf(idea.profile) };
}
