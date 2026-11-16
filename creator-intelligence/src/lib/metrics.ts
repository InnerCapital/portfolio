/**
 * Deterministic measurement. Every function here is pure arithmetic over real
 * scraped numbers: no network, no LLM, no estimation. This is what makes the
 * module honest. The LLM layer (intelligence.ts) is only ever handed the
 * output of these functions and asked to phrase it; it is never asked for a
 * number. Where the data is too thin to support a claim, these functions say
 * so (evidenceQuality) instead of returning a confident value.
 */

export interface PieceMetrics {
  id: string;
  url: string;
  caption: string;
  postedAt: string | null;
  likes: number;
  comments: number;
  views: number;
  shares: number;
  /** interactions / followers, or null when followers are unknown. */
  engagementRate: number | null;
  /** likes + comments + shares. Always real. */
  interactions: number;
  /** interactions / views, for video, or null. */
  viewEngagement: number | null;
  /**
   * False when the source gave views but no likes/comments (e.g. LinkedIn
   * impressions, TikTok views-only imports). Such a post has interactions of 0
   * not because it flopped but because engagement was never captured, so it is
   * shown but kept out of baselines and never scored as "under-performing".
   */
  recorded: boolean;
}

export type Verdict = "over" | "typical" | "under" | "insufficient";

export interface Baseline {
  n: number;
  /** Median of the chosen metric across the sample. */
  median: number;
  p25: number;
  p75: number;
  mean: number;
  metric: "engagementRate" | "interactions";
  evidenceQuality: EvidenceQuality;
}

export type EvidenceQuality = "none" | "thin" | "ok" | "strong";

export function evidenceQuality(n: number): EvidenceQuality {
  if (n <= 0) return "none";
  if (n < 5) return "thin";
  if (n < 15) return "ok";
  return "strong";
}

function num(xs: number[]): number[] {
  return xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
}

export function median(xs: number[]): number {
  const s = num(xs);
  if (!s.length) return 0;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Nearest-rank percentile value (0..100). */
export function quantile(xs: number[], q: number): number {
  const s = num(xs);
  if (!s.length) return 0;
  const idx = Math.min(s.length - 1, Math.max(0, Math.ceil((q / 100) * s.length) - 1));
  return s[idx];
}

export function mean(xs: number[]): number {
  const s = num(xs);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0;
}

export interface RawPiece {
  id: string;
  url: string;
  caption: string;
  postedAt: Date | null;
  likes: number;
  comments: number;
  views: number;
  shares: number;
}

/** One piece's metrics. followers<=0 means we honestly cannot give a rate.
 * Counts are clamped at 0: a corrupt negative like-count would otherwise drag
 * a baseline below zero. */
export function pieceMetrics(p: RawPiece, followers: number): PieceMetrics {
  const likes = Math.max(0, p.likes);
  const comments = Math.max(0, p.comments);
  const shares = Math.max(0, p.shares);
  const views = Math.max(0, p.views);
  const interactions = likes + comments + shares;
  return {
    id: p.id,
    url: p.url,
    caption: p.caption,
    postedAt: p.postedAt ? p.postedAt.toISOString() : null,
    likes,
    comments,
    views,
    shares,
    engagementRate: followers > 0 ? interactions / followers : null,
    interactions,
    viewEngagement: views > 0 ? interactions / views : null,
    recorded: !(interactions === 0 && views > 0),
  };
}

/**
 * Baseline for one creator from their own pieces. Uses engagement rate when
 * followers are known (comparable across creators), else falls back to raw
 * interactions (comparable only against the same creator) and labels which.
 */
export function baseline(pieces: PieceMetrics[]): Baseline {
  // Only posts whose engagement was actually captured count toward the
  // baseline. A views-only post (interactions 0) would otherwise deflate the
  // median and make real posts look worse than they are.
  const usable = pieces.filter((p) => p.recorded);
  const haveRate = usable.length > 0 && usable.every((p) => p.engagementRate !== null);
  const metric: Baseline["metric"] = haveRate ? "engagementRate" : "interactions";
  const xs = usable.map((p) => (metric === "engagementRate" ? (p.engagementRate ?? 0) : p.interactions));
  return {
    n: usable.length,
    median: median(xs),
    p25: quantile(xs, 25),
    p75: quantile(xs, 75),
    mean: mean(xs),
    metric,
    evidenceQuality: evidenceQuality(usable.length),
  };
}

/**
 * How one piece performed against its creator's own baseline. Thresholds are
 * the quartiles: at or above p75 is over-performing, at or below p25 is under.
 * Returns "insufficient" rather than guessing when the baseline is too thin.
 */
export function verdictFor(p: PieceMetrics, b: Baseline): { verdict: Verdict; value: number; vsMedianPct: number } {
  const value = b.metric === "engagementRate" ? (p.engagementRate ?? 0) : p.interactions;
  // A views-only post has no captured engagement to judge, so it is never
  // called over or under — only "insufficient".
  if (!p.recorded) return { verdict: "insufficient", value, vsMedianPct: 0 };
  const vsMedianPct = b.median > 0 ? ((value - b.median) / b.median) * 100 : 0;
  if (b.evidenceQuality === "none" || b.evidenceQuality === "thin" || b.n < 5) {
    return { verdict: "insufficient", value, vsMedianPct };
  }
  if (value >= b.p75) return { verdict: "over", value, vsMedianPct };
  if (value <= b.p25) return { verdict: "under", value, vsMedianPct };
  return { verdict: "typical", value, vsMedianPct };
}

/** Percentile rank of a piece within its creator's own set (0..100). */
export function percentileRank(p: PieceMetrics, all: PieceMetrics[], metric: Baseline["metric"]): number {
  const val = metric === "engagementRate" ? (p.engagementRate ?? 0) : p.interactions;
  const xs = all.map((x) => (metric === "engagementRate" ? (x.engagementRate ?? 0) : x.interactions));
  const below = xs.filter((x) => x < val).length;
  return xs.length ? Math.round((below / xs.length) * 100) : 0;
}

export interface CompetitorCompare {
  handle: string;
  n: number;
  theirMedianRate: number | null;
  ratioVsSelf: number | null;
  evidenceQuality: EvidenceQuality;
  note: string;
}

/**
 * Self vs a competitor, on engagement rate only (the only cross-creator-fair
 * metric, since it normalises for audience size). If either side lacks
 * follower data, we refuse to give a ratio and say why, rather than compare
 * raw interactions across different audience sizes (which would mislead).
 */
export function compareToCompetitor(
  selfMedianRate: number | null,
  competitorHandle: string,
  competitorPieces: PieceMetrics[],
): CompetitorCompare {
  const rates = competitorPieces.map((p) => p.engagementRate).filter((x): x is number => x !== null);
  const eq = evidenceQuality(rates.length);
  if (selfMedianRate === null || rates.length === 0) {
    return {
      handle: competitorHandle,
      n: rates.length,
      theirMedianRate: rates.length ? median(rates) : null,
      ratioVsSelf: null,
      evidenceQuality: eq,
      note:
        selfMedianRate === null
          ? "No follower count for your account yet, so a fair engagement-rate comparison is not possible."
          : "No follower-based engagement rate available for this competitor's posts.",
    };
  }
  const theirMedian = median(rates);
  return {
    handle: competitorHandle,
    n: rates.length,
    theirMedianRate: theirMedian,
    ratioVsSelf: theirMedian > 0 ? selfMedianRate / theirMedian : null,
    evidenceQuality: eq,
    note: eq === "thin" ? "Based on fewer than 5 of their posts, so treat as directional only." : "",
  };
}

export interface GrowthSignals {
  followerStart: number;
  followerEnd: number;
  followerDelta: number;
  followerPct: number | null;
  days: number;
  postsPerWeek: number | null;
  evidenceQuality: EvidenceQuality;
  note: string;
}

/** Follower trend from snapshots and posting cadence from post dates. Both
 * need real history: with one snapshot there is no trend, and we say so. */
export function growthSignals(
  snapshots: { followers: number; scrapedAt: Date }[],
  pieces: { postedAt: Date | null }[],
): GrowthSignals {
  const snaps = [...snapshots].sort((a, b) => a.scrapedAt.getTime() - b.scrapedAt.getTime());
  const dated = pieces.map((p) => p.postedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());

  let postsPerWeek: number | null = null;
  if (dated.length >= 2) {
    const spanDays = (dated[dated.length - 1].getTime() - dated[0].getTime()) / 86_400_000;
    postsPerWeek = spanDays > 0 ? +(dated.length / (spanDays / 7)).toFixed(1) : null;
  }

  if (snaps.length < 2) {
    return {
      followerStart: snaps[0]?.followers ?? 0,
      followerEnd: snaps[0]?.followers ?? 0,
      followerDelta: 0,
      followerPct: null,
      days: 0,
      postsPerWeek,
      evidenceQuality: "thin",
      note: "Only one follower snapshot so far. Follower growth needs at least two scrapes on different days; it will appear once there is history.",
    };
  }
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  const days = Math.max(0, (last.scrapedAt.getTime() - first.scrapedAt.getTime()) / 86_400_000);
  const delta = last.followers - first.followers;
  return {
    followerStart: first.followers,
    followerEnd: last.followers,
    followerDelta: delta,
    followerPct: first.followers > 0 ? +((delta / first.followers) * 100).toFixed(2) : null,
    days: +days.toFixed(1),
    postsPerWeek,
    evidenceQuality: evidenceQuality(snaps.length),
    note: "",
  };
}

/* ------------------------------------------------------------------ */
/* Theme-level benchmarking (deterministic)                            */
/* ------------------------------------------------------------------ */

export interface ThemedPiece {
  theme: string;
  engagementRate: number | null;
  interactions: number;
  saves: number;
  saveRate: number | null;
  follows: number;
}

export interface ThemeStat {
  theme: string;
  n: number;
  metric: "engagementRate" | "interactions";
  /** Median of the chosen metric for this theme's posts. */
  median: number;
  /** This theme's median vs the overall median of all themed posts, as a %. */
  indexPct: number;
  medianSaves: number;
  medianSaveRate: number | null;
  medianFollows: number;
  verdict: Verdict;
  evidenceQuality: EvidenceQuality;
}

export interface ThemeBenchmark {
  metric: "engagementRate" | "interactions";
  overallMedian: number;
  n: number;
  evidenceQuality: EvidenceQuality;
  themes: ThemeStat[];
}

/**
 * Ranks a creator's themes by how their posts actually performed. Pure: medians
 * and quartiles over real numbers only, no estimation. The metric choice mirrors
 * baseline() (engagement rate when every post has a follower-based rate, else
 * raw interactions, clearly labelled). A theme is only called over or under when
 * it has at least five posts; below that it is "insufficient", never guessed.
 */
export function themeBenchmark(pieces: ThemedPiece[]): ThemeBenchmark {
  const themed = pieces.filter((p) => p.theme && p.theme.trim());
  const haveRate = themed.length > 0 && themed.every((p) => p.engagementRate !== null);
  const metric: "engagementRate" | "interactions" = haveRate ? "engagementRate" : "interactions";
  const metricVal = (p: ThemedPiece) => (metric === "engagementRate" ? (p.engagementRate ?? 0) : p.interactions);

  const allVals = themed.map(metricVal);
  const overallMedian = median(allVals);
  const p25 = quantile(allVals, 25);
  const p75 = quantile(allVals, 75);

  const groups = new Map<string, ThemedPiece[]>();
  for (const p of themed) {
    const k = p.theme.trim();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }

  const themes: ThemeStat[] = [];
  for (const [theme, ps] of groups) {
    const med = median(ps.map(metricVal));
    const eq = evidenceQuality(ps.length);
    const rates = ps.map((p) => p.saveRate).filter((x): x is number => x !== null);
    let verdict: Verdict;
    if (ps.length < 5 || eq === "none" || eq === "thin") verdict = "insufficient";
    else if (med >= p75) verdict = "over";
    else if (med <= p25) verdict = "under";
    else verdict = "typical";
    themes.push({
      theme,
      n: ps.length,
      metric,
      median: med,
      indexPct: overallMedian > 0 ? Math.round(((med - overallMedian) / overallMedian) * 100) : 0,
      medianSaves: median(ps.map((p) => p.saves)),
      medianSaveRate: rates.length ? median(rates) : null,
      medianFollows: median(ps.map((p) => p.follows)),
      verdict,
      evidenceQuality: eq,
    });
  }
  themes.sort((a, b) => b.median - a.median);

  return { metric, overallMedian, n: themed.length, evidenceQuality: evidenceQuality(themed.length), themes };
}

/* ------------------------------------------------------------------ */
/* Per-platform baselines                                              */
/* ------------------------------------------------------------------ */

export interface PlatformBaseline {
  platform: string;
  /** This platform's follower count (0 when unknown → interactions baseline). */
  followers: number;
  baseline: Baseline;
  /** The recorded (scored) pieces on this platform, for percentile ranking. */
  recorded: PieceMetrics[];
  /** All pieces on this platform, recorded or not. */
  count: number;
}

/**
 * Groups a creator's pieces by platform and benchmarks each platform against
 * itself. A TikTok post is divided by the TikTok follower count, never the
 * Instagram one, so cross-platform audiences never pollute each other's
 * engagement rate or baseline. `followersFor` resolves the right audience per
 * platform (caller owns the per-platform follower data).
 */
export function platformBaselines(
  pieces: (RawPiece & { platform: string })[],
  followersFor: (platform: string) => number,
): Map<string, PlatformBaseline> {
  const groups = new Map<string, PieceMetrics[]>();
  for (const p of pieces) {
    const m = pieceMetrics(p, followersFor(p.platform));
    const arr = groups.get(p.platform) ?? [];
    arr.push(m);
    groups.set(p.platform, arr);
  }
  const out = new Map<string, PlatformBaseline>();
  for (const [platform, mlist] of groups) {
    out.set(platform, {
      platform,
      followers: followersFor(platform),
      baseline: baseline(mlist),
      recorded: mlist.filter((m) => m.recorded),
      count: mlist.length,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Outlier content: a muse's post worth auto-analysing                 */
/* ------------------------------------------------------------------ */

/** A post counts as an outlier at 10k+ likes OR 500k+ views (env-tunable). */
export const OUTLIER_LIKES = Number(process.env.OUTLIER_LIKES || 10000);
export const OUTLIER_VIEWS = Number(process.env.OUTLIER_VIEWS || 500000);
export function isOutlier(p: { likes: number; views: number }): boolean {
  return p.likes >= OUTLIER_LIKES || p.views >= OUTLIER_VIEWS;
}
