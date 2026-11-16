import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanUrl, detectPlatform, titleFromUrl } from "@/lib/platform";
import { activeProfile } from "@/lib/profile";
import { enrichIdea } from "@/lib/enrich";

/** Paste a block of links; one idea per link, skipping ones already in the bank. */
export async function POST(req: Request) {
  const p = await activeProfile();
  const body = await req.json().catch(() => ({}));
  const raw = String(body.text || "");
  const links = Array.from(new Set(raw.split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)).map(cleanUrl)));
  let created = 0;
  const skipped: string[] = [];
  for (const url of links) {
    const exists = await prisma.idea.findFirst({ where: { url, profileId: p.id } });
    if (exists) { skipped.push(url); continue; }
    const idea = await prisma.idea.create({ data: { profileId: p.id, url, platform: detectPlatform(url), title: titleFromUrl(url), tags: ["imported"], enriching: true } });
    void enrichIdea(idea.id);
    created++;
  }
  return NextResponse.json({ created, skipped });
}
