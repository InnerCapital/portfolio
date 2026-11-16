"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";
import type { AudiencePulse } from "@/lib/intelligence";

type P = { id: string; caption: string; permalink: string; thumbnailUrl: string; mediaType: string; postedAt: string | null; likeCount: number; commentsCount: number; comments: { id: string; username: string; text: string; likeCount: number; reply: boolean }[]; ideas: { ideaId: string; role: string }[] };

export default function PostsPanel({ connected, posts }: { connected: { username: string; lastSyncAt: string | null }[]; posts: P[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pulse, setPulse] = useState<AudiencePulse | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    const r = await fetch("/api/instagram/sync", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Sync failed");
    const ok = j.filter((x: { error?: string }) => !x.error);
    toast(ok.length ? `Synced ${ok.reduce((n: number, x: { posts: number }) => n + x.posts, 0)} posts, ${ok.reduce((n: number, x: { comments: number }) => n + x.comments, 0)} comments` : j[0]?.error || "Sync failed");
    router.refresh();
  }
  async function runPulse() {
    setBusy(true);
    const r = await fetch("/api/audience/pulse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ posts: 12 }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Pulse failed");
    setPulse(j);
  }
  async function saveIdea(g: AudiencePulse["contentToMake"][number]) {
    const r = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: g.title, note: `Hook: ${g.hook}\nFormat: ${g.format}\n${g.why}\n\nFrom the audience pulse`, pillar: g.pillar, status: "DEVELOPING", tags: ["audience-pulse"] }) });
    const j = await r.json();
    toast("Saved to ideas");
    router.push(`/ideas/${j.id}`);
  }

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">What our audience is saying</div><h1>Our posts</h1></div>
        <div className="actions">
          {connected.length ? <button className="btn quiet" type="button" onClick={sync} disabled={busy}>{busy ? "Working…" : "Sync from Instagram"}</button> : <Link className="btn quiet" href="/settings">Connect Instagram</Link>}
          <button className="btn accent" type="button" onClick={runPulse} disabled={busy || !posts.length}>Read the audience pulse</button>
        </div>
      </div>
      {connected.length ? <p className="hint">Connected: {connected.map((c) => `@${c.username}${c.lastSyncAt ? ` (synced ${new Date(c.lastSyncAt).toLocaleString("en-GB")})` : " (not synced yet)"}`).join(", ")}</p> : <p className="hint">No account connected. Connect Instagram in Settings; LinkedIn and TikTok comments can be pasted straight into an idea.</p>}

      {pulse ? (
        <div className="analysis" style={{ paddingBlock: 20, borderBottom: "1px solid var(--rule)" }}>
          <p className="summary">{pulse.headline}</p>
          <span className={`pill ${pulse.mood}`}>Mood: {pulse.mood}</span>
          <div><div className="h3">Recurring themes</div><ul className="themes">{pulse.themes.map((t, n) => <li key={n}><span className="t">{t.theme}</span><span className="e">{t.evidence}</span><span className="w">{t.count}</span></li>)}</ul></div>
          <div className="twocol">
            <div><div className="h3">What they ask for</div><ul className="plain">{pulse.requests.map((x, n) => <li key={n}>{x}</li>)}</ul></div>
            <div><div className="h3">Pushback</div>{pulse.objections.length ? <ul className="plain">{pulse.objections.map((x, n) => <li key={n}>{x}</li>)}</ul> : <p className="hint">None surfaced.</p>}</div>
          </div>
          <div className="identity">
            <div><span className="label">Who they want to be</span>{pulse.identity.whoTheyWantToBe}</div>
            <div><span className="label">Enemy</span>{pulse.identity.enemy}</div>
            <div><span className="label">Transformation</span>{pulse.identity.transformation}</div>
          </div>
          <div><div className="h3">Content to make</div><div className="angles">{pulse.contentToMake.map((g, n) => (
            <div className="angle" key={n}><div className="top"><span className="at">{g.title}</span><span className="tag pillar">Pillar {g.pillar}</span></div><div className="hook">“{g.hook}”</div><div className="why">{g.why}</div><div className="fm">{g.format}</div><div><button className="btn quiet sm" type="button" onClick={() => saveIdea(g)}>Save to ideas</button></div></div>
          ))}</div></div>
        </div>
      ) : null}

      {!posts.length ? <div className="empty"><h2>No posts synced yet</h2><p>Connect Instagram and sync to bring in your posts and their comments.</p></div> : null}
      <div className="posts">
        {posts.map((p) => (
          <div className="post-card" key={p.id}>
            {p.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="thumb" src={p.thumbnailUrl} alt="" />
            ) : <div className="thumb" />}
            <div className="body">
              <span className="cap">{p.caption || "(no caption)"}</span>
              <span className="nums"><span>{p.likeCount} likes</span><span>{p.commentsCount} comments</span>{p.postedAt ? <span>{new Date(p.postedAt).toLocaleDateString("en-GB")}</span> : null}</span>
              <div className="actions">
                <button className="btn quiet sm" type="button" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? "Hide comments" : `Comments (${p.comments.length})`}</button>
                <a className="btn quiet sm" href={p.permalink} target="_blank" rel="noreferrer">Open ↗</a>
                {p.ideas.map((i) => <Link key={i.ideaId} href={`/ideas/${i.ideaId}`} className="tag">{i.role === "result" ? "result of an idea" : "feeds an idea"}</Link>)}
              </div>
              {open === p.id ? (
                <ul className="comment-list">{p.comments.map((c) => <li key={c.id} className={c.reply ? "reply" : ""}><b>{c.username}</b> {c.text}{c.likeCount ? <span className="muted"> · {c.likeCount}</span> : null}</li>)}</ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
