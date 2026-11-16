/**
 * The public origin this app is served from.
 *
 * Behind a reverse proxy (Railway, Fly, Vercel) `req.url` carries the internal
 * address the container was reached on — typically `http://localhost:3000` — so
 * building redirects from it sends users to an address only the proxy can reach.
 * Prefer the explicitly configured APP_URL, then the proxy's forwarded headers,
 * and only fall back to the request URL when running without a proxy.
 */
export function siteOrigin(req: Request): string {
  const configured = process.env.APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  // Forwarded headers may hold a comma-separated chain; the first entry is the client-facing hop.
  const first = (value: string | null) => value?.split(",")[0]?.trim() || "";

  const proto = first(req.headers.get("x-forwarded-proto")) || "https";
  const host =
    first(req.headers.get("x-forwarded-host")) ||
    first(req.headers.get("host")) ||
    new URL(req.url).host;

  return `${proto}://${host}`;
}
