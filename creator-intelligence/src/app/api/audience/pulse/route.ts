import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audiencePulse } from "@/lib/intelligence";
import { activeProfile } from "@/lib/profile";
import { personaOf } from "@/lib/ideaInput";

export const maxDuration = 120;

export async function POST(req: Request) {
  const p = await activeProfile();
  const body = await req.json().catch(() => ({}));
  const take = Math.min(Number(body.posts) || 12, 30);
  try {
    const posts = await prisma.post.findMany({
      where: { connection: { profileId: p.id } },
      orderBy: { postedAt: "desc" },
      take,
      include: { comments: { orderBy: { likeCount: "desc" }, take: 60 } },
    });
    const withComments = posts.filter((x) => x.comments.length);
    if (!withComments.length) return NextResponse.json({ error: "No synced comments yet. Connect Instagram and sync first." }, { status: 400 });
    const pulse = await audiencePulse(personaOf(p), withComments.map((x) => ({ caption: x.caption, comments: x.comments.map((c) => `${c.username}: ${c.text}`) })));
    return NextResponse.json(pulse);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Pulse failed" }, { status: 500 });
  }
}
