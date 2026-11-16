import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { id } = await req.json();
  await prisma.socialConnection.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
