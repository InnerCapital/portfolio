import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildProfileContext } from "@/lib/intelligence";

export const maxDuration = 120;

/** Save the questionnaire answers and generate the brief the intelligence layer uses. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const answers = (body.answers && typeof body.answers === "object" ? body.answers : {}) as Record<string, string>;
  try {
    const p = await prisma.profile.update({ where: { id }, data: { answers } });
    const built = await buildProfileContext(p.name, answers);
    const updated = await prisma.profile.update({ where: { id }, data: { context: built.context, pillars: built.pillars } });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not build the profile" }, { status: 500 });
  }
}
