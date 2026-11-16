import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import BreakdownPage, { type BreakdownVM } from "@/components/BreakdownPage";
import { activeProfile } from "@/lib/profile";
import { breakdownView } from "@/lib/breakdown";

export const dynamic = "force-dynamic";

export default async function PieceBreakdownRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await activeProfile();
  const vm = await breakdownView(id, profile.id);
  if (!vm) notFound();

  return (
    <main className="shell">
      <Nav who={profile.name} />
      <BreakdownPage vm={vm as BreakdownVM} />
    </main>
  );
}
