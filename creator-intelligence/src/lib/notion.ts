/**
 * App-side Notion bridge (runtime, not the MCP used during development).
 *
 * Two directions, both opt-in and credit-free:
 *  - PULL  "Maya Content Data": import real, already-curated per-post metrics as
 *          ContentPieces so the measurement engine has real history without
 *          spending any Apify or AI credits. Only Organic rows (her own
 *          baseline rule) are imported.
 *  - PUSH  "Content System: Brand Maya": create a production-pipeline row from
 *          an idea/brief so it leaves the bank and enters her real workflow.
 *
 * Needs a Notion internal integration token (NOTION_TOKEN) and both databases
 * shared with that integration. Database ids default to the real ones and are
 * overridable by env. No numbers are ever invented: a pulled metric is exactly
 * what the Notion row holds.
 */
const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

// Real database ids discovered from the workspace; override via env if they move.
const CONTENT_DATA_DB = process.env.NOTION_CONTENT_DATA_DB || "";
const PIPELINE_DB = process.env.NOTION_PIPELINE_DB || "";

export function isConfigured(): boolean {
  return Boolean(process.env.NOTION_TOKEN);
}

function token(): string {
  const t = process.env.NOTION_TOKEN;
  if (!t) throw new Error("NOTION_TOKEN is not set");
  return t;
}

async function notion<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Notion-Version": VERSION,
      "content-type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((json as { message?: string }).message || `Notion API error ${res.status}`);
  }
  return json as T;
}

/* ------------------------------------------------------------------ */
/* Property readers (defensive: Notion shapes vary by type)            */
/* ------------------------------------------------------------------ */

type Prop = Record<string, unknown>;
function plainText(p: Prop | undefined): string {
  if (!p) return "";
  const arr = (p.title || p.rich_text) as { plain_text?: string }[] | undefined;
  if (Array.isArray(arr)) return arr.map((x) => x.plain_text || "").join("").trim();
  return "";
}
function selectName(p: Prop | undefined): string {
  const s = p?.select as { name?: string } | null | undefined;
  return s?.name || "";
}
function numberOf(p: Prop | undefined): number {
  const n = p?.number;
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}
/** Like numberOf but null when the property has no numeric value, so an absent
 * rate reads as unknown rather than a misleading 0. */
function numberOrNull(p: Prop | undefined): number | null {
  const n = p?.number;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}
function urlOf(p: Prop | undefined): string {
  return (p?.url as string) || "";
}
function dateStart(p: Prop | undefined): string {
  const d = p?.date as { start?: string } | null | undefined;
  return d?.start || "";
}

/* ------------------------------------------------------------------ */
/* PULL: Maya Content Data -> normalized rows                           */
/* ------------------------------------------------------------------ */

export interface ContentDataRow {
  pageId: string;
  title: string;
  platform: string;
  format: string;
  theme: string;
  postedAt: Date | null;
  likes: number;
  comments: number;
  saves: number;
  saveRate: number | null;
  views: number;
  followsFromPost: number;
  url: string;
}

interface NotionPage { id: string; properties: Record<string, Prop> }
interface QueryResp { results: NotionPage[]; has_more: boolean; next_cursor: string | null }

/** Every Organic row (her own baseline rule) from Maya Content Data. */
export async function fetchContentData(): Promise<ContentDataRow[]> {
  const rows: ContentDataRow[] = [];
  let cursor: string | undefined;
  do {
    const body: Record<string, unknown> = {
      filter: { property: "Class", select: { equals: "Organic" } },
      page_size: 100,
    };
    if (cursor) body.start_cursor = cursor;
    const resp = await notion<QueryResp>(`/databases/${CONTENT_DATA_DB}/query`, { method: "POST", body: JSON.stringify(body) });
    for (const page of resp.results) {
      const pr = page.properties;
      const ds = dateStart(pr["Date"]);
      rows.push({
        pageId: page.id,
        title: plainText(pr["Post"]),
        platform: selectName(pr["Platform"]),
        format: selectName(pr["Format"]),
        theme: selectName(pr["Theme"]),
        postedAt: ds ? new Date(ds) : null,
        likes: numberOf(pr["Likes"]),
        comments: numberOf(pr["Comments"]),
        saves: numberOf(pr["Saves"]),
        saveRate: numberOrNull(pr["Save rate %"]),
        views: numberOf(pr["Views or impressions"]),
        followsFromPost: numberOf(pr["Follows from post"]),
        url: urlOf(pr["Link"]),
      });
    }
    cursor = resp.has_more && resp.next_cursor ? resp.next_cursor : undefined;
  } while (cursor);
  return rows;
}

/* ------------------------------------------------------------------ */
/* PUSH: idea/brief -> Content System pipeline row                     */
/* ------------------------------------------------------------------ */

export interface PipelineInput {
  title: string;
  /** our platform string, e.g. "Instagram" / "TikTok" */
  platform: string;
  notes: string;
}

// Map our platform to the pipeline's Platform multi-select options.
function pipelinePlatform(platform: string): string[] {
  const p = platform.toLowerCase();
  if (p.includes("tiktok")) return ["TikTok"];
  if (p.includes("youtube")) return ["YouTube Shorts"];
  if (p.includes("instagram") || p.includes("reel")) return ["Reels"];
  return [];
}

/** Create a production row and return its Notion URL. Status/Priority are left
 * to the database defaults (Not started / Normal) so we never send an option
 * name the pipeline might have renamed. */
export async function createPipelineRow(input: PipelineInput): Promise<{ url: string; id: string }> {
  const platforms = pipelinePlatform(input.platform);
  const properties: Record<string, unknown> = {
    Video: { title: [{ text: { content: input.title.slice(0, 200) || "Untitled" } }] },
    Notes: { rich_text: [{ text: { content: input.notes.slice(0, 1900) } }] },
    Format: { select: { name: "9:16" } },
  };
  if (platforms.length) properties.Platform = { multi_select: platforms.map((name) => ({ name })) };
  const page = await notion<{ id: string; url: string }>(`/pages`, {
    method: "POST",
    body: JSON.stringify({ parent: { database_id: PIPELINE_DB }, properties }),
  });
  return { url: page.url, id: page.id };
}
