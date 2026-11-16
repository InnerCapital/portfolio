/**
 * Cheap, no-AI metadata lookup for a freshly pasted link. Runs before the AI
 * research call so the creator handle and a real title/thumbnail show up
 * almost instantly, even if the AI research step is slow or fails.
 */
export interface LinkMeta {
  authorHandle?: string;
  title?: string;
  thumbnailUrl?: string;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await p;
  } finally {
    clearTimeout(t);
  }
}

async function resolveRedirect(url: string): Promise<string> {
  try {
    const res = await withTimeout(fetch(url, { method: "GET", redirect: "follow" }), 6000);
    return res.url || url;
  } catch {
    return url;
  }
}

async function tiktokMeta(url: string): Promise<LinkMeta | null> {
  try {
    let target = url;
    if (/vm\.tiktok\.com|vt\.tiktok\.com/i.test(url)) target = await resolveRedirect(url);
    const res = await withTimeout(fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(target)}`), 6000);
    if (!res.ok) return null;
    const j = (await res.json()) as { author_name?: string; author_url?: string; title?: string; thumbnail_url?: string };
    const fromUrl = j.author_url ? String(j.author_url).match(/@([\w.]+)/)?.[1] : undefined;
    const handle = fromUrl || (j.author_name ? j.author_name.replace(/^@/, "") : undefined);
    return {
      authorHandle: handle ? `@${handle}` : undefined,
      title: j.title || undefined,
      thumbnailUrl: j.thumbnail_url || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Instagram's Graph API oEmbed endpoint works for public posts using just an
 * app access token (appId|appSecret), no per-user login needed. It requires
 * the Instagram app to have the "oEmbed Read" product added; until that is
 * approved in Meta's dashboard this call fails quietly and falls through to
 * the AI research step, same as before.
 */
async function instagramMeta(url: string): Promise<LinkMeta | null> {
  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;
  if (!appId || !appSecret) return null;
  try {
    const token = `${appId}|${appSecret}`;
    const endpoint = `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(token)}&fields=author_name,title,thumbnail_url`;
    const res = await withTimeout(fetch(endpoint), 6000);
    if (!res.ok) return null;
    const j = (await res.json()) as { author_name?: string; title?: string; thumbnail_url?: string };
    const handle = j.author_name ? j.author_name.replace(/^@/, "") : undefined;
    return {
      authorHandle: handle ? `@${handle}` : undefined,
      title: j.title || undefined,
      thumbnailUrl: j.thumbnail_url || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * LinkedIn does not expose a public oEmbed endpoint that works without an
 * approved Meta app, so that falls through to null and relies on the AI
 * research step (which can still identify the creator via search).
 */
export async function fetchLinkMeta(url: string, platform: string): Promise<LinkMeta | null> {
  if (!url) return null;
  if (platform === "TikTok" || /tiktok\.com/i.test(url)) return tiktokMeta(url);
  if (platform === "Instagram" || /instagram\.com/i.test(url)) return instagramMeta(url);
  return null;
}
