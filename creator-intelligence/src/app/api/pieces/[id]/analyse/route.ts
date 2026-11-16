import { NextResponse } from "next/server";
import { analysePiece } from "@/lib/measure";

// Scrapes the post's comments then runs the sentiment pass.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await analysePiece(id, { force: Boolean(body.force) });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result.analysis);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Comment analysis failed" }, { status: 500 });
  }
}
