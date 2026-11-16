import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanUrl, detectPlatform, titleFromUrl } from "@/lib/platform";
import { enrichIdea } from "@/lib/enrich";

/**
 * Capture a link from a phone shortcut or any other tool.
 * POST /api/capture  { token, url, note? }   or   GET /api/capture?token=...&url=...
 * The token is the profile's capture token, shown on the Profile page.
 */
async function capture(tokenRaw: string, urlRaw: string, note: string) {
  // Shortcuts love to wrap values in quotes or trailing newlines; strip them so
  // a token that is right apart from stray whitespace still matches.
  const token = tokenRaw.trim().replace(/^["']|["']$/g, "");
  const url = urlRaw.trim().replace(/^["']|["']$/g, "");
  const profile = await prisma.profile.findUnique({ where: { apiToken: token } });
  if (!profile) return NextResponse.json({ error: "Bad token" }, { status: 401 });
  const clean = cleanUrl(url);
  if (!/^https?:\/\//i.test(clean)) return NextResponse.json({ error: "url required" }, { status: 400 });
  const existing = await prisma.idea.findFirst({ where: { profileId: profile.id, url: clean } });
  if (existing) {
    if (note) await prisma.idea.update({ where: { id: existing.id }, data: { note: existing.note ? `${existing.note}\n${note}` : note } });
    return NextResponse.json({ ok: true, id: existing.id, duplicate: true });
  }
  const idea = await prisma.idea.create({ data: { profileId: profile.id, url: clean, platform: detectPlatform(clean), title: titleFromUrl(clean), note, tags: ["captured"], enriching: true } });
  void enrichIdea(idea.id);
  return NextResponse.json({ ok: true, id: idea.id }, { status: 201 });
}

const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));

/**
 * iPhone Shortcuts send the shared link in wildly different shapes depending on
 * how the "Get Contents of URL" action is set up: a JSON field, a form field,
 * the raw request body (just the URL as text), or a query param. Read the token
 * and url from ALL of those so the shortcut works however it was built.
 */
export async function POST(req: Request) {
  const u = new URL(req.url);
  const ct = (req.headers.get("content-type") || "").toLowerCase();
  const raw = await req.text().catch(() => "");

  let bToken = "", bUrl = "", bNote = "";
  if (raw) {
    // JSON body: {token, url, note} (or the shortcut's own field names).
    if (ct.includes("json") || /^\s*[[{]/.test(raw)) {
      try {
        const j = JSON.parse(raw) as Record<string, unknown>;
        bToken = s(j.token); bUrl = s(j.url || j.link || j.URL); bNote = s(j.note || j.text);
      } catch { /* fall through to the other shapes */ }
    }
    // Form-encoded body: token=...&url=...
    if (ct.includes("x-www-form-urlencoded")) {
      const p = new URLSearchParams(raw);
      bToken = bToken || s(p.get("token")); bUrl = bUrl || s(p.get("url") || p.get("link")); bNote = bNote || s(p.get("note"));
    }
    // Raw body: the shortcut just posted the shared URL as plain text. Pull the
    // first http(s) link out of whatever it sent.
    if (!bUrl) { const m = raw.match(/https?:\/\/[^\s"'<>]+/i); if (m) bUrl = m[0]; }
  }

  const token = bToken || s(u.searchParams.get("token"));
  const url = bUrl || s(u.searchParams.get("url"));
  const note = bNote || s(u.searchParams.get("note"));
  return capture(token, url, note);
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  return capture(u.searchParams.get("token") || "", u.searchParams.get("url") || "", u.searchParams.get("note") || "");
}
