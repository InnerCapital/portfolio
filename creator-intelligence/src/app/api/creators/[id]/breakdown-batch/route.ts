import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { teardownTop } from "@/lib/breakdown";

// Queues the creator's top N videos for teardown + scoring in the background
// and returns immediately. The heavy actor work runs after the response, so the
// request itself is short; the UI polls on the analysing flag.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const profile = await activeProfile();
    const creator = await prisma.creator.findFirst({ where: { id, profileId: profile.id }, select: { id: true } });
    if (!creator) return NextResponse.json({ error: "Creator not found." }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const limit = Number(body.limit) > 0 ? Number(body.limit) : undefined;
    const force = Boolean(body.force);

    const result = await teardownTop(creator.id, { limit, force });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Batch teardown failed" }, { status: 500 });
  }
}
