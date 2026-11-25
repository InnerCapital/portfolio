// Finds a logo for a login URL's website. Pure helpers here; fetching lives in app/api/logo.
import { isIP } from "node:net";

const TWO_PART_TLDS = new Set(["co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "co.nz", "co.jp", "com.br"]);

/** Hostname from a login URL, or "" if it isn't a public-looking hostname. */
export function hostFrom(input: string): string {
  try {
    const u = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    const h = u.hostname.toLowerCase().replace(/\.$/, "");
    if (!h.includes(".") || isIP(h) || h.endsWith(".local") || h.endsWith(".internal") || h === "localhost") return "";
    if (!/^[a-z0-9.-]+$/.test(h)) return "";
    return h;
  } catch {
    return "";
  }
}

/** The registrable domain: app.attio.com -> attio.com, admin.example-dns.co.uk -> example-dns.co.uk. */
export function rootDomain(host: string): string {
  const parts = host.split(".");
  const lastTwo = parts.slice(-2).join(".");
  return TWO_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

/** Hosts to try, most specific first, without duplicates. */
export function candidateHosts(host: string): string[] {
  const root = rootDomain(host);
  return [...new Set([host, root, `www.${root}`])];
}

/** Picks the best icon href from a page's HTML: apple-touch-icon, then the largest sized icon, then any icon. */
export function iconFromHtml(html: string, base: string): string | null {
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
  type C = { href: string; score: number };
  const found: C[] = [];
  for (const tag of links) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (!/\bicon\b|apple-touch-icon/.test(rel)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? /\bhref\s*=\s*([^\s>]+)/i.exec(tag)?.[1];
    if (!href || href.startsWith("data:")) continue;
    const size = Number(/\bsizes\s*=\s*["']?(\d+)x\d+/i.exec(tag)?.[1] ?? 0);
    const score = (rel.includes("apple-touch-icon") ? 1000 : 0) + size + (/\.svg(\?|$)/i.test(href) ? 500 : 0);
    try {
      found.push({ href: new URL(href, base).toString(), score });
    } catch {
      /* ignore bad hrefs */
    }
  }
  found.sort((a, b) => b.score - a.score);
  return found[0]?.href ?? null;
}
