/**
 * Orchestration for the measurement module. Ties the real scrape (apify.ts) to
 * storage, then hands stored numbers to the deterministic engine (metrics.ts).
 * The only place credits/Apify runs are spent, and they are guarded:
 *  - scraping is skipped if the creator was refreshed within MIN_REFRESH_HOURS
 *  - comment analysis is cached on the piece and only recomputed on demand
 */
import { prisma } from "./prisma";
import { scrapeCreator, scrapeComments, isConfigured as apifyReady } from "./apify";
import {
  pieceMetrics,
  baseline,
  verdictFor,
  percentileRank,
  compareToCompetitor,
  growthSignals,
  themeBenchmark,
  platformBaselines,
  type PieceMetrics,
  type RawPiece,
  type ThemedPiece,
  type ThemeBenchmark,
  type Baseline,
} from "./metrics";
import { analysePieceComments, type PieceCommentAnalysis } from "./intelligence";
import { fetchContentData, isConfigured as notionReady } from "./notion";
import { reviewSelfPieces } from "./pieceReads";
import { teardownMuseOutliers } from "./breakdown";

const MIN_REFRESH_HOURS = Number(process.env.MEASURE_MIN_REFRESH_HOURS || 12);

export { apifyReady, notionReady };

/* ------------------------------------------------------------------ */
/* Refresh: the only credit-spending path                              */
/* ------------------------------------------------------------------ */

export async function refreshCreator(creatorId: string, opts: { force?: boolean } = {}): Promise<{ scraped: boolean; pieces: number; followers: number; reason?: string }> {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  if (!apifyReady()) return { scraped: false, pieces: 0, followers: creator.followers ?? 0, reason: "APIFY_TOKEN is not set" };

  if (!opts.force && creator.lastScrapedAt) {
    const ageH = (Date.now() - creator.lastScrapedAt.getTime()) / 3_600_000;
    if (ageH < MIN_REFRESH_HOURS) {
      return { scraped: false, pieces: 0, followers: creator.followers ?? 0, reason: `Refreshed ${ageH.toFixed(1)}h ago; skipping to save credits (min ${MIN_REFRESH_HOURS}h). Use force to override.` };
    }
  }

  // One self account holds a year of posts across Instagram, TikTok and
  // LinkedIn; a competitor is a single platform. TikTok defaults to the IG
  // handle (same creator) until a separate one is set.
  const targets: { platform: string; handle: string }[] = creator.isSelf
    ? [
        { platform: "Instagram", handle: creator.handle },
        { platform: "TikTok", handle: creator.tiktokHandle || creator.handle },
        ...(creator.linkedinUrl ? [{ platform: "LinkedIn", handle: creator.linkedinUrl }] : []),
      ]
    : [{ platform: creator.platform || "Instagram", handle: creator.handle }];

  const platformFollowers: Record<string, number> = {};
  const sources: string[] = [];
  let igFollowers = creator.followers ?? 0;
  let igAvatar = creator.avatarUrl;
  let igName = creator.name;
  let igHandle = creator.handle;
  let total = 0;

  for (const t of targets) {
    let prof: Awaited<ReturnType<typeof scrapeCreator>>;
    try {
      // A muse pulls only a few recent posts (cheap, rotates to the newest
      // each run); your own account pulls the full set.
      prof = await scrapeCreator(t.platform, t.handle, creator.isSelf ? undefined : Number(process.env.MUSE_POST_LIMIT || 6));
    } catch (e) {
      // Instagram is the backbone; surface its failure. TikTok/LinkedIn are
      // best-effort and must never break the whole refresh.
      if (t.platform === "Instagram") throw e;
      continue;
    }
    platformFollowers[t.platform] = prof.followers;
    if (prof.source) sources.push(prof.source);
    if (t.platform === "Instagram") {
      igFollowers = prof.followers;
      igAvatar = prof.avatarUrl || igAvatar;
      igName = prof.fullName || igName;
      igHandle = prof.handle || igHandle;
    }

    for (const piece of prof.pieces) {
      const likes = Math.max(0, piece.likes); // clamp corrupt negative counts
      const interactions = likes + piece.comments + piece.shares;
      // Engagement uses THIS platform's followers, so a TikTok post is never
      // divided by the Instagram audience.
      const engagement = prof.followers > 0 ? interactions / prof.followers : 0;
      await prisma.contentPiece.upsert({
        where: { id: piece.id },
        create: {
          id: piece.id, creatorId: creator.id, platform: piece.platform, url: piece.url,
          shortcode: piece.shortcode, caption: piece.caption, mediaType: piece.mediaType,
          thumbnailUrl: piece.thumbnailUrl, transcript: piece.transcript, postedAt: piece.postedAt,
          likes, comments: piece.comments, views: piece.views, shares: piece.shares,
          engagement, source: prof.source, scrapedAt: new Date(),
        },
        update: {
          platform: piece.platform, url: piece.url, caption: piece.caption, mediaType: piece.mediaType,
          thumbnailUrl: piece.thumbnailUrl, transcript: piece.transcript, postedAt: piece.postedAt,
          likes, comments: piece.comments, views: piece.views, shares: piece.shares,
          engagement, source: prof.source, scrapedAt: new Date(),
        },
      });
    }
    total += prof.pieces.length;
  }

  // Snapshot tracks the Instagram follower count (the main growth signal).
  await prisma.creatorSnapshot.create({
    data: { creatorId: creator.id, followers: igFollowers, following: 0, postsCount: 0, source: sources[0] || "" },
  });
  await prisma.creator.update({
    where: { id: creator.id },
    data: {
      followers: igFollowers,
      lastScrapedAt: new Date(),
      handle: igHandle,
      avatarUrl: igAvatar,
      name: igName,
      platformFollowers,
      // Seed the TikTok handle from the IG handle on first self refresh.
      tiktokHandle: creator.tiktokHandle || (creator.isSelf ? creator.handle : ""),
    },
  });

  // Quietly read each of your own posts in the background (cheap, cached).
  if (creator.isSelf) void reviewSelfPieces(creator.id);
  // For a muse, auto-tear-down its outlier posts (10k+ likes or 500k+ views).
  else void teardownMuseOutliers(creator.id);

  return { scraped: true, pieces: total, followers: igFollowers };
}

/**
 * Re-point TikTok to a corrected handle: PURGE this creator's existing TikTok
 * pieces, then re-scrape TikTok ONLY for the current tiktokHandle. Used when the
 * stored TikTok handle was wrong (e.g. pulled a stranger's account), where a
 * plain refresh would leave the wrong posts behind (upsert never deletes) and
 * pollute the per-platform baseline. Deleting pieces cascades to their
 * breakdowns. Does NOT touch Instagram/LinkedIn, so it is a fraction of a full
 * Force refresh. Returns a summary. The caller owns the decision to spend.
 */
export async function retargetTiktok(creatorId: string): Promise<{ ok: boolean; reason?: string; handle?: string; deleted?: number; scraped?: number; followers?: number }> {
  const creator = await prisma.creator.findUniqueOrThrow({ where: { id: creatorId } });
  if (!apifyReady()) return { ok: false, reason: "APIFY_TOKEN is not set" };
  const handle = creator.tiktokHandle || creator.handle;
  if (!handle) return { ok: false, reason: "No TikTok handle set" };

  // 1) Purge the old TikTok pieces for this creator (cascades to breakdowns).
  const del = await prisma.contentPiece.deleteMany({ where: { creatorId, platform: "TikTok" } });

  // 2) Scrape TikTok only, upsert fresh. Best-effort: on failure, the purge
  //    already removed the bad data, so we report the failure rather than throw.
  let prof: Awaited<ReturnType<typeof scrapeCreator>>;
  try {
    prof = await scrapeCreator("TikTok", handle);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "TikTok scrape failed", deleted: del.count };
  }

  for (const piece of prof.pieces) {
    const likes = Math.max(0, piece.likes);
    const interactions = likes + piece.comments + piece.shares;
    const engagement = prof.followers > 0 ? interactions / prof.followers : 0;
    const data = {
      platform: piece.platform, url: piece.url, caption: piece.caption, mediaType: piece.mediaType,
      thumbnailUrl: piece.thumbnailUrl, transcript: piece.transcript, postedAt: piece.postedAt,
      likes, comments: piece.comments, views: piece.views, shares: piece.shares,
      engagement, source: prof.source, scrapedAt: new Date(),
    };
    await prisma.contentPiece.upsert({
      where: { id: piece.id },
      create: { id: piece.id, creatorId: creator.id, shortcode: piece.shortcode, ...data },
      update: data,
    });
  }

  // 3) Refresh just this platform's follower count on the creator.
  const pf = (creator.platformFollowers as Record<string, number> | null) || {};
  pf.TikTok = prof.followers;
  await prisma.creator.update({ where: { id: creatorId }, data: { platformFollowers: pf } });

  // Read the new posts in the background (cheap, cached).
  if (creator.isSelf) void reviewSelfPieces(creatorId);

  return { ok: true, handle, deleted: del.count, scraped: prof.pieces.length, followers: prof.followers };
}

/* ------------------------------------------------------------------ */
/* Measure: deterministic, no credits                                  */
/* ------------------------------------------------------------------ */

export interface PieceTeardown {
  scored: boolean;
  overall: number | null;
  panels: { area: string; score: number | null }[];
  performance: { score: number | null; verdict: string } | null;
  headline: string;
  caveats: string[];
  transcriptAvailable: boolean;
  hookType: string;
  hookPreview: string;
  cutsPerMinute: number;
  durationSeconds: number;
}

export interface MeasuredPiece {
  id: string;
  url: string;
  caption: string;
  platform: string;
  mediaType: string;
  thumbnailUrl: string;
  postedAt: string | null;
  likes: number;
  comments: number;
  views: number;
  shares: number;
  engagementRate: number | null;
  interactions: number;
  recorded: boolean;
  percentile: number;
  verdict: ReturnType<typeof verdictFor>["verdict"];
  vsMedianPct: number;
  sentiment: PieceCommentAnalysis | null;
  read: string;
  suggestion: string;
  reading: boolean;
  /** Stored video teardown (hook/cuts + six-panel scores), or null if none. */
  teardown: PieceTeardown | null;
}

/** One platform's own benchmark for a creator who posts on several. */
export interface PlatformMeasure {
  platform: string;
  followers: number | null;
  baseline: Baseline;
  /** Posts on this platform (recorded or views-only). */
  count: number;
  /** Posts actually scored (views-only ones excluded). */
  recordedCount: number;
}

export interface CreatorMeasure {
  creatorId: string;
  handle: string;
  name: string;
  avatarUrl: string;
  platform: string;
  isSelf: boolean;
  followers: number | null;
  lastScrapedAt: string | null;
  /** The primary platform's baseline (Instagram for self), for the header and
   * the cross-creator competitor comparison. */
  baseline: Baseline;
  /** Per-platform baselines, so each platform is judged against itself. */
  platforms: PlatformMeasure[];
  growth: ReturnType<typeof growthSignals>;
  pieces: MeasuredPiece[];
}

function toRaw(p: { id: string; url: string; caption: string; postedAt: Date | null; likes: number; comments: number; views: number; shares: number }): RawPiece {
  return { id: p.id, url: p.url, caption: p.caption, postedAt: p.postedAt, likes: p.likes, comments: p.comments, views: p.views, shares: p.shares };
}

/** Map an included PieceBreakdown row to the compact teardown the UI shows. */
function teardownOf(bd: { analysedAt: Date | null; scores: unknown; hookType: string; hookText: string; cutsPerMinute: number | null; durationSeconds: number | null } | null | undefined): PieceTeardown | null {
  if (!bd || !bd.analysedAt) return null;
  const sc = (bd.scores ?? null) as { overall?: number | null; panels?: { area: string; score: number | null }[]; performance?: { score: number | null; verdict: string } | null; headline?: string; caveats?: string[]; transcriptAvailable?: boolean } | null;
  return {
    scored: Boolean(sc),
    overall: sc?.overall ?? null,
    panels: sc?.panels ?? [],
    performance: sc?.performance ?? null,
    headline: sc?.headline ?? "",
    caveats: sc?.caveats ?? [],
    transcriptAvailable: sc?.transcriptAvailable ?? false,
    hookType: bd.hookType ?? "",
    hookPreview: (bd.hookText ?? "").slice(0, 160),
    cutsPerMinute: bd.cutsPerMinute ?? 0,
    durationSeconds: bd.durationSeconds ?? 0,
  };
}

export async function measureCreator(creatorId: string): Promise<CreatorMeasure> {
  const creator = await prisma.creator.findUniqueOrThrow({
    where: { id: creatorId },
    include: {
      pieces: {
        orderBy: { postedAt: "desc" },
        include: { breakdown: { select: { analysedAt: true, scores: true, hookType: true, hookText: true, cutsPerMinute: true, durationSeconds: true } } },
      },
      snapshots: { orderBy: { scrapedAt: "asc" } },
    },
  });
  const followersFor = platformFollowerResolver(creator);
  const pb = platformBaselines(
    creator.pieces.map((p) => ({ ...toRaw(p), platform: p.platform })),
    followersFor,
  );

  const pieces: MeasuredPiece[] = creator.pieces.map((p) => {
    const m = pieceMetrics(toRaw(p), followersFor(p.platform));
    const grp = pb.get(p.platform)!;
    const v = verdictFor(m, grp.baseline);
    return {
      id: p.id,
      url: p.url,
      caption: p.caption,
      platform: p.platform,
      mediaType: p.mediaType,
      thumbnailUrl: p.thumbnailUrl,
      postedAt: m.postedAt,
      likes: m.likes,
      comments: m.comments,
      views: m.views,
      shares: m.shares,
      engagementRate: m.engagementRate,
      interactions: m.interactions,
      recorded: m.recorded,
      percentile: percentileRank(m, grp.recorded, grp.baseline.metric),
      verdict: v.verdict,
      vsMedianPct: Math.round(v.vsMedianPct),
      sentiment: (p.analysis as unknown as PieceCommentAnalysis) || null,
      read: p.read,
      suggestion: p.suggestion,
      reading: p.reading,
      teardown: teardownOf(p.breakdown),
    };
  });

  const PLATFORM_ORDER = ["Instagram", "TikTok", "LinkedIn", "YouTube"];
  const platforms: PlatformMeasure[] = [...pb.values()]
    .sort((a, b) => ((PLATFORM_ORDER.indexOf(a.platform) + 1) || 99) - ((PLATFORM_ORDER.indexOf(b.platform) + 1) || 99))
    .map((g) => ({
      platform: g.platform,
      followers: g.followers > 0 ? g.followers : null,
      baseline: g.baseline,
      count: g.count,
      recordedCount: g.recorded.length,
    }));

  // Primary platform drives the header and the cross-creator comparison:
  // Instagram for the self account, else the creator's single platform.
  const primary = creator.isSelf ? (pb.has("Instagram") ? "Instagram" : platforms[0]?.platform) : creator.platform;
  const base = (primary && pb.get(primary)?.baseline) || baseline([]);

  return {
    creatorId: creator.id,
    handle: creator.handle,
    name: creator.name,
    avatarUrl: creator.avatarUrl,
    platform: creator.platform,
    isSelf: creator.isSelf,
    followers: creator.followers,
    lastScrapedAt: creator.lastScrapedAt ? creator.lastScrapedAt.toISOString() : null,
    baseline: base,
    platforms,
    growth: growthSignals(creator.snapshots.map((s) => ({ followers: s.followers, scrapedAt: s.scrapedAt })), creator.pieces),
    pieces,
  };
}

/** Resolves the right follower count for a platform from the creator's stored
 * per-platform follower map, falling back to the headline (Instagram) count
 * for Instagram / the creator's own platform, else 0 (→ interactions basis). */
export function platformFollowerResolver(creator: { platform: string; followers: number | null; platformFollowers: unknown }): (platform: string) => number {
  const pf = (creator.platformFollowers as Record<string, number> | null) || {};
  return (platform: string): number => {
    const v = pf[platform];
    if (typeof v === "number" && v > 0) return v;
    if (platform === "Instagram" || platform === creator.platform) return creator.followers ?? 0;
    return 0;
  };
}

/* ------------------------------------------------------------------ */
/* Benchmark report: self vs competitors, deterministic                */
/* ------------------------------------------------------------------ */

export interface BenchmarkReport {
  self: CreatorMeasure | null;
  competitors: { measure: CreatorMeasure; compare: ReturnType<typeof compareToCompetitor> }[];
  generatedAt: string;
}

export async function benchmarkReport(profileId: string): Promise<BenchmarkReport> {
  const creators = await prisma.creator.findMany({ where: { profileId }, select: { id: true, isSelf: true } });
  const selfRow = creators.find((c) => c.isSelf);
  const self = selfRow ? await measureCreator(selfRow.id) : null;
  const selfMedianRate =
    self && self.baseline.metric === "engagementRate" ? self.baseline.median : null;

  const competitors: BenchmarkReport["competitors"] = [];
  for (const c of creators.filter((x) => !x.isSelf)) {
    const m = await measureCreator(c.id);
    const metricsList = m.pieces.map((p) => ({ engagementRate: p.engagementRate } as PieceMetrics));
    competitors.push({ measure: m, compare: compareToCompetitor(selfMedianRate, m.handle, metricsList) });
  }

  return { self, competitors, generatedAt: new Date().toISOString() };
}

/* ------------------------------------------------------------------ */
/* Per-piece comment sentiment: scrape comments then cache analysis     */
/* ------------------------------------------------------------------ */

export async function analysePiece(pieceId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; reason?: string; analysis?: PieceCommentAnalysis }> {
  const piece = await prisma.contentPiece.findUniqueOrThrow({ where: { id: pieceId } });
  if (piece.analysis && !opts.force) {
    return { ok: true, analysis: piece.analysis as unknown as PieceCommentAnalysis };
  }
  if (piece.comments === 0) {
    const analysis = await analysePieceComments([]);
    await prisma.contentPiece.update({ where: { id: pieceId }, data: { analysis: analysis as object, analysedAt: new Date(), commentsScrapedAt: new Date() } });
    return { ok: true, analysis };
  }
  if (!apifyReady()) return { ok: false, reason: "APIFY_TOKEN is not set, so comments cannot be scraped." };

  const comments = await scrapeComments(piece.platform, piece.url);
  const analysis = await analysePieceComments(comments);
  await prisma.contentPiece.update({
    where: { id: pieceId },
    data: { analysis: analysis as object, analysedAt: new Date(), commentsScrapedAt: new Date() },
  });
  // Comments themselves are intentionally NOT stored: the analysis keeps the
  // real counts and the verified verbatim quotes, which is all we surface.
  return { ok: true, analysis };
}

/* ------------------------------------------------------------------ */
/* Idea <-> published result link                                      */
/* ------------------------------------------------------------------ */

export interface LinkablePiece {
  id: string; url: string; caption: string; platform: string;
  postedAt: string | null; likes: number; comments: number; views: number;
}

/** Your own scraped posts not yet attached to any idea, newest first, so one
 * can be picked as the published result of an idea. Only self pieces: you
 * would never attribute a competitor's post as your own result. */
export async function linkableSelfPieces(profileId: string, take = 50): Promise<LinkablePiece[]> {
  const self = await prisma.creator.findFirst({ where: { profileId, isSelf: true }, select: { id: true } });
  if (!self) return [];
  const pieces = await prisma.contentPiece.findMany({
    where: { creatorId: self.id, ideaId: null },
    orderBy: { postedAt: "desc" },
    take,
    select: { id: true, url: true, caption: true, platform: true, postedAt: true, likes: true, comments: true, views: true },
  });
  return pieces.map((p) => ({ ...p, postedAt: p.postedAt ? p.postedAt.toISOString() : null }));
}

/** The measured performance of the pieces published from one idea, each scored
 * against its own creator's baseline (the same deterministic engine the
 * Measure page uses, so an idea's result and the Measure view always agree). */
export async function measuredPiecesForIdea(ideaId: string): Promise<(MeasuredPiece & { handle: string; followers: number | null })[]> {
  const linked = await prisma.contentPiece.findMany({ where: { ideaId }, select: { id: true, creatorId: true } });
  if (linked.length === 0) return [];
  const byCreator = new Map<string, Set<string>>();
  for (const l of linked) {
    if (!byCreator.has(l.creatorId)) byCreator.set(l.creatorId, new Set());
    byCreator.get(l.creatorId)!.add(l.id);
  }
  const out: (MeasuredPiece & { handle: string; followers: number | null })[] = [];
  for (const [creatorId, ids] of byCreator) {
    const m = await measureCreator(creatorId);
    for (const piece of m.pieces) {
      if (ids.has(piece.id)) out.push({ ...piece, handle: m.handle, followers: m.followers });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Notion pull: Maya Content Data -> real ContentPieces (no credits)    */
/* ------------------------------------------------------------------ */

export async function importNotionContentData(profileId: string): Promise<{ ok: boolean; imported: number; reason?: string }> {
  if (!notionReady()) return { ok: false, imported: 0, reason: "NOTION_TOKEN is not set on the server." };
  const self = await prisma.creator.findFirst({ where: { profileId, isSelf: true } });
  if (!self) return { ok: false, imported: 0, reason: "Mark one creator as your own account on Measure first, then import." };

  const rows = await fetchContentData();
  let imported = 0;
  for (const r of rows) {
    const interactions = r.likes + r.comments; // saves are stored separately, not summed
    const engagement = self.followers && self.followers > 0 ? interactions / self.followers : 0;
    const id = `notion:${r.pageId}`;
    await prisma.contentPiece.upsert({
      where: { id },
      create: {
        id, creatorId: self.id, platform: r.platform, url: r.url, shortcode: "",
        caption: r.title, mediaType: r.format, postedAt: r.postedAt,
        likes: r.likes, comments: r.comments, views: r.views, shares: 0, saves: r.saves,
        theme: r.theme, saveRate: r.saveRate, follows: r.followsFromPost,
        engagement, source: "notion:content-data", scrapedAt: new Date(),
      },
      update: {
        platform: r.platform, url: r.url, caption: r.title, mediaType: r.format, postedAt: r.postedAt,
        likes: r.likes, comments: r.comments, views: r.views, saves: r.saves,
        theme: r.theme, saveRate: r.saveRate, follows: r.followsFromPost,
        engagement, source: "notion:content-data", scrapedAt: new Date(),
      },
    });
    imported++;
  }
  return { ok: true, imported };
}

/* ------------------------------------------------------------------ */
/* Theme breakdown: which themes over/under-index (deterministic)      */
/* ------------------------------------------------------------------ */

export async function themeBreakdown(profileId: string): Promise<ThemeBenchmark | null> {
  const self = await prisma.creator.findFirst({ where: { profileId, isSelf: true }, include: { pieces: true } });
  if (!self) return null;
  const followers = self.followers ?? 0;
  const themed: ThemedPiece[] = self.pieces.map((p) => {
    const interactions = p.likes + p.comments + p.shares;
    return {
      theme: p.theme,
      engagementRate: followers > 0 ? interactions / followers : null,
      interactions,
      saves: p.saves,
      saveRate: p.saveRate,
      follows: p.follows,
    };
  });
  return themeBenchmark(themed);
}

/** A compact, real "state of your numbers" summary used to ground the chat. */
export async function groundingFor(profileId: string): Promise<string> {
  const report = await benchmarkReport(profileId);
  const themes = await themeBreakdown(profileId);
  const lines: string[] = [];
  const self = report.self;
  if (self) {
    lines.push(`YOU: ${self.handle}${self.name ? ` (${self.name})` : ""}.`);
    for (const pl of self.platforms) {
      const med = pl.baseline.metric === "engagementRate" ? `${(pl.baseline.median * 100).toFixed(2)}% rate` : `${pl.baseline.median} interactions`;
      lines.push(`- ${pl.platform}: ${pl.followers ?? "?"} followers, ${pl.baseline.n} scored posts, median ${med} (${pl.baseline.evidenceQuality} data).`);
    }
    const recorded = self.pieces.filter((p) => p.recorded);
    const top = [...recorded].sort((a, b) => b.percentile - a.percentile).slice(0, 8);
    const bottom = [...recorded].sort((a, b) => a.percentile - b.percentile).slice(0, 6);
    if (top.length) {
      lines.push("TOP POSTS:");
      for (const p of top) lines.push(`- [${p.platform} ${p.verdict}, ${p.percentile}th] ${p.likes} likes${p.views ? `, ${p.views} views` : ""}: ${p.caption.slice(0, 120)}${p.read ? ` — ${p.read.slice(0, 160)}` : ""}`);
    }
    if (bottom.length) {
      lines.push("WEAK POSTS:");
      for (const p of bottom) lines.push(`- [${p.platform} ${p.verdict}, ${p.percentile}th] ${p.likes} likes: ${p.caption.slice(0, 120)}`);
    }
  }
  if (themes && themes.themes.length) {
    lines.push(`THEMES (median ${themes.metric === "engagementRate" ? "engagement rate" : "interactions"}, vs overall):`);
    for (const t of themes.themes) lines.push(`- ${t.theme}: ${t.n} posts, ${t.indexPct >= 0 ? "+" : ""}${t.indexPct}% vs overall (${t.verdict}).`);
  }
  if (report.competitors.length) {
    lines.push("MUSES:");
    for (const { measure, compare } of report.competitors) {
      const outliers = measure.pieces.filter((p) => p.likes >= 10000 || p.views >= 500000).length;
      lines.push(`- ${compare.handle}: ${measure.followers ?? "?"} followers${compare.theirMedianRate !== null ? `, median ${(compare.theirMedianRate * 100).toFixed(2)}% rate` : ""}${outliers ? `, ${outliers} outlier posts` : ""}.`);
    }
  }
  return lines.join("\n").slice(0, 8000);
}
