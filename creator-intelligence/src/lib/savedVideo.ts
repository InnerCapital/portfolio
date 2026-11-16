import { prisma } from "./prisma";
import { loadIdeaInput } from "./ideaInput";
import { scrapePost, scrapeComments, teardownVideos } from "./apify";
import { readSavedVideo, recreateSavedVideo, type SavedVideoCtx, type Recreation } from "./intelligence";

/** The stored rich read of a saved video: real numbers, key comments, how it is
 * shot, a plain summary, and the frames we could get. Everything here is real
 * (scraped) except `read`, which is a plain-English summary grounded in it. */
export interface SavedVideoAnalysis {
  stats: { likes: number; comments: number; views: number; postedAt: string | null } | null;
  frames: string[];
  keyComments: { text: string; username: string; likes: number }[];
  read: { summary: string; craft: string; caveats: string[] };
  teardown: { hookText: string; hookType: string; cutCount: number; cutsPerMinute: number; durationSeconds: number; onScreenText: string[]; transcriptAvailable: boolean } | null;
  scrapedAt: string;
  caveats: string[];
}

/**
 * Pull everything we can about a saved video and store it on the idea: the
 * post's real numbers, its key comments, a structural teardown (how it is shot),
 * and a plain-English read. Each source is best-effort, so a missing scrape,
 * teardown or comment set never fails the whole run. Returns the stored read.
 */
export async function analyseSavedVideo(ideaId: string): Promise<SavedVideoAnalysis> {
  const base = await prisma.idea.findUnique({ where: { id: ideaId }, select: { url: true, platform: true, title: true } });
  if (!base?.url) throw new Error("This idea has no link to analyse.");
  const platform = base.platform || "Instagram";

  await prisma.idea.update({ where: { id: ideaId }, data: { videoAnalysing: true } }).catch(() => {});
  try {
    const { persona } = await loadIdeaInput(ideaId);

    const [post, comments, breakdowns] = await Promise.all([
      scrapePost(platform, base.url).catch(() => null),
      scrapeComments(platform, base.url).catch(() => []),
      teardownVideos({ urls: [base.url] }).catch(() => []),
    ]);

    const bd = breakdowns[0] || null;
    const transcriptAvailable = Boolean(bd?.transcript?.trim());
    const stats = post ? { likes: post.likes, comments: post.comments, views: post.views, postedAt: post.postedAt ? post.postedAt.toISOString() : null } : null;
    const frames = [post?.thumbnailUrl].filter((x): x is string => Boolean(x));
    const keyComments = [...comments].sort((a, b) => b.likes - a.likes).slice(0, 10).map((c) => ({ text: c.text, username: c.username, likes: c.likes }));

    const ctx: SavedVideoCtx = {
      caption: post?.caption || base.title || "",
      transcript: bd?.transcript || "",
      onScreenText: bd?.onScreenText || [],
      hookText: bd?.hookText || "",
      hookType: bd?.hookType || "",
      cutsPerMinute: bd?.cutsPerMinute || 0,
      cutCount: bd?.cutCount || 0,
      durationSeconds: bd?.durationSeconds || 0,
      stats,
      transcriptAvailable,
    };
    const read = await readSavedVideo(persona, ctx);

    const analysis: SavedVideoAnalysis = {
      stats,
      frames,
      keyComments,
      read,
      teardown: bd ? { hookText: bd.hookText, hookType: bd.hookType, cutCount: bd.cutCount, cutsPerMinute: bd.cutsPerMinute, durationSeconds: bd.durationSeconds, onScreenText: bd.onScreenText, transcriptAvailable } : null,
      scrapedAt: new Date().toISOString(),
      caveats: [
        ...(frames.length <= 1 ? ["Only the cover frame was available, so you see one still rather than every scene."] : []),
        ...(stats ? [] : ["Could not pull this post's numbers, so no likes or views are shown."]),
        ...(bd ? [] : ["The structural teardown did not run on this one, so 'how it's shot' is limited."]),
      ],
    };
    await prisma.idea.update({ where: { id: ideaId }, data: { videoAnalysis: analysis as object, videoAnalysedAt: new Date(), videoAnalysing: false } });
    return analysis;
  } catch (e) {
    await prisma.idea.update({ where: { id: ideaId }, data: { videoAnalysing: false } }).catch(() => {});
    throw e;
  }
}

/** Build the "how to recreate it in your voice" recipe from a stored analysis. */
export async function recreateFromSaved(ideaId: string): Promise<Recreation> {
  const row = await prisma.idea.findUnique({ where: { id: ideaId }, select: { videoAnalysis: true } });
  const va = row?.videoAnalysis as unknown as SavedVideoAnalysis | null;
  if (!va) throw new Error("Analyse the video first, then recreate it.");
  const { persona } = await loadIdeaInput(ideaId);

  const ctx: SavedVideoCtx = {
    caption: "",
    transcript: "",
    onScreenText: va.teardown?.onScreenText || [],
    hookText: va.teardown?.hookText || "",
    hookType: va.teardown?.hookType || "",
    cutsPerMinute: va.teardown?.cutsPerMinute || 0,
    cutCount: va.teardown?.cutCount || 0,
    durationSeconds: va.teardown?.durationSeconds || 0,
    stats: va.stats,
    transcriptAvailable: va.teardown?.transcriptAvailable || false,
  };
  const keyComments = va.keyComments.map((c) => `${c.username}: ${c.text}`);
  const rec = await recreateSavedVideo(persona, va.read, ctx, keyComments);
  await prisma.idea.update({ where: { id: ideaId }, data: { recreation: rec as object, recreatedAt: new Date() } });
  return rec;
}
