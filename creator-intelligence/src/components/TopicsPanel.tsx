"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";

type T = { id: string; name: string; description: string; creators: { id: string; handle: string }[]; ideas: { id: string; title: string }[] };

export default function TopicsPanel({ initial }: { initial: T[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");

  async function suggest() {
    setBusy(true);
    const r = await fetch("/api/topics/suggest", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Grouping failed");
    toast(`${j.groups} topics, ${j.links} links made`);
    router.refresh();
  }
  async function add() {
    if (!name.trim()) return;
    await fetch("/api/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
    setName(""); router.refresh();
  }
  async function remove(t: T) {
    if (!confirm(`Delete topic "${t.name}"? Creators and ideas stay.`)) return;
    await fetch(`/api/topics/${t.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Similar subjects, grouped</div><h1>Topics</h1></div>
        <div className="actions">
          <button className="btn accent" type="button" onClick={suggest} disabled={busy}>{busy ? "Grouping…" : "Group everything by topic"}</button>
        </div>
      </div>
      <div className="add-row">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New topic name" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <button className="btn quiet sm" type="button" onClick={add} disabled={!name.trim()}>Add topic</button>
        <span className="hint">Or let the intelligence layer read your creators and ideas and cluster them.</span>
      </div>
      {initial.length === 0 ? <div className="empty"><h2>No topics yet</h2><p>Add a few creators and ideas, then group everything by topic.</p></div> : null}
      <div className="topic-list">
        {initial.map((t) => (
          <div className="topic" key={t.id}>
            <div className="actions" style={{ justifyContent: "space-between" }}>
              <span className="tn">{t.name}</span>
              <button className="btn quiet sm" type="button" onClick={() => remove(t)}>Delete</button>
            </div>
            {t.description ? <span className="muted small">{t.description}</span> : null}
            {t.creators.length ? <div className="members"><span className="label" style={{ display: "inline" }}>Creators</span>{t.creators.map((c) => <Link key={c.id} href={`/creators/${c.id}`} className="tag">{c.handle}</Link>)}</div> : null}
            {t.ideas.length ? <div className="members"><span className="label" style={{ display: "inline" }}>Ideas</span>{t.ideas.map((i) => <Link key={i.id} href={`/ideas/${i.id}`} className="tag pillar-soft">{i.title || "Untitled"}</Link>)}</div> : null}
            {!t.creators.length && !t.ideas.length ? <span className="hint">Empty. Attach creators and ideas from their pages.</span> : null}
          </div>
        ))}
      </div>
    </>
  );
}
