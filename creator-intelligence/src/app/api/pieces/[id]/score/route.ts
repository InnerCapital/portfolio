import { NextResponse } from "next/server";
import { scorePiece } from "@/lib/breakdown";

// Runs the six-panel /10 scoring on an already-stored teardown. Cheap vs the
// actor (one Claude call), so it can be re-run while iterating without paying
// for another teardown. Needs a teardown already stored for the post.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await scorePiece(id, { force: Boolean(body.force) });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // Return a compact, self-verifying summary of what was stored.
    const s = result.scores;
    return NextResponse.json({
      ok: true,
      overall: s?.overall ?? null,
      transcriptAvailable: s?.transcriptAvailable ?? false,
      panels: (s?.panels ?? []).map((p) => ({ area: p.area, score: p.score })),
      performance: s?.performance ? { score: s.performance.score, verdict: s.performance.verdict } : null,
      headline: s?.headline ?? "",
      caveats: s?.caveats ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Scoring failed" }, { status: 500 });
  }
}
