/**
 * Import prisma/seed-links.json into a profile's bank.
 *   node scripts/seed-links.mjs                  -> first profile
 *   SEED_EMAIL=you@gmail.com node scripts/seed-links.mjs -> that user's profile
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

function detectPlatform(u) {
  u = u.toLowerCase();
  if (u.includes("instagram.com")) return "Instagram";
  if (u.includes("tiktok.com")) return "TikTok";
  if (u.includes("linkedin.com")) return "LinkedIn";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "YouTube";
  return "Web";
}
function clean(url) {
  const u = new URL(url);
  ["stkn", "igsh", "utm_source", "utm_medium", "utm_campaign"].forEach((k) => u.searchParams.delete(k));
  return u.toString();
}
function title(url) {
  const u = new URL(url);
  const parts = u.pathname.split("/").filter(Boolean);
  const kind = parts[0] === "reel" ? "Reel" : parts[0] === "p" ? "Post" : "Link";
  return `${detectPlatform(url)} ${kind} ${parts[1] || parts[0] || ""}`.trim();
}

const links = JSON.parse(readFileSync(new URL("../prisma/seed-links.json", import.meta.url), "utf8"));
let profile;
if (process.env.SEED_EMAIL) {
  const user = await prisma.user.findUnique({ where: { email: process.env.SEED_EMAIL.toLowerCase() }, include: { profile: true } });
  if (!user) throw new Error(`No user with email ${process.env.SEED_EMAIL}. Sign in once first.`);
  profile = user.profile;
} else {
  profile = await prisma.profile.findFirst({ orderBy: { createdAt: "asc" } });
  if (!profile) throw new Error("No profile yet. Sign in once first.");
}
let created = 0;
for (const raw of links) {
  const url = clean(raw);
  const exists = await prisma.idea.findFirst({ where: { profileId: profile.id, url } });
  if (exists) continue;
  await prisma.idea.create({ data: { profileId: profile.id, url, platform: detectPlatform(url), title: title(url), tags: ["imported"] } });
  created++;
}
console.log(`Added ${created} of ${links.length} links to ${profile.name}'s bank`);
await prisma.$disconnect();
