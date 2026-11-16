import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshToken, syncConnection } from "@/lib/instagram";
import { activeProfile } from "@/lib/profile";

export const maxDuration = 300;

export async function POST() {
  const p = await activeProfile();
  const conns = await prisma.socialConnection.findMany({ where: { platform: "instagram", profileId: p.id } });
  if (!conns.length) return NextResponse.json({ error: "No Instagram account connected" }, { status: 400 });
  const results = [];
  for (const c of conns) {
    try {
      if (c.expiresAt && c.expiresAt.getTime() - Date.now() < 1000 * 60 * 60 * 24 * 10) await refreshToken(c.id);
      results.push({ username: c.username, ...(await syncConnection(c.id)) });
    } catch (e) {
      results.push({ username: c.username, error: e instanceof Error ? e.message : "Sync failed" });
    }
  }
  return NextResponse.json(results);
}
