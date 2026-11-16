import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { weeklyPlan, type Analysis } from "@/lib/intelligence";
import { personaOf } from "@/lib/ideaInput";

export const maxDuration = 120;

/** Turn the bank into a plan for the week: what to make, from which idea, in which format. */
export async function POST() {
  const p = await activeProfile();
  try {
    const ideas = await prisma.idea.findMany({
      where: { profileId: p.id, status: { in: ["SPARK", "DEVELOPING"] } },
      orderBy: { updatedAt: "desc" },
      take: 40,
      include: { refinements: { select: { format: true } }, creator: { select: { handle: true } } },
    });
    if (!ideas.length) return NextResponse.json({ error: "Add some ideas first" }, { status: 400 });
    const recentPosts = await prisma.post.findMany({ where: { connection: { profileId: p.id } }, orderBy: { postedAt: "desc" }, take: 8, select: { caption: true, likeCount: true, commentsCount: true } });
    const plan = await weeklyPlan(
      personaOf(p),
      ideas.map((i) => {
        const a = i.analysis as unknown as Analysis | null;
        return { id: i.id, title: i.title, note: i.note, pillar: i.pillar, status: i.status, creator: i.creator?.handle || "", analysed: Boolean(a), themes: (a?.themes || []).map((t) => t.theme), angles: (a?.angles || []).map((g) => g.title), briefed: i.refinements.map((r) => r.format) };
      }),
      recentPosts.map((r) => `${r.caption.slice(0, 100)} (${r.likeCount} likes, ${r.commentsCount} comments)`),
    );
    await prisma.profile.update({ where: { id: p.id }, data: { plan: JSON.parse(JSON.stringify(plan)) } });
    return NextResponse.json(plan);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Plan failed" }, { status: 500 });
  }
}
