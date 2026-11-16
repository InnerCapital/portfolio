import Nav from "@/components/Nav";
import { prisma } from "@/lib/prisma";
import { activeProfile } from "@/lib/profile";
import { currentUser, googleConfigured } from "@/lib/auth";
import { isConfigured as igConfigured } from "@/lib/instagram";
import DisconnectButton from "@/components/DisconnectButton";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const sp = await searchParams;
  const p = await activeProfile();
  const user = await currentUser();
  const conns = await prisma.socialConnection.findMany({ where: { profileId: p.id } });
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  return (
    <main className="shell">
      <Nav who={p.name} />
      <div className="page-head"><div><div className="eyebrow">Connections and capture</div><h1>Settings</h1></div></div>
      {sp.error ? <div className="notice danger">{sp.error}</div> : null}
      {sp.connected ? <div className="notice">Connected @{sp.connected}. Go to Our posts and sync.</div> : null}
      <div className="settings">
        <div className="card">
          <h2>Signed in</h2>
          <p style={{ margin: 0 }}>{user?.email}{user?.name ? ` · ${user.name}` : ""}</p>
          <p className="hint">{googleConfigured() ? "Google sign-in is on. Each Google account gets its own profile and its own bank." : "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to let each person sign in with Gmail."}</p>
        </div>

        <div className="card">
          <h2>Instagram</h2>
          {conns.length ? (
            <ul className="plain">{conns.map((c) => <li key={c.id}>@{c.username} · token expires {c.expiresAt ? c.expiresAt.toLocaleDateString("en-GB") : "unknown"} <DisconnectButton id={c.id} /></li>)}</ul>
          ) : <p className="hint">No account connected.</p>}
          {igConfigured() ? (
            <a className="btn primary" href="/api/instagram/connect" style={{ justifySelf: "start" }}>{conns.length ? "Reconnect Instagram" : "Connect Instagram"}</a>
          ) : (
            <p className="hint">Set INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET and APP_URL, then add <code>{base || "https://your-app"}/api/instagram/callback</code> as a redirect URI in the Meta app. The account must be a Business or Creator account.</p>
          )}
          <p className="hint">LinkedIn and TikTok do not open their comment APIs to normal apps. Paste those comments into the idea, or add screenshots and read them in.</p>
        </div>

        <div className="card">
          <h2>Capture from your phone</h2>
          <p className="hint">Share a link straight into the bank from an iOS Shortcut or any tool. Send a POST to the address below with JSON <code>{`{ "url": "...", "note": "optional" }`}</code>, or open it as a GET with <code>?url=</code>.</p>
          <code style={{ wordBreak: "break-all" }}>{base || "https://your-app"}/api/capture?token={p.apiToken}</code>
          <p className="hint">Keep the token private. Anyone with it can add links to your bank (and only add links).</p>
        </div>

        <div className="card">
          <h2>Intelligence</h2>
          <p className="hint">Model: <code>{process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5"}</code>. {process.env.ANTHROPIC_API_KEY ? "API key is set." : "ANTHROPIC_API_KEY is missing; analysis and briefs will fail until it is set."}</p>
        </div>
      </div>
    </main>
  );
}
