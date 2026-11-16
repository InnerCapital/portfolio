import { NextResponse } from "next/server";
import { activeProfile } from "@/lib/profile";
import { personaOf } from "@/lib/ideaInput";
import { groundingFor } from "@/lib/measure";
import { craftGrounding } from "@/lib/breakdown";
import { contentIdeas } from "@/lib/intelligence";

// Give Maya a short, ranked list of content ideas grounded in BOTH her real
// metrics (groundingFor) and what the video teardowns learned (craftGrounding).
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const profile = await activeProfile();
    const body = await req.json().catch(() => ({}));
    const platform = typeof body.platform === "string" ? body.platform : undefined;

    const [metrics, craft] = await Promise.all([groundingFor(profile.id), craftGrounding(profile.id)]);
    const grounding = `${metrics}\n\n${craft}`;
    const result = await contentIdeas(personaOf(profile), grounding, platform);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not generate ideas" }, { status: 500 });
  }
}
