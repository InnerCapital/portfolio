import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import AskPanel from "@/components/AskPanel";
import IdeasPanel from "@/components/IdeasPanel";
import MeasurePanel from "@/components/MeasurePanel";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { benchmarkReport, themeBreakdown, apifyReady, notionReady } from "@/lib/measure";

export const dynamic = "force-dynamic";

/** Home is the feed: your profile, performance and recent posts. The deeper
 * analysis and account management live further down the same page. */
export default async function Home() {
  const profile = await activeProfile();
  const creators = await prisma.creator.findMany({
    where: { profileId: profile.id },
    orderBy: [{ isSelf: "desc" }, { handle: "asc" }],
    select: { id: true, handle: true, platform: true, isSelf: true, followers: true, lastScrapedAt: true, tiktokHandle: true, linkedinUrl: true, _count: { select: { pieces: true } } },
  });
  const report = await benchmarkReport(profile.id);
  const themes = await themeBreakdown(profile.id);
  return (
    <main className="shell">
      <Nav who={profile.name} />
      <AskPanel />
      <IdeasPanel />
      <MeasurePanel
        apifyReady={apifyReady()}
        notionReady={notionReady()}
        creators={creators.map((c) => ({
          id: c.id,
          handle: c.handle,
          platform: c.platform,
          isSelf: c.isSelf,
          followers: c.followers,
          pieces: c._count.pieces,
          lastScrapedAt: c.lastScrapedAt ? c.lastScrapedAt.toISOString() : null,
          tiktokHandle: c.tiktokHandle,
          linkedinUrl: c.linkedinUrl,
        }))}
        report={JSON.parse(JSON.stringify(report))}
        themes={JSON.parse(JSON.stringify(themes))}
      />
      <Toast />
    </main>
  );
}
