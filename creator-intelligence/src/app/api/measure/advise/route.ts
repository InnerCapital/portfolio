import { NextResponse } from "next/server";
import { activeProfile } from "@/lib/profile";
import { personaOf } from "@/lib/ideaInput";
import { benchmarkReport } from "@/lib/measure";
import { adviseGrowth } from "@/lib/intelligence";

export const maxDuration = 120;

export async function POST() {
  try {
    const profile = await activeProfile();
    const report = await benchmarkReport(profile.id);
    if (!report.self) {
      return NextResponse.json({ error: "Mark one creator as your own account first, then refresh its data." }, { status: 400 });
    }
    if ((report.self.baseline.n ?? 0) === 0) {
      return NextResponse.json({ error: "No posts scraped yet. Refresh your account first." }, { status: 400 });
    }
    const advice = await adviseGrowth(personaOf(profile), report);
    return NextResponse.json({ advice, report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Advice failed" }, { status: 500 });
  }
}
