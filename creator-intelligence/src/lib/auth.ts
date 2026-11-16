import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { SESSION_COOKIE, verifySession } from "./session";
import { SEED_ANSWERS, SEED_CONTEXT, SEED_PILLARS } from "./seed";

export { SESSION_COOKIE };

export function googleConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.APP_URL);
}

export function allowedEmail(email: string): boolean {
  const list = (process.env.ALLOWED_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const e = email.toLowerCase();
  return list.some((a) => (a.startsWith("@") ? e.endsWith(a) : e === a));
}

/** Find or create the user for a Google account, giving them their own profile. */
export async function userForGoogle(email: string, name: string, picture: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return prisma.user.update({ where: { id: existing.id }, data: { name, picture, lastLogin: new Date() } });

  const ownerEmail = (process.env.OWNER_EMAIL || "owner@example.com").toLowerCase();
  let profileId: string | undefined;
  if (email.toLowerCase() === ownerEmail) {
    // Maya's account claims the seeded profile if it has no owner yet.
    const seeded = await prisma.profile.findFirst({ where: { handle: "@maya.rivers", users: { none: {} } } });
    profileId = seeded?.id;
    if (!profileId) {
      const p = await prisma.profile.create({ data: { name: "Maya Rivers", handle: "@maya.rivers", platforms: ["Instagram", "LinkedIn", "TikTok"], answers: SEED_ANSWERS, context: SEED_CONTEXT, pillars: SEED_PILLARS } });
      profileId = p.id;
    }
  } else {
    const p = await prisma.profile.create({ data: { name: name || email.split("@")[0], answers: {} } });
    profileId = p.id;
  }
  return prisma.user.create({ data: { email, name, picture, profileId } });
}

/** Password fallback for local development or before Google is configured. */
export async function userForPassword() {
  const email = "local@ideas-bank";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  let profile = await prisma.profile.findFirst({ where: { handle: "@maya.rivers", users: { none: {} } } });
  if (!profile) profile = await prisma.profile.create({ data: { name: "Maya Rivers", handle: "@maya.rivers", platforms: ["Instagram", "LinkedIn", "TikTok"], answers: SEED_ANSWERS, context: SEED_CONTEXT, pillars: SEED_PILLARS } });
  return prisma.user.create({ data: { email, name: "Local", profileId: profile.id } });
}

export async function currentUser() {
  const jar = await cookies();
  const s = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!s) return null;
  return prisma.user.findUnique({ where: { id: s.uid }, include: { profile: true } });
}
