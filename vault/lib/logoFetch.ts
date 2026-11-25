import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { candidateHosts, iconFromHtml } from "./logo";

const TIMEOUT_MS = 4000;
const MAX_BYTES = 512 * 1024;
export type Logo = { body: ArrayBuffer; type: string };

// Never let a login URL make the server fetch a private or local address.
function privateIp(ip: string): boolean {
  if (isIP(ip) === 6) return /^(::1|fc|fd|fe80|::ffff:(10|127|169\.254|192\.168)\.)/i.test(ip) || ip === "::";
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
async function publicHost(host: string): Promise<boolean> {
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateIp(a.address));
  } catch {
    return false;
  }
}

// Follows up to 4 redirects by hand, so each hop is checked against private addresses.
async function get(start: string): Promise<Response | null> {
  let url = start;
  try {
    for (let hop = 0; hop < 5; hop++) {
      const u = new URL(url);
      if (u.protocol !== "https:") return null;
      if (!/(^|\.)google\.com$/.test(u.hostname) && !(await publicHost(u.hostname))) return null;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "manual",
        headers: { "User-Agent": "Mozilla/5.0 (AH Vault logo lookup)", Accept: "text/html,image/*;q=0.9,*/*;q=0.5" },
      });
      const next = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && next) {
        url = new URL(next, url).toString();
        continue;
      }
      return res.ok ? Object.assign(res, { finalUrl: url }) : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function asImage(res: Response | null, minBytes = 120): Promise<Logo | null> {
  if (!res) return null;
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  if (!type.startsWith("image/")) return null;
  const body = await res.arrayBuffer();
  if (body.byteLength < minBytes || body.byteLength > MAX_BYTES) return null;
  return { body, type };
}

export async function findLogo(host: string): Promise<Logo | null> {
  const hosts = candidateHosts(host);
  // 1. The website's own icon: <link rel="icon"/"apple-touch-icon"> on its home page.
  for (const h of hosts) {
    const page = await get(`https://${h}/`);
    if (page && (page.headers.get("content-type") ?? "").includes("html")) {
      const html = (await page.text()).slice(0, 300_000);
      const href = iconFromHtml(html, (page as Response & { finalUrl?: string }).finalUrl ?? `https://${h}/`);
      const logo = href ? await asImage(await get(href)) : null;
      if (logo) return logo;
    }
    const ico = await asImage(await get(`https://${h}/favicon.ico`));
    if (ico) return ico;
  }
  // 2. Google's favicon service, which knows sites that block direct fetches. 404 means it has none.
  for (const h of hosts) {
    const logo = await asImage(await get(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=128`), 200);
    if (logo) return logo;
  }
  return null;
}

