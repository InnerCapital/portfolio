import { NextResponse } from "next/server";
import { analyseSavedVideo } from "@/lib/savedVideo";

// Scrapes the post + runs the teardown, which the actor polls for; give it room.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const analysis = await analyseSavedVideo(id);
    return NextResponse.json({ ok: true, analysis });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Analysis failed" }, { status: 500 });
  }
}
