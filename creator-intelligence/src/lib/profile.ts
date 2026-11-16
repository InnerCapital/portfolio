import { currentUser } from "./auth";
import { prisma } from "./prisma";

export type PillarMap = { A: string; B: string; C: string };

/** The signed-in user's profile. Routes behind the middleware can rely on it. */
export async function activeProfile() {
  const u = await currentUser();
  if (!u) throw new Error("Not signed in");
  return u.profile;
}

export async function profileById(id: string) {
  return prisma.profile.findUniqueOrThrow({ where: { id } });
}

export function pillarsOf(p: { pillars: unknown }): PillarMap {
  const v = (p.pillars || {}) as Partial<PillarMap>;
  return { A: v.A || "Pillar A", B: v.B || "Pillar B", C: v.C || "Pillar C" };
}

export function isComplete(p: { context: string }) {
  return p.context.trim().length > 200;
}
