import { NextResponse } from "next/server";
import { activeProfile } from "@/lib/profile";
import { importNotionContentData } from "@/lib/measure";

// Pulls every Organic row from Maya Content Data; can be a large page set.
export const maxDuration = 120;

export async function POST() {
  try {
    const profile = await activeProfile();
    const result = await importNotionContentData(profile.id);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Import failed" }, { status: 500 });
  }
}
