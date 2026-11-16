/**
 * Instagram API with Instagram Login (Meta).
 * Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login
 *
 * Requires a Meta developer app with the "Instagram" product added, and the
 * account being connected must be an Instagram Business or Creator account.
 * Scopes used: instagram_business_basic, instagram_business_manage_comments.
 */
import { prisma } from "./prisma";

const GRAPH = "https://graph.instagram.com/v21.0";
const SCOPES = ["instagram_business_basic", "instagram_business_manage_comments"];

export function redirectUri(): string {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return `${base}/api/instagram/callback`;
}

export function isConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_APP_ID && process.env.INSTAGRAM_APP_SECRET && process.env.APP_URL);
}

export function authorizeUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID || "",
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(","),
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p.toString()}`;
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set("access_token", token);
  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `Instagram API error ${res.status}`);
  }
  return json as T;
}

/** Exchange the OAuth code for a long-lived token and store the connection. */
export async function completeConnection(code: string, profileId: string) {
  const form = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID || "",
    client_secret: process.env.INSTAGRAM_APP_SECRET || "",
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
  const short = await shortRes.json();
  if (!shortRes.ok || !short.access_token) {
    throw new Error(short.error_message || short.error?.message || "Token exchange failed");
  }

  const longUrl = new URL(`${GRAPH.replace(/\/v[\d.]+$/, "")}/access_token`);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", process.env.INSTAGRAM_APP_SECRET || "");
  longUrl.searchParams.set("access_token", short.access_token);
  const longRes = await fetch(longUrl);
  const long = await longRes.json();
  const token: string = long.access_token || short.access_token;
  const expiresAt = long.expires_in ? new Date(Date.now() + long.expires_in * 1000) : null;

  const me = await graph<{ id: string; user_id?: string; username: string }>("me", token, { fields: "id,user_id,username" });
  const accountId = String(me.user_id || me.id);

  return prisma.socialConnection.upsert({
    where: { platform_accountId: { platform: "instagram", accountId } },
    create: { profileId, platform: "instagram", accountId, username: me.username, accessToken: token, expiresAt },
    update: { profileId, username: me.username, accessToken: token, expiresAt },
  });
}

/** Refresh a long-lived token (valid 60 days, refreshable after 24h). */
export async function refreshToken(connectionId: string) {
  const c = await prisma.socialConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", c.accessToken);
  const res = await fetch(url);
  const json = await res.json();
  if (json.access_token) {
    await prisma.socialConnection.update({
      where: { id: c.id },
      data: { accessToken: json.access_token, expiresAt: new Date(Date.now() + (json.expires_in || 5184000) * 1000) },
    });
  }
}

interface Media {
  id: string;
  caption?: string;
  media_type?: string;
  permalink?: string;
  thumbnail_url?: string;
  media_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}
interface IgComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  like_count?: number;
  replies?: { data: IgComment[] };
}

/** Pull recent posts and their comments into Postgres. */
export async function syncConnection(connectionId: string, maxPosts = 30) {
  const c = await prisma.socialConnection.findUniqueOrThrow({ where: { id: connectionId } });
  const media = await graph<{ data: Media[] }>("me/media", c.accessToken, {
    fields: "id,caption,media_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count",
    limit: String(maxPosts),
  });

  let commentCount = 0;
  for (const m of media.data || []) {
    await prisma.post.upsert({
      where: { id: m.id },
      create: {
        id: m.id,
        connectionId: c.id,
        caption: m.caption || "",
        mediaType: m.media_type || "",
        permalink: m.permalink || "",
        thumbnailUrl: m.thumbnail_url || (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url || "" : ""),
        postedAt: m.timestamp ? new Date(m.timestamp) : null,
        likeCount: m.like_count || 0,
        commentsCount: m.comments_count || 0,
      },
      update: {
        caption: m.caption || "",
        likeCount: m.like_count || 0,
        commentsCount: m.comments_count || 0,
        thumbnailUrl: m.thumbnail_url || (m.media_type === "IMAGE" || m.media_type === "CAROUSEL_ALBUM" ? m.media_url || "" : ""),
        syncedAt: new Date(),
      },
    });

    if (!m.comments_count) continue;
    let next: string | undefined = undefined;
    do {
      const params: Record<string, string> = {
        fields: "id,text,username,timestamp,like_count,replies{id,text,username,timestamp,like_count}",
        limit: "50",
      };
      if (next) params.after = next;
      const page: { data: IgComment[]; paging?: { cursors?: { after?: string }; next?: string } } = await graph(
        `${m.id}/comments`,
        c.accessToken,
        params,
      );
      for (const cm of page.data || []) {
        await upsertComment(cm, m.id, null);
        commentCount++;
        for (const r of cm.replies?.data || []) {
          await upsertComment(r, m.id, cm.id);
          commentCount++;
        }
      }
      next = page.paging?.next ? page.paging?.cursors?.after : undefined;
    } while (next);
  }

  await prisma.socialConnection.update({ where: { id: c.id }, data: { lastSyncAt: new Date() } });
  return { posts: media.data?.length || 0, comments: commentCount };
}

async function upsertComment(cm: IgComment, postId: string, parentId: string | null) {
  await prisma.comment.upsert({
    where: { id: cm.id },
    create: {
      id: cm.id,
      postId,
      parentId,
      username: cm.username || "",
      text: cm.text || "",
      likeCount: cm.like_count || 0,
      postedAt: cm.timestamp ? new Date(cm.timestamp) : null,
    },
    update: { text: cm.text || "", likeCount: cm.like_count || 0 },
  });
}
