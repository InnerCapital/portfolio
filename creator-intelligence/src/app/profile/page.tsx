import Nav from "@/components/Nav";
import Toast from "@/components/Toast";
import Questionnaire from "@/components/Questionnaire";
import { activeProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const p = await activeProfile();
  return (
    <main className="shell">
      <Nav who={p.name} />
      <Questionnaire initial={{ id: p.id, name: p.name, handle: p.handle, answers: (p.answers as Record<string, string>) || {}, context: p.context }} />
      <Toast />
    </main>
  );
}
