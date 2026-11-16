import { NextResponse } from "next/server";
import { refreshCreator } from "@/lib/measure";

// A full-year, three-platform scrape runs several Apify actors back to back,
// so give the request plenty of room.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  try {
    const result = await refreshCreator(id, { force: Boolean(body.force) });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Refresh failed" }, { status: 500 });
  }
}
