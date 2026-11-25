import { requireUser } from "@/lib/guard";
import { hostFrom } from "@/lib/logo";
import { findLogo, type Logo } from "@/lib/logoFetch";

export const dynamic = "force-dynamic";

const cache = new Map<string, Logo | null>();

export async function GET(req: Request) {
  const user = await requireUser();
  if (!user) return new Response(null, { status: 401 });

  const host = hostFrom(new URL(req.url).searchParams.get("url") ?? "");
  if (!host) return new Response(null, { status: 400 });

  if (!cache.has(host)) cache.set(host, await findLogo(host));
  const logo = cache.get(host);
  if (!logo) return new Response(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  return new Response(logo.body, {
    headers: {
      "Content-Type": logo.type === "image/svg+xml" ? "image/svg+xml" : logo.type,
      "Cache-Control": "private, max-age=604800",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
