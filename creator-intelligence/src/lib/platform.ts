export function detectPlatform(url: string): string {
  const u = (url || "").toLowerCase();
  if (!u) return "";
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  if (u.includes("x.com") || u.includes("twitter.com")) return "X";
  if (u.includes("threads.net")) return "Threads";
  if (u.includes("substack.com")) return "Substack";
  return "Web";
}

/** Strip tracking parameters so the same post is recognised twice. */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.searchParams.delete("stkn");
    u.searchParams.delete("igsh");
    u.searchParams.delete("utm_source");
    u.searchParams.delete("utm_medium");
    u.searchParams.delete("utm_campaign");
    return u.toString();
  } catch {
    return url.trim();
  }
}

export function titleFromUrl(url: string): string {
  const p = detectPlatform(url);
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const kind = parts[0] === "reel" ? "Reel" : parts[0] === "p" ? "Post" : "Link";
    const id = parts[1] || parts[0] || "";
    return `${p} ${kind} ${id}`.trim();
  } catch {
    return p ? `${p} link` : "Link";
  }
}
