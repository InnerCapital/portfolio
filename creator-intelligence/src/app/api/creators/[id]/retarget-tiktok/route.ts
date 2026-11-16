import { NextResponse } from "next/server";
import { retargetTiktok } from "@/lib/measure";

// Purges this creator's TikTok pieces and re-scrapes TikTok only for the saved
// tiktokHandle. One actor run (TikTok), so well short of a full refresh.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = await retargetTiktok(id);
    if (!result.ok) return NextResponse.json({ error: result.reason, ...result }, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Retarget failed" }, { status: 500 });
  }
}
