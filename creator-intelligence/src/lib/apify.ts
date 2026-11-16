/**
 * Apify is the single source of REAL performance numbers. Every metric the
 * measurement module reports (likes, comments, views, followers) comes from an
 * Apify dataset item produced by a real run, and we keep the run id as
 * provenance on each row. The LLM never estimates any of these.
 *
 * Credit control: runs are expensive, so nothing here fires on page load.
 * Callers refresh explicitly, and `scrapeCreator` is guarded by a freshness
 * window so a second refresh inside the window returns without spending Apify
 * credits. Actor ids and limits are env-configurable so they can be swapped
 * without a code change.
 *
 * Docs: https://docs.apify.com/api/v2 (run actor, get dataset items).
 */

const BASE = "https://api.apify.com/v2";

export interface NormalizedPiece {
  id: string;
  platform: string;
  url: string;
  shortcode: string;
  caption: string;
  mediaType: string;
  /** Cover/thumbnail image URL from the scrape (may be a time-limited CDN link). */
  thumbnailUrl: string;
  /** Spoken content where the scrape provides it (TikTok auto-captions). "" otherwise. */
  transcript: string;
  postedAt: Date | null;
  likes: number;
  comments: number;
  views: number;
  shares: number;
}

export interface NormalizedProfile {
  handle: string;
  platform: string;
  /** Display/screen name, e.g. "Maya Rivers". "" when not provided. */
  fullName: string;
  /** Profile picture URL (time-limited CDN link). "" when not provided. */
  avatarUrl: string;
  followers: number;
  following: number;
  postsCount: number;
  pieces: NormalizedPiece[];
  /** "apify:<actorId>:<runId>" — provenance stamped onto every row. */
  source: string;
}

export interface NormalizedComment {
  text: string;
  username: string;
  likes: number;
}

export function isConfigured(): boolean {
  return Boolean(process.env.APIFY_TOKEN);
}

function token(): string {
  const t = process.env.APIFY_TOKEN;
  if (!t) throw new Error("APIFY_TOKEN is not set");
  return t;
}

function n(v: unknown): number {
  const x = typeof v === "string" ? Number(v.replace(/[,\s]/g, "")) : Number(v);
  return Number.isFinite(x) ? Math.round(x) : 0;
}

function date(v: unknown): Date | null {
  if (!v) return null;
  let d: Date;
  if (typeof v === "number") {
    // Epoch unit varies by actor: TikTok gives seconds (~1.7e9), LinkedIn gives
    // milliseconds (~1.7e12). Multiplying ms by 1000 overflows into year 58815,
    // which Postgres rejects and which aborts the whole scrape — so detect it.
    d = new Date(v < 1e11 ? v * 1000 : v);
  } else {
    d = new Date(String(v));
  }
  if (isNaN(d.getTime())) return null;
  // Backstop: never hand Prisma an absurd date. Any social post sits well inside
  // this window, so anything outside it is corrupt data, not a real timestamp.
  const y = d.getUTCFullYear();
  if (y < 2000 || y > 2100) return null;
  return d;
}

/** First non-empty string from several possible fields (thumbnail lives under
 * different keys depending on the actor). */
function firstStr(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v) return v;
    if (Array.isArray(v) && typeof v[0] === "string" && v[0]) return v[0];
  }
  return "";
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await p; } finally { clearTimeout(t); }
}

/** Turn a WebVTT/SRT subtitle file into plain text: drop the header, cue
 * indices and timestamps, strip tags, and collapse the repeats that auto
 * captions produce. Never throws; returns "" on any problem. */
function parseSubtitles(raw: string): string {
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || /^WEBVTT/i.test(t) || /^\d+$/.test(t) || /-->/.test(t) || /^(NOTE|STYLE|REGION)/.test(t)) continue;
    const clean = t.replace(/<[^>]+>/g, "").trim();
    if (clean && clean !== out[out.length - 1]) out.push(clean);
  }
  return out.join(" ").slice(0, 8000);
}

async function fetchSubtitles(url: string): Promise<string> {
  try {
    const res = await withTimeout(fetch(url, { cache: "no-store" }), 6000);
    if (!res.ok) return "";
    return parseSubtitles(await res.text());
  } catch {
    return "";
  }
}

/**
 * Run an actor and return its dataset items. Uses the async run then polls,
 * so a slow scrape does not hang a request indefinitely; it gives up after
 * `maxWaitMs` and throws rather than returning partial, unlabelled data.
 */
async function runActor(actorId: string, input: unknown, maxWaitMs = 180_000): Promise<{ items: unknown[]; runId: string }> {
  const start = await fetch(`${BASE}/acts/${actorId}/runs?token=${token()}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const started = await start.json();
  if (!start.ok || !started?.data?.id) {
    throw new Error(started?.error?.message || `Apify run failed to start (${start.status})`);
  }
  const runId: string = started.data.id;
  const datasetId: string = started.data.defaultDatasetId;

  const began = Date.now();
  // Poll run status until it finishes or we hit the wait cap.
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(`${BASE}/actor-runs/${runId}?token=${token()}`);
    const j = await res.json();
    const status: string = j?.data?.status;
    if (status === "SUCCEEDED") break;
    if (status === "FAILED" || status === "ABORTED" || status === "TIMED-OUT") {
      throw new Error(`Apify run ${status.toLowerCase()}`);
    }
    if (Date.now() - began > maxWaitMs) throw new Error("Apify run timed out on our side");
  }

  const dres = await fetch(`${BASE}/datasets/${datasetId}/items?token=${token()}&clean=true&format=json`);
  if (!dres.ok) throw new Error(`Apify dataset fetch failed (${dres.status})`);
  const items = (await dres.json()) as unknown[];
  return { items: Array.isArray(items) ? items : [], runId };
}

/* ------------------------------------------------------------------ */
/* Instagram                                                           */
/* ------------------------------------------------------------------ */

const IG_PROFILE_ACTOR = process.env.APIFY_IG_PROFILE_ACTOR || "apify~instagram-profile-scraper";
const IG_POST_ACTOR = process.env.APIFY_IG_POST_ACTOR || "apify~instagram-scraper";
const IG_COMMENT_ACTOR = process.env.APIFY_IG_COMMENT_ACTOR || "apify~instagram-comment-scraper";

interface IgPost {
  id?: string; shortCode?: string; url?: string; type?: string; caption?: string;
  likesCount?: number; commentsCount?: number; videoViewCount?: number; videoPlayCount?: number;
  timestamp?: string;
  displayUrl?: string; thumbnailSrc?: string; images?: string[];
}
interface IgProfileItem {
  username?: string; fullName?: string; followersCount?: number; followsCount?: number; postsCount?: number;
  profilePicUrl?: string; profilePicUrlHD?: string;
  latestPosts?: IgPost[];
}

function mapIgPost(p: IgPost): NormalizedPiece {
  const shortcode = p.shortCode || (p.url ? p.url.match(/\/(?:p|reel|tv)\/([^/]+)/)?.[1] || "" : "");
  return {
    id: p.id || shortcode || p.url || "",
    platform: "Instagram",
    url: p.url || (shortcode ? `https://www.instagram.com/p/${shortcode}/` : ""),
    shortcode,
    caption: (p.caption || "").slice(0, 2000),
    mediaType: (p.type || "").toLowerCase(),
    thumbnailUrl: firstStr(p.displayUrl, p.thumbnailSrc, p.images),
    transcript: "", // Instagram profile scraper exposes no transcript; see the spec.
    postedAt: date(p.timestamp),
    likes: n(p.likesCount),
    comments: n(p.commentsCount),
    views: n(p.videoPlayCount ?? p.videoViewCount),
    shares: 0,
  };
}

async function scrapeInstagram(handle: string, limit: number): Promise<NormalizedProfile> {
  const username = handle.replace(/^@/, "").trim();

  // The profile scraper gives followers, avatar and name but only ~12 posts.
  const { items, runId } = await runActor(IG_PROFILE_ACTOR, { usernames: [username], resultsLimit: 12 });
  const prof = (items[0] || {}) as IgProfileItem;

  // The posts scraper gives the full year of posts with thumbnails + metrics.
  let pieces = (prof.latestPosts || []).map(mapIgPost).filter((x) => x.id);
  let postSource = "";
  try {
    const posts = await runActor(IG_POST_ACTOR, {
      directUrls: [`https://www.instagram.com/${username}/`],
      resultsType: "posts",
      resultsLimit: limit,
      addParentData: false,
    });
    const scraped = (posts.items as IgPost[]).map(mapIgPost).filter((x) => x.id);
    if (scraped.length) {
      // Prefer the posts scraper; keep any profile-scraper posts it missed.
      const seen = new Set(scraped.map((p) => p.id));
      pieces = [...scraped, ...pieces.filter((p) => !seen.has(p.id))];
      postSource = `+${IG_POST_ACTOR}:${posts.runId}`;
    }
  } catch {
    // Fall back to the profile scraper's ~12 posts if the posts run fails.
  }

  return {
    handle: `@${prof.username || username}`,
    platform: "Instagram",
    fullName: prof.fullName || "",
    avatarUrl: firstStr(prof.profilePicUrlHD, prof.profilePicUrl),
    followers: n(prof.followersCount),
    following: n(prof.followsCount),
    postsCount: n(prof.postsCount),
    pieces,
    source: `apify:${IG_PROFILE_ACTOR}:${runId}${postSource}`,
  };
}

/* ------------------------------------------------------------------ */
/* TikTok                                                              */
/* ------------------------------------------------------------------ */

const TT_ACTOR = process.env.APIFY_TIKTOK_ACTOR || "clockworks~tiktok-scraper";

interface TtItem {
  id?: string; webVideoUrl?: string; text?: string;
  diggCount?: number; commentCount?: number; playCount?: number; shareCount?: number; collectCount?: number;
  createTimeISO?: string; createTime?: number;
  covers?: string[]; cover?: string;
  videoMeta?: { coverUrl?: string; originalCoverUrl?: string; subtitleLinks?: { language?: string; downloadLink?: string }[] };
  authorMeta?: { name?: string; nickName?: string; avatar?: string; fans?: number; following?: number; video?: number };
}

function mapTtItem(t: TtItem): NormalizedPiece {
  return {
    id: t.id || t.webVideoUrl || "",
    platform: "TikTok",
    url: t.webVideoUrl || "",
    shortcode: t.id || "",
    caption: (t.text || "").slice(0, 2000),
    mediaType: "video",
    thumbnailUrl: firstStr(t.videoMeta?.coverUrl, t.videoMeta?.originalCoverUrl, t.cover, t.covers),
    transcript: "", // filled from subtitleLinks after the run, best-effort.
    postedAt: date(t.createTimeISO || t.createTime),
    likes: n(t.diggCount),
    comments: n(t.commentCount),
    views: n(t.playCount),
    shares: n(t.shareCount),
  };
}

/** The best subtitle download link for an item: English if present, else the
 * first available. Returns "" when the video has no auto-captions. */
function subtitleLink(t: TtItem): string {
  const links = t.videoMeta?.subtitleLinks || [];
  const en = links.find((s) => /^en/i.test(s.language || ""));
  return (en || links[0])?.downloadLink || "";
}

async function scrapeTiktok(handle: string, limit: number): Promise<NormalizedProfile> {
  const username = handle.replace(/^@/, "").trim();
  const { items, runId } = await runActor(TT_ACTOR, {
    profiles: [username],
    resultsPerPage: limit,
    shouldDownloadVideos: false,
    shouldDownloadCovers: false,
    shouldDownloadSubtitles: true,
  });
  const tts = items as TtItem[];
  const pieces = tts.map(mapTtItem).filter((x) => x.id);

  // Pull the auto-caption text for videos that have it (cheap: just fetching
  // TikTok's own subtitle files, no transcription service). Best-effort and
  // bounded, so a slow or missing subtitle never blocks the scrape.
  const byId = new Map(pieces.map((p) => [p.id, p]));
  await Promise.all(
    tts.map(async (t) => {
      const link = subtitleLink(t);
      const piece = byId.get(t.id || t.webVideoUrl || "");
      if (link && piece) piece.transcript = await fetchSubtitles(link);
    }),
  );

  const meta = tts.find((t) => t.authorMeta)?.authorMeta || {};
  return {
    handle: `@${meta.name || username}`,
    platform: "TikTok",
    fullName: meta.nickName || "",
    avatarUrl: meta.avatar || "",
    followers: n(meta.fans),
    following: n(meta.following),
    postsCount: n(meta.video),
    pieces,
    source: `apify:${TT_ACTOR}:${runId}`,
  };
}

/* ------------------------------------------------------------------ */
/* LinkedIn (best-effort)                                              */
/* ------------------------------------------------------------------ */

// apimaestro~linkedin-profile-posts is a "[No Cookies]" actor: it takes a bare
// vanity `username` and `total_posts` (auto-pagination), needs no li_at cookie,
// and returns posts nested under `data.posts[]` with counts under `stats`.
const LINKEDIN_ACTOR = process.env.APIFY_LINKEDIN_ACTOR || "apimaestro~linkedin-profile-posts";

/** Pull a bare LinkedIn vanity handle out of whatever the creator stored
 * (full URL, `linkedin.com/in/x`, or an already-bare handle). The actor wants
 * `satyanadella`, NOT `https://www.linkedin.com/in/satyanadella/`. */
function linkedinUsername(input: string): string {
  const s = (input || "").trim();
  const m = s.match(/linkedin\.com\/in\/([^/?#]+)/i);
  if (m) return decodeURIComponent(m[1]);
  // No `/in/` segment: strip any protocol/host and slashes, take the last part.
  const tail = s.replace(/^https?:\/\//i, "").replace(/\/+$/, "").split("/").pop() || s;
  return decodeURIComponent(tail.replace(/[?#].*$/, ""));
}

/** Read the first finite number found at any of `keys` on `obj`. */
function pickNum(obj: Record<string, unknown> | null | undefined, ...keys: string[]): number {
  if (!obj) return 0;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") {
      const parsed = n(v);
      if (parsed) return parsed;
    }
  }
  return 0;
}

type LiItem = Record<string, unknown>;

/** apimaestro returns `posted_at` as a string, an epoch, or an object like
 * `{date, timestamp, relative}`. Normalise to something `date()` understands. */
function liPostedAt(x: LiItem): Date | null {
  const p = x.posted_at ?? x.postedAt ?? x.date ?? x.publishedAt ?? x.time;
  if (p && typeof p === "object") {
    const o = p as Record<string, unknown>;
    return date(o.timestamp ?? o.date ?? o.datetime ?? o.iso);
  }
  return date(p);
}

function mapLiItem(x: LiItem): NormalizedPiece {
  const stats = (x.stats as Record<string, unknown>) || x;
  const author = (x.author as Record<string, unknown>) || {};
  const media = (x.media as Record<string, unknown>) || {};
  const url = firstStr(x.url, x.postUrl, x.link, x.share_url);
  // LinkedIn does not expose impressions publicly, so views are usually 0 here;
  // reactions + comments are the real interactions and feed the baseline.
  return {
    id: firstStr(x.urn, x.full_urn, x.id, url, (author as LiItem).urn),
    platform: "LinkedIn",
    url,
    shortcode: "",
    caption: firstStr(x.text, x.commentary, x.postText, x.content).slice(0, 2000),
    mediaType: "linkedin",
    thumbnailUrl: firstStr(media.thumbnail, media.url, x.imageUrl, x.thumbnail, x.image, x.images),
    transcript: "",
    postedAt: liPostedAt(x),
    likes: pickNum(stats, "total_reactions", "reactions", "reaction_count", "numLikes", "likeCount", "likes", "like"),
    comments: pickNum(stats, "comments", "total_comments", "comment_count", "numComments", "commentCount"),
    views: pickNum(stats, "views", "impressions", "numImpressions", "numViews"),
    shares: pickNum(stats, "reposts", "shares", "total_reposts", "repost_count", "shareCount", "numShares"),
  };
}

/** The actor pushes either one wrapper record (`{data:{posts:[...]}}`), a
 * `{posts:[...]}` record, or individual post records. Flatten all three. */
function liPosts(items: unknown[]): LiItem[] {
  const out: LiItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const nested = (o.data as Record<string, unknown>)?.posts ?? o.posts;
    if (Array.isArray(nested)) out.push(...(nested as LiItem[]));
    else out.push(o as LiItem);
  }
  return out;
}

/**
 * LinkedIn is best-effort (profiles with no public posts, or a changed handle,
 * legitimately return nothing). On any failure it returns an empty profile so a
 * refresh never breaks, and the caller surfaces that LinkedIn data is absent.
 */
async function scrapeLinkedin(profileUrlOrHandle: string, limit: number): Promise<NormalizedProfile> {
  const username = linkedinUsername(profileUrlOrHandle);
  const empty: NormalizedProfile = { handle: username, platform: "LinkedIn", fullName: "", avatarUrl: "", followers: 0, following: 0, postsCount: 0, pieces: [], source: "" };
  try {
    // total_posts drives auto-pagination; per-page limit is capped at 100.
    const input: Record<string, unknown> = { username, total_posts: Math.min(Math.max(1, limit), 300), page_number: 1, limit: 100 };
    const { items, runId } = await runActor(LINKEDIN_ACTOR, input);
    const seen = new Set<string>();
    const pieces = liPosts(items)
      .map(mapLiItem)
      .filter((x) => x.id && !seen.has(x.id) && seen.add(x.id));
    // Best-effort, but never silent: a 0-post run should leave a trace so we
    // can tell "profile has no public posts" from "we parsed the shape wrong".
    if (!pieces.length) console.warn(`LinkedIn scrape for "${username}" (run ${runId}) returned ${items.length} dataset item(s), 0 usable posts`);
    return { ...empty, pieces, source: pieces.length ? `apify:${LINKEDIN_ACTOR}:${runId}` : "" };
  } catch (e) {
    console.warn(`LinkedIn scrape for "${username}" failed:`, e instanceof Error ? e.message : e);
    return empty;
  }
}

/* ------------------------------------------------------------------ */
/* Public entry points                                                 */
/* ------------------------------------------------------------------ */

// Full year of posts by default (~6/week ≈ 300). Env-tunable.
const DEFAULT_LIMIT = Number(process.env.APIFY_POST_LIMIT || 300);

/** Scrape a creator's profile and recent posts. Platform-routed. */
export async function scrapeCreator(platform: string, handle: string, limit = DEFAULT_LIMIT): Promise<NormalizedProfile> {
  const pl = platform.toLowerCase();
  if (pl.includes("tiktok")) return scrapeTiktok(handle, limit);
  if (pl.includes("linkedin")) return scrapeLinkedin(handle, limit);
  if (pl.includes("instagram") || pl === "ig" || !pl) return scrapeInstagram(handle, limit);
  throw new Error(`Apify scraping is wired for Instagram, TikTok and LinkedIn only, not "${platform}"`);
}

interface IgCommentItem { text?: string; ownerUsername?: string; likesCount?: number }
interface TtCommentItem { text?: string; uniqueId?: string; uid?: string; diggCount?: number }

/** Scrape the comments on a single post. Used sparingly, per post, on demand. */
export async function scrapeComments(platform: string, postUrl: string, limit = Number(process.env.APIFY_COMMENT_LIMIT || 100)): Promise<NormalizedComment[]> {
  if (!postUrl) return [];
  const pl = platform.toLowerCase();
  if (pl.includes("tiktok")) {
    const { items } = await runActor(TT_ACTOR, { postURLs: [postUrl], commentsPerPost: limit, shouldDownloadVideos: false });
    return (items as TtCommentItem[])
      .filter((c) => c.text)
      .map((c) => ({ text: String(c.text), username: c.uniqueId || c.uid || "", likes: n(c.diggCount) }));
  }
  const { items } = await runActor(IG_COMMENT_ACTOR, { directUrls: [postUrl], resultsLimit: limit });
  return (items as IgCommentItem[])
    .filter((c) => c.text)
    .map((c) => ({ text: String(c.text), username: c.ownerUsername || "", likes: n(c.likesCount) }));
}

/* ------------------------------------------------------------------ */
/* Video teardown (Route A)                                            */
/* ------------------------------------------------------------------ */

// A per-video structural teardown: hook, script structure, cut cadence and
// on-screen text. The actor does the dissection on Apify's infra (no video
// download here). Env-swappable so we can move to a fallback actor (e.g.
// frameprobe~reel-teardown) without a code change. tubetext returns the numbers
// too, but we deliberately do NOT use them — performance stays sourced from our
// own scrape, so a teardown only adds the qualitative read.
const TEARDOWN_ACTOR = process.env.APIFY_TEARDOWN_ACTOR || "tubetext~video-breakdown-ai";

/** Our normalised teardown. `raw` keeps the full actor payload for backfill. */
export interface NormalizedBreakdown {
  url: string;
  hookText: string;
  hookType: string;
  hookWhy: string;
  transcript: string;
  structure: unknown;
  shots: unknown;
  cutCount: number;
  avgShotSeconds: number;
  cutsPerMinute: number;
  onScreenText: string[];
  durationSeconds: number;
  /** Derived by us: words ÷ duration. 0 when duration is unknown. */
  wpm: number;
  source: string;
  raw: unknown;
}

type TeardownItem = Record<string, unknown>;

/** The actor may push each breakdown as its own record, or wrap them under
 * `breakdowns` (array, or a JSON string). Flatten all three, defensively. */
function teardownItems(items: unknown[]): TeardownItem[] {
  const out: TeardownItem[] = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const b = o.breakdowns;
    if (Array.isArray(b)) { out.push(...(b as TeardownItem[])); continue; }
    if (typeof b === "string") {
      try {
        const parsed = JSON.parse(b);
        if (Array.isArray(parsed)) out.push(...(parsed as TeardownItem[]));
        else if (parsed && typeof parsed === "object") out.push(parsed as TeardownItem);
        continue;
      } catch { /* fall through and treat the record itself as the breakdown */ }
    }
    out.push(o as TeardownItem);
  }
  return out;
}

/** The spoken transcript: the actor's `transcript`, else joined from its
 * timestamped transcript entries. */
function teardownTranscript(x: TeardownItem): string {
  const t = firstStr(x.transcript);
  if (t) return t.slice(0, 20000);
  const tt = x.timestampedTranscript;
  if (Array.isArray(tt)) {
    return tt
      .map((e) => (e && typeof e === "object" ? firstStr((e as Record<string, unknown>).text, (e as Record<string, unknown>).spoken) : ""))
      .filter(Boolean)
      .join(" ")
      .slice(0, 20000);
  }
  return "";
}

/** On-screen text gathered from any top-level field plus each shot, de-duped. */
function teardownOnScreen(x: TeardownItem): string[] {
  const out: string[] = [];
  const push = (v: unknown) => { if (typeof v === "string" && v.trim()) out.push(v.trim()); };
  const top = x.onScreenText;
  if (Array.isArray(top)) top.forEach(push);
  else push(top);
  const shots = x.shots;
  if (Array.isArray(shots)) {
    for (const s of shots) {
      if (s && typeof s === "object") push((s as Record<string, unknown>).on_screen_text);
    }
  }
  return Array.from(new Set(out)).slice(0, 60);
}

function mapTeardown(x: TeardownItem, runId: string): NormalizedBreakdown {
  const hook = (x.hook as Record<string, unknown>) || {};
  const pacing = (x.pacing as Record<string, unknown>) || {};
  const transcript = teardownTranscript(x);
  const durationSeconds = pickNum(x, "durationSeconds", "duration");
  const words = transcript ? transcript.split(/\s+/).filter(Boolean).length : 0;
  return {
    url: firstStr(x.url, x.videoUrl, x.webVideoUrl),
    hookText: firstStr(hook.text, x.hookText).slice(0, 2000),
    hookType: firstStr(hook.type, x.hookType),
    hookWhy: firstStr(hook.why_it_works, hook.whyItWorks).slice(0, 2000),
    transcript,
    structure: x.structure ?? null,
    shots: x.shots ?? null,
    cutCount: pickNum(pacing, "cutCount", "cuts"),
    avgShotSeconds: pickNum(pacing, "avgShotSeconds", "averageShotSeconds"),
    cutsPerMinute: pickNum(pacing, "cutsPerMinute", "cutsPerMin"),
    onScreenText: teardownOnScreen(x),
    durationSeconds,
    wpm: durationSeconds > 0 ? Math.round((words / durationSeconds) * 60) : 0,
    source: `apify:${TEARDOWN_ACTOR}:${runId}`,
    raw: x,
  };
}

/**
 * Tear down one or more videos by URL (or from a scraper's dataset id). Returns
 * a normalised breakdown per video, keyed by url, for the caller to attach to
 * the matching ContentPiece. Best-effort and never silent: a 0-result run is
 * logged (the lesson from the LinkedIn actor), so an empty teardown can be told
 * from a parsing miss. Throws only if the actor run itself fails, so the caller
 * can surface it.
 */
export async function teardownVideos(
  opts: { urls?: string[]; datasetId?: string },
  limit = Number(process.env.APIFY_TEARDOWN_LIMIT || 10),
): Promise<NormalizedBreakdown[]> {
  const urls = (opts.urls || []).filter(Boolean);
  if (!urls.length && !opts.datasetId) return [];
  const input: Record<string, unknown> = {
    includeTranscript: true,
    outputLanguage: "English",
    maxVideosPerSource: limit,
  };
  if (urls.length) input.urls = urls;
  if (opts.datasetId) input.datasetId = opts.datasetId;

  const { items, runId } = await runActor(TEARDOWN_ACTOR, input);
  const seen = new Set<string>();
  const breakdowns = teardownItems(items)
    .map((x) => mapTeardown(x, runId))
    .filter((b) => b.url && !seen.has(b.url) && seen.add(b.url));
  if (!breakdowns.length) {
    console.warn(`Teardown (${TEARDOWN_ACTOR}, run ${runId}) returned ${items.length} dataset item(s), 0 usable breakdowns`);
  }
  return breakdowns;
}

/**
 * Scrape ONE post's real metrics (likes, comments, views, posted date, caption,
 * cover image) by its URL. Instagram-solid via the posts actor's directUrls;
 * best-effort on TikTok via postURLs. Returns null if nothing came back, so a
 * saved-video analysis can still show the teardown and comments without numbers.
 */
export async function scrapePost(platform: string, url: string): Promise<NormalizedPiece | null> {
  try {
    if (/tiktok/i.test(platform)) {
      const { items } = await runActor(TT_ACTOR, { postURLs: [url], resultsPerPage: 1, shouldDownloadVideos: false });
      const it = (items as TtItem[])[0];
      return it ? mapTtItem(it) : null;
    }
    const { items } = await runActor(IG_POST_ACTOR, { directUrls: [url], resultsType: "posts", resultsLimit: 1, addParentData: false });
    const it = (items as IgPost[])[0];
    return it ? mapIgPost(it) : null;
  } catch (e) {
    console.warn("scrapePost failed", platform, url, e);
    return null;
  }
}
