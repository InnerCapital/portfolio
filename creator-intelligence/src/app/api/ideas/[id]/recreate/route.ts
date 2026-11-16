import { NextResponse } from "next/server";
import { recreateFromSaved } from "@/lib/savedVideo";

export const maxDuration = 120;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const recreation = await recreateFromSaved(id);
    return NextResponse.json({ ok: true, recreation });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Recreate failed" }, { status: 500 });
  }
}
