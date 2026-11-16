import Nav from "@/components/Nav";
import LibraryView, { type LibItem } from "@/components/LibraryView";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { breakdownLibrary } from "@/lib/breakdown";

export const dynamic = "force-dynamic";

export default async function LibraryRoute() {
  const profile = await activeProfile();
  const [items, self] = await Promise.all([
    breakdownLibrary(profile.id),
    prisma.creator.findFirst({ where: { profileId: profile.id, isSelf: true }, select: { id: true } }),
  ]);

  return (
    <main className="shell">
      <Nav who={profile.name} />
      <LibraryView items={items as LibItem[]} selfCreatorId={self?.id ?? null} />
    </main>
  );
}
