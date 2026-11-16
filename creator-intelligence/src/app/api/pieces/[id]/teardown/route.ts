import { NextResponse } from "next/server";
import { teardownPiece } from "@/lib/breakdown";
import { prisma } from "@/lib/prisma";

// Runs the Apify teardown actor for one post and stores the structural
// breakdown. The actor polls, so give it room.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await teardownPiece(id, { force: Boolean(body.force) });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // Return a compact summary of what was stored, so the caller can confirm the
    // teardown landed without a DB client. Numbers here are structural only;
    // performance stays on the post itself.
    const b = await prisma.pieceBreakdown.findUnique({
      where: { pieceId: id },
      select: {
        source: true, hookType: true, hookText: true, cutCount: true, cutsPerMinute: true,
        avgShotSeconds: true, durationSeconds: true, wpm: true, transcript: true,
        onScreenText: true, scores: true, scoredAt: true, analysedAt: true,
      },
    });
    const scores = (b?.scores ?? null) as {
      overall?: number | null;
      panels?: { area: string; score: number | null }[];
      performance?: { score: number | null; verdict: string } | null;
      headline?: string;
    } | null;
    return NextResponse.json({
      ok: true,
      source: b?.source ?? "",
      hookType: b?.hookType ?? "",
      hookPreview: (b?.hookText ?? "").slice(0, 160),
      cutCount: b?.cutCount ?? 0,
      cutsPerMinute: b?.cutsPerMinute ?? 0,
      avgShotSeconds: b?.avgShotSeconds ?? 0,
      durationSeconds: b?.durationSeconds ?? 0,
      wpm: b?.wpm ?? 0,
      transcriptChars: (b?.transcript ?? "").length,
      onScreenTextLines: Array.isArray(b?.onScreenText) ? b!.onScreenText.length : 0,
      scored: Boolean(b?.scoredAt),
      overall: scores?.overall ?? null,
      panels: scores?.panels?.map((p) => ({ area: p.area, score: p.score })) ?? [],
      performance: scores?.performance ? { score: scores.performance.score, verdict: scores.performance.verdict } : null,
      headline: scores?.headline ?? "",
      analysedAt: b?.analysedAt ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Teardown failed" }, { status: 500 });
  }
}
