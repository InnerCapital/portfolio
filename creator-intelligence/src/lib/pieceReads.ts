/**
 * Per-post background reads. After a self-account refresh, we quietly generate
 * an honest read + one nuanced suggestion for each post that does not have a
 * fresh one. Mirrors the idea `enrich` pattern: fire-and-forget, never blocks
 * the request, never throws out of it, always clears the `reading` flag.
 *
 * Credit control: cheap model (inside readPiece), cached (one read per post
 * unless its scraped data is newer than the read), self account only, and a
 * small concurrency cap. Uses metrics.ts directly so there is no import cycle
 * with measure.ts (which fires this).
 */
import { prisma } from "./prisma";
import { personaOf } from "./ideaInput";
import { readPiece, type PieceReadCtx, type PieceCommentAnalysis } from "./intelligence";
import { pieceMetrics, verdictFor, percentileRank, platformBaselines, type PieceMetrics, type Baseline, type RawPiece } from "./metrics";

const CONCURRENCY = Math.max(1, Number(process.env.PIECE_READ_CONCURRENCY || 3));

type PieceRow = {
  id: string; platform: string; caption: string; transcript: string;
  postedAt: Date | null; likes: number; comments: number; views: number; shares: number;
  read: string; readAt: Date | null; scrapedAt: Date; analysis: unknown;
};

function toRaw(p: PieceRow): RawPiece {
  return { id: p.id, url: "", caption: p.caption, postedAt: p.postedAt, likes: p.likes, comments: p.comments, views: p.views, shares: p.shares };
}

function buildCtx(piece: PieceRow, m: PieceMetrics, recorded: PieceMetrics[], base: Baseline): PieceReadCtx {
  const v = verdictFor(m, base);
  const s = (piece.analysis as PieceCommentAnalysis | null) || null;
  return {
    platform: piece.platform,
    caption: piece.caption,
    transcript: piece.transcript,
    likes: piece.likes, comments: piece.comments, views: piece.views, shares: piece.shares,
    interactions: m.interactions,
    engagementRate: m.engagementRate,
    verdict: v.verdict,
    percentile: percentileRank(m, recorded, base.metric),
    vsMedianPct: Math.round(v.vsMedianPct),
    baselineN: base.n,
    baselineMetric: base.metric,
    baselineMedian: base.median,
    sentiment: s && s.sampleSize > 0 ? {
      sampleSize: s.sampleSize,
      positiveShare: s.positiveShare,
      topComments: (s.surfaced || []).slice(0, 3).map((x) => x.quote),
      themes: (s.themes || []).map((t) => t.theme),
    } : null,
  };
}

/** Is this piece's read missing or stale (its data scraped after the read)? */
function needsRead(p: { read: string; readAt: Date | null; scrapedAt: Date }): boolean {
  return !p.read || !p.readAt || p.readAt < p.scrapedAt;
}

/** Per-platform follower resolver (local copy to avoid an import cycle with
 * measure.ts, which fires this module). */
function followerResolver(creator: { platform: string; followers: number | null; platformFollowers: unknown }): (platform: string) => number {
  const pf = (creator.platformFollowers as Record<string, number> | null) || {};
  return (platform: string): number => {
    const v = pf[platform];
    if (typeof v === "number" && v > 0) return v;
    if (platform === "Instagram" || platform === creator.platform) return creator.followers ?? 0;
    return 0;
  };
}

/** Review one piece now and store the result. Used by the on-demand route. */
export async function reviewPiece(pieceId: string, opts: { force?: boolean } = {}): Promise<{ ok: boolean; reason?: string; read?: string; suggestion?: string }> {
  const piece = await prisma.contentPiece.findUnique({
    where: { id: pieceId },
    include: { creator: { include: { profile: true, pieces: { orderBy: { postedAt: "desc" } } } } },
  });
  if (!piece) return { ok: false, reason: "Post not found" };
  if (!opts.force && !needsRead(piece)) return { ok: true, read: piece.read, suggestion: piece.suggestion };

  const all = piece.creator.pieces as unknown as PieceRow[];
  const followersFor = followerResolver(piece.creator);
  const pb = platformBaselines(all.map((pp) => ({ ...toRaw(pp), platform: pp.platform })), followersFor);
  const grp = pb.get(piece.platform)!;
  const m = pieceMetrics(toRaw(piece as unknown as PieceRow), followersFor(piece.platform));
  const ctx = buildCtx(piece as unknown as PieceRow, m, grp.recorded, grp.baseline);

  await prisma.contentPiece.update({ where: { id: pieceId }, data: { reading: true } });
  try {
    const r = await readPiece(personaOf(piece.creator.profile), ctx);
    await prisma.contentPiece.update({ where: { id: pieceId }, data: { read: r.read, suggestion: r.suggestion, readAt: new Date(), reading: false } });
    return { ok: true, read: r.read, suggestion: r.suggestion };
  } catch (e) {
    await prisma.contentPiece.update({ where: { id: pieceId }, data: { reading: false } }).catch(() => {});
    return { ok: false, reason: e instanceof Error ? e.message : "Read failed" };
  }
}

/** Background pass over a self account's posts after a refresh. */
export async function reviewSelfPieces(creatorId: string): Promise<void> {
  try {
    const creator = await prisma.creator.findUnique({
      where: { id: creatorId },
      include: { profile: true, pieces: { orderBy: { postedAt: "desc" } } },
    });
    if (!creator || !creator.isSelf) return;

    const all = creator.pieces as unknown as PieceRow[];
    const pending = all.filter(needsRead);
    if (pending.length === 0) return;

    const followersFor = followerResolver(creator);
    const pb = platformBaselines(all.map((pp) => ({ ...toRaw(pp), platform: pp.platform })), followersFor);
    const persona = personaOf(creator.profile);

    await prisma.contentPiece.updateMany({ where: { id: { in: pending.map((p) => p.id) } }, data: { reading: true } });

    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const piece = pending[cursor++];
        const grp = pb.get(piece.platform);
        if (!grp) continue;
        const m = pieceMetrics(toRaw(piece), followersFor(piece.platform));
        try {
          const r = await readPiece(persona, buildCtx(piece, m, grp.recorded, grp.baseline));
          await prisma.contentPiece.update({ where: { id: piece.id }, data: { read: r.read, suggestion: r.suggestion, readAt: new Date(), reading: false } });
        } catch {
          await prisma.contentPiece.update({ where: { id: piece.id }, data: { reading: false } }).catch(() => {});
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker));
  } catch (e) {
    console.error("reviewSelfPieces failed", creatorId, e);
    await prisma.contentPiece.updateMany({ where: { creatorId, reading: true }, data: { reading: false } }).catch(() => {});
  }
}
