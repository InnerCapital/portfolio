/**
 * Video teardown persistence (Route A, Stage 1).
 *
 * Turns an Apify teardown (apify.ts `teardownVideos`) into a stored
 * `PieceBreakdown` row for a post. This stage saves the measured, structural
 * read only — hook, script structure, cut cadence, on-screen text, derived WPM,
 * and the raw payload. The six-area /10 SCORES are added in Stage 2 by a Claude
 * scoring step; `scores` stays null until then, so no number is ever invented.
 *
 * Performance numbers are NOT touched here: they live on ContentPiece/metrics so
 * there is one source of truth. A teardown only adds the qualitative layer.
 */
import { prisma } from "./prisma";
import { teardownVideos, type NormalizedBreakdown } from "./apify";
import { personaOf } from "./ideaInput";
import { scoreBreakdown, type BreakdownScoreCtx, type BreakdownScores, type Persona, type PieceCommentAnalysis } from "./intelligence";
import { pieceMetrics, verdictFor, percentileRank, platformBaselines, median, OUTLIER_LIKES, OUTLIER_VIEWS, type RawPiece } from "./metrics";
import { classifyHook, type HookType } from "./hooks";

/** Store (or refresh) the structural teardown for a post. Idempotent per piece. */
export async function saveBreakdown(pieceId: string, b: NormalizedBreakdown): Promise<void> {
  const data = {
    source: b.source,
    hookText: b.hookText,
    hookType: b.hookType,
    hookWhy: b.hookWhy,
    transcript: b.transcript,
    structure: (b.structure ?? undefined) as object | undefined,
    shots: (b.shots ?? undefined) as object | undefined,
    cutCount: b.cutCount,
    avgShotSeconds: b.avgShotSeconds,
    cutsPerMinute: b.cutsPerMinute,
    onScreenText: b.onScreenText as object,
    durationSeconds: b.durationSeconds,
    wpm: b.wpm,
    analysedAt: new Date(),
    analysing: false,
    raw: (b.raw ?? undefined) as object | undefined,
  };
  await prisma.pieceBreakdown.upsert({
    where: { pieceId },
    create: { pieceId, ...data },
    update: data,
  });
}

/** Does this post already have a stored teardown? Used to skip re-runs (the
 * actor costs money, so never tear a video down twice unless forced). */
export async function hasBreakdown(pieceId: string): Promise<boolean> {
  const row = await prisma.pieceBreakdown.findUnique({ where: { pieceId }, select: { analysedAt: true } });
  return Boolean(row?.analysedAt);
}

/**
 * Tear down one post now and store it. Marks the row `analysing` while the actor
 * runs so the UI can show progress and a second trigger is a no-op. Never throws
 * out of the caller: returns {ok,reason}. Cached — skips when already done
 * unless `force`.
 */
export async function teardownPiece(pieceId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; reason?: string }> {
  const piece = await prisma.contentPiece.findUnique({ where: { id: pieceId }, select: { id: true, url: true, platform: true } });
  if (!piece) return { ok: false, reason: "Post not found" };
  if (!piece.url) return { ok: false, reason: "Post has no URL to tear down" };
  if (!opts.force && (await hasBreakdown(pieceId))) return { ok: true };

  await prisma.pieceBreakdown.upsert({
    where: { pieceId },
    create: { pieceId, analysing: true },
    update: { analysing: true },
  });
  try {
    const [b] = await teardownVideos({ urls: [piece.url] }, 1);
    if (!b) {
      await prisma.pieceBreakdown.update({ where: { pieceId }, data: { analysing: false } }).catch(() => {});
      return { ok: false, reason: "The teardown actor returned nothing for this video" };
    }
    await saveBreakdown(pieceId, b);
    // Chain the six-panel scoring. Non-fatal: a scoring failure leaves scores
    // null (the UI handles that) but the teardown itself still succeeded.
    await scorePiece(pieceId, { force: true }).catch(() => {});
    return { ok: true };
  } catch (e) {
    await prisma.pieceBreakdown.update({ where: { pieceId }, data: { analysing: false } }).catch(() => {});
    return { ok: false, reason: e instanceof Error ? e.message : "Teardown failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Stage 2: six-panel /10 scoring on top of a stored teardown          */
/* ------------------------------------------------------------------ */

/** Per-platform follower resolver (local copy, as in pieceReads.ts, to avoid an
 * import cycle through measure.ts). */
function followerResolver(creator: { platform: string; followers: number | null; platformFollowers: unknown }): (platform: string) => number {
  const pf = (creator.platformFollowers as Record<string, number> | null) || {};
  return (platform: string): number => {
    const v = pf[platform];
    if (typeof v === "number" && v > 0) return v;
    if (platform === "Instagram" || platform === creator.platform) return creator.followers ?? 0;
    return 0;
  };
}

type ScorePieceRow = {
  id: string; url: string; platform: string; caption: string;
  postedAt: Date | null; likes: number; comments: number; views: number; shares: number;
};
function toRaw(p: ScorePieceRow): RawPiece {
  return { id: p.id, url: p.url, caption: p.caption, postedAt: p.postedAt, likes: p.likes, comments: p.comments, views: p.views, shares: p.shares };
}

/** A persona is required for voice; fall back to a neutral one when a creator
 * has no profile yet, rather than crash. */
function personaFor(creator: { name: string; isSelf: boolean; profile: { name: string; context: string; pillars: unknown } | null }): Persona {
  if (creator.profile) return personaOf(creator.profile);
  return { name: creator.name || "this creator", context: "No profile has been built for this creator yet.", pillars: { A: "Pillar A", B: "Pillar B", C: "Pillar C" } };
}

/**
 * Score a post's stored teardown across six panels and save the result. Builds
 * the PERFORMANCE grounding from the post's real, per-platform baseline (so the
 * performance /10 is deterministic, never modelled), then asks Claude to score
 * the five craft areas. Needs a teardown already stored; cached unless `force`.
 * Never throws out of the caller.
 */
export async function scorePiece(pieceId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; reason?: string; scores?: BreakdownScores }> {
  const bd = await prisma.pieceBreakdown.findUnique({ where: { pieceId }, select: { analysedAt: true, scoredAt: true } });
  if (!bd?.analysedAt) return { ok: false, reason: "No teardown to score yet. Tear the video down first." };
  if (!opts.force && bd.scoredAt) {
    const existing = await prisma.pieceBreakdown.findUnique({ where: { pieceId }, select: { scores: true } });
    return { ok: true, scores: (existing?.scores as BreakdownScores | null) ?? undefined };
  }

  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: {
      breakdown: true,
      creator: { include: { profile: true, pieces: { orderBy: { postedAt: "desc" } } } },
    },
  });
  if (!piece || !piece.breakdown) return { ok: false, reason: "Post or teardown not found" };

  const b = piece.breakdown;
  const creator = piece.creator;
  const followersFor = followerResolver(creator);
  const all = creator.pieces as unknown as ScorePieceRow[];
  const pb = platformBaselines(all.map((pp) => ({ ...toRaw(pp), platform: pp.platform })), followersFor);
  const grp = pb.get(piece.platform);
  const m = pieceMetrics(toRaw(piece as unknown as ScorePieceRow), followersFor(piece.platform));
  const base = grp?.baseline ?? { n: 0, median: 0, p25: 0, p75: 0, mean: 0, metric: "interactions" as const, evidenceQuality: "none" as const };
  const recorded = grp?.recorded ?? [];
  const v = verdictFor(m, base);
  const s = (piece.analysis as PieceCommentAnalysis | null) || null;

  const ctx: BreakdownScoreCtx = {
    platform: piece.platform,
    caption: piece.caption,
    hookText: b.hookText,
    hookType: b.hookType,
    hookWhy: b.hookWhy,
    transcript: b.transcript,
    onScreenText: Array.isArray(b.onScreenText) ? (b.onScreenText as string[]) : [],
    cutCount: b.cutCount,
    avgShotSeconds: b.avgShotSeconds,
    cutsPerMinute: b.cutsPerMinute,
    durationSeconds: b.durationSeconds,
    wpm: b.wpm,
    verdict: v.verdict,
    percentile: percentileRank(m, recorded, base.metric),
    vsMedianPct: Math.round(v.vsMedianPct),
    baselineN: base.n,
    baselineMetric: base.metric,
    engagementRate: m.engagementRate,
    interactions: m.interactions,
    sentiment: s && s.sampleSize > 0 ? { sampleSize: s.sampleSize, positiveShare: s.positiveShare } : null,
  };

  try {
    const scores = await scoreBreakdown(personaFor(creator), ctx);
    await prisma.pieceBreakdown.update({ where: { pieceId }, data: { scores: scores as object, scoredAt: new Date() } });
    return { ok: true, scores };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Scoring failed" };
  }
}

/* ------------------------------------------------------------------ */
/* Stage 3: full per-video breakdown view-model for the dedicated page */
/* ------------------------------------------------------------------ */

/** A shot on the timeline, normalised from the actor's raw shot list. Only
 * shots with real numeric timing are kept, so the cadence chart is never drawn
 * from data we do not have. */
export interface BreakdownShot {
  start: number;
  end: number;
  seconds: number;
  label: string;
  onScreen: string;
}
/** A script beat, normalised from the actor's `structure`. */
export interface BreakdownBeat {
  beat: string;
  start: number | null;
  end: number | null;
  description: string;
}
export interface BreakdownView {
  piece: {
    id: string; url: string; platform: string; shortcode: string; caption: string;
    mediaType: string; thumbnailUrl: string; postedAt: string | null;
    likes: number; comments: number; views: number; shares: number;
  };
  creator: { id: string; name: string; handle: string; isSelf: boolean };
  metrics: {
    interactions: number; engagementRate: number | null; recorded: boolean;
    percentile: number; verdict: string; vsMedianPct: number;
    baselineN: number; baselineMetric: string; followers: number | null;
  };
  teardown: {
    analysed: boolean; analysedAt: string | null; analysing: boolean;
    scored: boolean; scoredAt: string | null; source: string;
    hookText: string; hookType: string; hookWhy: string;
    transcript: string; wpm: number; onScreenText: string[];
    cutCount: number; avgShotSeconds: number; cutsPerMinute: number; durationSeconds: number;
    shots: BreakdownShot[];
    structure: BreakdownBeat[];
    scores: BreakdownScores | null;
  } | null;
}

/** Parse a timecode that may be a number of seconds or an "m:ss" / "h:mm:ss"
 * string. Returns null when it is neither, so nothing is invented. */
function parseTime(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v >= 0 ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
      const parts = s.split(":").map(Number);
      return parts.reduce((acc, p) => acc * 60 + p, 0);
    }
  }
  return null;
}
function firstStr(...vs: unknown[]): string {
  for (const v of vs) if (typeof v === "string" && v.trim()) return v.trim();
  return "";
}

/** Normalise the actor's raw shots into a timeline. Keeps only shots whose
 * start and end are both real times and form a positive span. */
function normaliseShots(raw: unknown): BreakdownShot[] {
  if (!Array.isArray(raw)) return [];
  const out: BreakdownShot[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const o = s as Record<string, unknown>;
    const start = parseTime(o.start ?? o.startTime ?? o.from);
    const end = parseTime(o.end ?? o.endTime ?? o.to);
    if (start === null || end === null || end <= start) continue;
    out.push({
      start,
      end,
      seconds: +(end - start).toFixed(2),
      label: firstStr(o.shot, o.scene, o.action, o.description).slice(0, 160),
      onScreen: firstStr(o.on_screen_text, o.onScreenText).slice(0, 160),
    });
  }
  return out.sort((a, b) => a.start - b.start).slice(0, 120);
}
function normaliseStructure(raw: unknown): BreakdownBeat[] {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).beats) ? (raw as Record<string, unknown>).beats as unknown[] : []);
  const out: BreakdownBeat[] = [];
  for (const b of arr) {
    if (!b || typeof b !== "object") continue;
    const o = b as Record<string, unknown>;
    const beat = firstStr(o.beat, o.label, o.name, o.section, o.title);
    const description = firstStr(o.description, o.detail, o.summary, o.text);
    if (!beat && !description) continue;
    out.push({ beat: beat || "Beat", start: parseTime(o.start), end: parseTime(o.end), description });
  }
  return out.slice(0, 24);
}

/**
 * Build the full view-model for the per-video breakdown page. Reuses the same
 * per-platform baseline and metrics the scorer uses, so the page shows exactly
 * the numbers the scorecard was grounded in. Scoped to the active profile by
 * the caller. Returns null when the post does not exist.
 */
export async function breakdownView(pieceId: string, profileId: string): Promise<BreakdownView | null> {
  const piece = await prisma.contentPiece.findFirst({
    where: { id: pieceId, creator: { profileId } },
    include: {
      breakdown: true,
      creator: { include: { profile: true, pieces: { orderBy: { postedAt: "desc" } } } },
    },
  });
  if (!piece) return null;

  const creator = piece.creator;
  const followersFor = followerResolver(creator);
  const all = creator.pieces as unknown as ScorePieceRow[];
  const pb = platformBaselines(all.map((pp) => ({ ...toRaw(pp), platform: pp.platform })), followersFor);
  const grp = pb.get(piece.platform);
  const m = pieceMetrics(toRaw(piece as unknown as ScorePieceRow), followersFor(piece.platform));
  const base = grp?.baseline ?? { n: 0, median: 0, p25: 0, p75: 0, mean: 0, metric: "interactions" as const, evidenceQuality: "none" as const };
  const recorded = grp?.recorded ?? [];
  const v = verdictFor(m, base);
  const followers = followersFor(piece.platform);

  const b = piece.breakdown;
  return {
    piece: {
      id: piece.id, url: piece.url, platform: piece.platform, shortcode: piece.shortcode,
      caption: piece.caption, mediaType: piece.mediaType, thumbnailUrl: piece.thumbnailUrl,
      postedAt: piece.postedAt ? piece.postedAt.toISOString() : null,
      likes: m.likes, comments: m.comments, views: m.views, shares: m.shares,
    },
    creator: { id: creator.id, name: creator.name || creator.handle, handle: creator.handle, isSelf: creator.isSelf },
    metrics: {
      interactions: m.interactions, engagementRate: m.engagementRate, recorded: m.recorded,
      percentile: percentileRank(m, recorded, base.metric), verdict: v.verdict, vsMedianPct: Math.round(v.vsMedianPct),
      baselineN: base.n, baselineMetric: base.metric, followers: followers > 0 ? followers : null,
    },
    teardown: !b ? null : {
      analysed: Boolean(b.analysedAt), analysedAt: b.analysedAt ? b.analysedAt.toISOString() : null, analysing: b.analysing,
      scored: Boolean(b.scoredAt && b.scores), scoredAt: b.scoredAt ? b.scoredAt.toISOString() : null, source: b.source,
      hookText: b.hookText, hookType: b.hookType, hookWhy: b.hookWhy,
      transcript: b.transcript, wpm: b.wpm, onScreenText: Array.isArray(b.onScreenText) ? (b.onScreenText as string[]) : [],
      cutCount: b.cutCount, avgShotSeconds: b.avgShotSeconds, cutsPerMinute: b.cutsPerMinute, durationSeconds: b.durationSeconds,
      shots: normaliseShots(b.shots),
      structure: normaliseStructure(b.structure),
      scores: (b.scores as BreakdownScores | null) ?? null,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Stage 4: batch "break down top N" + the breakdown Library            */
/* ------------------------------------------------------------------ */

const BATCH_TOP_N = Math.max(1, Number(process.env.BATCH_TOP_N || 6));
const BATCH_CONCURRENCY = Math.max(1, Number(process.env.BATCH_CONCURRENCY || 2));

/** Prisma `where` that matches the creator's video posts (TikTok, or a media
 * type that reads as video/reel/short). The teardown actor only works on video,
 * so batch and library both key off this. */
const videoWhere = {
  OR: [
    { platform: "TikTok" },
    { mediaType: { contains: "video", mode: "insensitive" as const } },
    { mediaType: { contains: "reel", mode: "insensitive" as const } },
    { mediaType: { contains: "short", mode: "insensitive" as const } },
  ],
};

/**
 * Tear down (and score) a creator's top N videos in the background. Picks the
 * highest-reach videos that have no teardown yet (by views, then likes), marks
 * each `analysing` at once so the UI shows progress immediately, then processes
 * them with bounded concurrency. Fire-and-forget: returns as soon as the work is
 * queued. Credit-controlled — only videos without a breakdown, capped at N,
 * unless `force`. teardownPiece chains the scoring and is idempotent.
 */
export async function teardownTop(creatorId: string, opts: { limit?: number; force?: boolean } = {}): Promise<{ queued: number }> {
  const limit = Math.min(Math.max(1, opts.limit ?? BATCH_TOP_N), 24);
  const pieces = await prisma.contentPiece.findMany({
    where: {
      creatorId,
      url: { not: "" },
      ...videoWhere,
      ...(opts.force ? {} : { breakdown: { is: null } }),
    },
    orderBy: [{ views: "desc" }, { likes: "desc" }],
    take: limit,
    select: { id: true },
  });
  if (!pieces.length) return { queued: 0 };

  // Mark every queued post analysing now, so the whole batch reads as in-flight
  // before the workers reach each one.
  await Promise.all(pieces.map((p) =>
    prisma.pieceBreakdown.upsert({ where: { pieceId: p.id }, create: { pieceId: p.id, analysing: true }, update: { analysing: true } }),
  ));

  const ids = pieces.map((p) => p.id);
  void (async () => {
    let i = 0;
    const worker = async () => {
      while (i < ids.length) {
        const id = ids[i++];
        try { await teardownPiece(id, { force: opts.force }); } catch { /* best-effort; row's analysing flag is cleared inside teardownPiece */ }
      }
    };
    try { await Promise.all(Array.from({ length: Math.min(BATCH_CONCURRENCY, ids.length) }, worker)); }
    catch (e) { console.error("teardownTop batch failed", creatorId, e); }
  })();

  return { queued: ids.length };
}

/** One row in the breakdown Library: a torn-down video with its scores and the
 * same real metrics the page is grounded in. */
export interface LibraryItem {
  id: string;
  platform: string;
  thumbnailUrl: string;
  caption: string;
  postedAt: string | null;
  creator: { id: string; name: string; handle: string; isSelf: boolean };
  analysing: boolean;
  scored: boolean;
  overall: number | null;
  panels: { area: string; score: number | null }[];
  performance: number | null;
  hookType: string;
  cutsPerMinute: number;
  durationSeconds: number;
  transcriptAvailable: boolean;
  verdict: string;
  percentile: number;
  likes: number;
  views: number;
  interactions: number;
  /** Canonical hook type (normalised from the actor's label + the hook words). */
  hookGroup: HookType;
}

/**
 * Every torn-down video across the profile's creators, each with its scores and
 * its real per-platform performance, for the sortable/filterable Library.
 * Reuses the same baselines as the scorer and the page, so a post's percentile
 * and verdict read identically wherever they appear.
 */
export async function breakdownLibrary(profileId: string): Promise<LibraryItem[]> {
  const creators = await prisma.creator.findMany({
    where: { profileId },
    include: {
      pieces: {
        orderBy: { postedAt: "desc" },
        include: { breakdown: { select: { analysedAt: true, analysing: true, scores: true, hookType: true, hookText: true, cutsPerMinute: true, durationSeconds: true } } },
      },
    },
  });

  const out: LibraryItem[] = [];
  for (const creator of creators) {
    const followersFor = followerResolver(creator);
    const all = creator.pieces as unknown as ScorePieceRow[];
    const pb = platformBaselines(all.map((pp) => ({ ...toRaw(pp), platform: pp.platform })), followersFor);
    for (const p of creator.pieces) {
      const bd = p.breakdown;
      if (!bd || (!bd.analysedAt && !bd.analysing)) continue; // only torn-down or in-flight videos
      const grp = pb.get(p.platform);
      const base = grp?.baseline ?? { n: 0, median: 0, p25: 0, p75: 0, mean: 0, metric: "interactions" as const, evidenceQuality: "none" as const };
      const m = pieceMetrics(toRaw(p as unknown as ScorePieceRow), followersFor(p.platform));
      const v = verdictFor(m, base);
      const sc = (bd.scores ?? null) as { overall?: number | null; panels?: { area: string; score: number | null }[]; performance?: { score: number | null } | null; transcriptAvailable?: boolean } | null;
      out.push({
        id: p.id,
        platform: p.platform,
        thumbnailUrl: p.thumbnailUrl,
        caption: p.caption,
        postedAt: p.postedAt ? p.postedAt.toISOString() : null,
        creator: { id: creator.id, name: creator.name || creator.handle, handle: creator.handle, isSelf: creator.isSelf },
        analysing: Boolean(bd.analysing && !bd.analysedAt),
        scored: Boolean(sc),
        overall: sc?.overall ?? null,
        panels: sc?.panels ?? [],
        performance: sc?.performance?.score ?? null,
        hookType: bd.hookType ?? "",
        cutsPerMinute: bd.cutsPerMinute ?? 0,
        durationSeconds: bd.durationSeconds ?? 0,
        transcriptAvailable: sc?.transcriptAvailable ?? false,
        verdict: v.verdict,
        percentile: percentileRank(m, grp?.recorded ?? [], base.metric),
        likes: m.likes,
        views: m.views,
        interactions: m.interactions,
        hookGroup: classifyHook(bd.hookType, bd.hookText),
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Idea generator: the "visual learning" grounding                      */
/* ------------------------------------------------------------------ */

/**
 * A compact text block of what the teardowns actually found — the visual half
 * of the idea generator's grounding, alongside the metric half (groundingFor).
 * Everything here is real: hook types that over-index on this account's best
 * posts, the cadence/length pattern of the winners vs the weak ones, the top
 * videos' own craft read, and the hook types behind the muses' outliers. No
 * numbers are invented; a thin library simply yields a short block that says so.
 */
export async function craftGrounding(profileId: string): Promise<string> {
  const items = (await breakdownLibrary(profileId)).filter((i) => i.scored && !i.analysing);
  if (items.length < 3) {
    return `VISUAL LEARNING (from torn-down videos): only ${items.length} video${items.length === 1 ? "" : "s"} torn down so far — too thin to read hook or cadence patterns. Tell ${""}them to "Break down my top videos" first; until then lean on the metrics and themes above.`;
  }
  const self = items.filter((i) => i.creator.isSelf);
  const muses = items.filter((i) => !i.creator.isSelf);
  const lines: string[] = ["VISUAL LEARNING (real, from the video teardowns — hook, cut cadence and craft the actor read from the footage):"];

  if (self.length >= 3) {
    const baseMed = median(self.map((i) => i.percentile));
    lines.push(`YOUR VIDEOS: ${self.length} scored. Your overall median is the ${baseMed}th percentile.`);
    // Hook over-index
    const groups = Array.from(new Set(self.map((i) => i.hookGroup)));
    const hookRows = groups
      .map((g) => {
        const xs = self.filter((i) => i.hookGroup === g);
        return { g, n: xs.length, med: median(xs.map((i) => i.percentile)) };
      })
      .filter((r) => r.n >= 2)
      .sort((a, b) => b.med - a.med);
    if (hookRows.length) {
      lines.push("HOOK TYPES THAT OVER-INDEX (median percentile of your posts using each):");
      for (const r of hookRows) lines.push(`- ${r.g}: ${r.n} videos, ${r.med}th pct (${r.med - baseMed >= 0 ? "+" : ""}${r.med - baseMed} vs your median).`);
    }
    // Cadence: winners vs weak
    const sorted = [...self].sort((a, b) => b.percentile - a.percentile);
    const third = Math.max(1, Math.floor(sorted.length / 3));
    const top = sorted.slice(0, third), weak = sorted.slice(-third);
    const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);
    lines.push(`CADENCE PATTERN: your top ${top.length} run ~${avg(top.map((i) => i.durationSeconds))}s at ~${avg(top.map((i) => i.cutsPerMinute))} cuts/min; your weakest ${weak.length} run ~${avg(weak.map((i) => i.durationSeconds))}s at ~${avg(weak.map((i) => i.cutsPerMinute))} cuts/min.`);
    // Top videos' craft read (one targeted query for the qualitative notes)
    const topIds = sorted.slice(0, 3).map((i) => i.id);
    const notes = await prisma.pieceBreakdown.findMany({ where: { pieceId: { in: topIds } }, select: { pieceId: true, hookText: true, scores: true } });
    const byId = new Map(notes.map((n) => [n.pieceId, n]));
    lines.push("YOUR TOP VIDEOS (what the teardown said worked):");
    for (const i of sorted.slice(0, 3)) {
      const n = byId.get(i.id);
      const sc = (n?.scores ?? null) as { headline?: string; panels?: { area: string; worked: string }[] } | null;
      const worked = sc?.panels?.map((p) => p.worked).filter(Boolean)[0] || sc?.headline || "";
      lines.push(`- [${i.overall ?? "–"}/10, ${i.hookGroup} hook, ${Math.round(i.durationSeconds)}s, ${i.cutsPerMinute} cuts/min, ${i.percentile}th pct] "${(n?.hookText || i.caption).slice(0, 90)}"${worked ? ` — ${worked.slice(0, 160)}` : ""}`);
    }
  } else {
    lines.push(`YOUR VIDEOS: only ${self.length} of yours torn down — too few to read your own hook pattern yet.`);
  }

  if (muses.length) {
    const museTop = [...muses].sort((a, b) => b.percentile - a.percentile).slice(0, 5);
    lines.push("MUSE OUTLIERS (proven patterns from creators she watches — borrow, don't copy):");
    for (const i of museTop) lines.push(`- ${i.creator.handle}: ${i.hookGroup} hook, ${i.overall ?? "–"}/10, ${i.cutsPerMinute} cuts/min, ${i.percentile}th pct — "${i.caption.slice(0, 80)}"`);
  }
  return lines.join("\n").slice(0, 4000);
}

const OUTLIER_MAX = Number(process.env.OUTLIER_MAX || 12);
const OUTLIER_CONCURRENCY = Math.max(1, Number(process.env.OUTLIER_CONCURRENCY || 3));

/**
 * After a muse (competitor) is scraped, automatically tear down its outlier
 * posts (10k+ likes or 500k+ views) so the user can see what made them work.
 * Credit-controlled: only outliers that have no breakdown yet, capped at
 * OUTLIER_MAX, bounded concurrency, best-effort (never throws out). teardownPiece
 * chains the six-panel scoring and is idempotent, so a re-refresh is cheap.
 */
export async function teardownMuseOutliers(creatorId: string): Promise<void> {
  try {
    const pieces = await prisma.contentPiece.findMany({
      where: {
        creatorId,
        url: { not: "" },
        breakdown: { is: null },
        OR: [{ likes: { gte: OUTLIER_LIKES } }, { views: { gte: OUTLIER_VIEWS } }],
      },
      orderBy: [{ likes: "desc" }, { views: "desc" }],
      take: OUTLIER_MAX,
      select: { id: true },
    });
    if (pieces.length === 0) return;
    let i = 0;
    const worker = async () => {
      while (i < pieces.length) {
        const p = pieces[i++];
        try { await teardownPiece(p.id, {}); } catch { /* best-effort */ }
      }
    };
    await Promise.all(Array.from({ length: Math.min(OUTLIER_CONCURRENCY, pieces.length) }, worker));
  } catch (e) {
    console.error("teardownMuseOutliers failed", creatorId, e);
  }
}
