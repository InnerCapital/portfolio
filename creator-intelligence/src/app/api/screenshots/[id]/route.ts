import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.screenshot.findUnique({ where: { id } });
  if (!s) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(s.data), { headers: { "Content-Type": s.mimeType, "Cache-Control": "private, max-age=86400" } });
}
