import { prisma } from "./prisma";
import { fetchLinkMeta } from "./oembed";
import { researchIdeaFromLink } from "./intelligence";
import { loadIdeaInput } from "./ideaInput";

function normHandle(h: string): string {
  const t = h.trim();
  return t.startsWith("@") ? t : `@${t}`;
}

/**
 * Downloads a thumbnail image so it can be attached to the vision-enabled
 * research call. Best-effort: any failure (missing URL, network error, non-
 * image response) just means the research step runs on search text alone,
 * same as before this existed.
 */
async function fetchThumbnailImage(url?: string): Promise<{ mimeType: string; data: Buffer }[]> {
  if (!url) return [];
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const contentType = res.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return [];
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return [];
    return [{ mimeType: contentType, data: buf }];
  } catch {
    return [];
  }
}

/**
 * Fires the moment a link is saved (POST /api/ideas, /api/capture,
 * /api/ideas/import, or a PATCH that adds a URL). Runs in the background
 * after the request has already responded: fetches oEmbed metadata for an
 * instant creator handle and title where available, then runs the AI web
 * research pass, saves the analysis, and links or creates the Creator
 * record. Always clears the `enriching` flag, even on failure, so the UI
 * never gets stuck.
 */
export async function enrichIdea(ideaId: string): Promise<void> {
  try {
    const idea = await prisma.idea.findUnique({ where: { id: ideaId } });
    if (!idea || !idea.url) {
      await prisma.idea.update({ where: { id: ideaId }, data: { enriching: false } }).catch(() => {});
      return;
    }

    const meta = await fetchLinkMeta(idea.url, idea.platform).catch(() => null);
    if (meta?.title && (!idea.title || /^(Instagram|TikTok|LinkedIn|YouTube|X|Threads|Substack|Web)\s/.test(idea.title))) {
      await prisma.idea.update({ where: { id: ideaId }, data: { title: meta.title.slice(0, 140) } }).catch(() => {});
    }

    const { idea: fresh, input, persona } = await loadIdeaInput(ideaId);
    // If comments have already been pasted by the time this runs, there is
    // nothing left to research; leave it for the normal Analyse button.
    if (fresh.sourceComments.trim() || fresh.ownComments.trim()) {
      await prisma.idea.update({ where: { id: ideaId }, data: { enriching: false } }).catch(() => {});
      return;
    }

    const images = await fetchThumbnailImage(meta?.thumbnailUrl);
    const analysis = await researchIdeaFromLink(persona, input, { authorHandle: meta?.authorHandle, caption: meta?.title }, images);

    let creatorId = fresh.creatorId;
    const rawHandle = meta?.authorHandle || analysis.creatorRead?.handle;
    if (!creatorId && rawHandle) {
      const handle = normHandle(rawHandle);
      const creator = await prisma.creator.upsert({
        where: { profileId_platform_handle: { profileId: fresh.profileId, platform: fresh.platform, handle } },
        create: {
          profileId: fresh.profileId,
          platform: fresh.platform,
          handle,
          niche: analysis.creatorRead?.niche || "",
          evidence: meta?.title ? `Caption/title: ${meta.title}` : "",
        },
        update: {},
      });
      creatorId = creator.id;
    }

    await prisma.idea.update({
      where: { id: ideaId },
      data: {
        analysis: JSON.parse(JSON.stringify(analysis)),
        analysedAt: new Date(),
        pillar: fresh.pillar || analysis.angles?.[0]?.pillar || null,
        creatorId,
        enriching: false,
      },
    });
  } catch (e) {
    console.error("enrichIdea failed", ideaId, e);
    await prisma.idea.update({ where: { id: ideaId }, data: { enriching: false } }).catch(() => {});
  }
}
