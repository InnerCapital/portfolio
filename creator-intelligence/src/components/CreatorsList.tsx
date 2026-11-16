"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";

type Row = { id: string; handle: string; platform: string; niche: string; analysed: boolean; ideas: number; topics: string[]; summary: string };

export default function CreatorsList({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  async function add() {
    if (!handle.trim()) return;
    setBusy(true);
    const r = await fetch("/api/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, platform }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Could not add");
    router.push(`/creators/${j.id}`);
  }
  const list = initial.filter((c) => !q || [c.handle, c.niche, c.topics.join(" "), c.summary].join(" ").toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Who you learn from</div><h1>Creators</h1></div>
        <div className="stats">
          <div className="stat"><b>{initial.length}</b><span>Creators</span></div>
          <div className="stat"><b>{initial.filter((c) => c.analysed).length}</b><span>Broken down</span></div>
        </div>
      </div>
      <div className="add-row">
        <input value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="@handle or profile link" onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
          {["Instagram", "TikTok", "LinkedIn", "YouTube", "X", "Substack"].map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="btn primary sm" type="button" onClick={add} disabled={busy || !handle.trim()}>Add creator</button>
        <span className="hint">Then paste what you know about them and run the breakdown.</span>
      </div>
      <div className="toolbar">
        <label className="search"><span className="label">Search</span><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Handle, niche, topic" /></label>
      </div>
      {initial.length === 0 ? <div className="empty"><h2>No creators yet</h2><p>Add a handle above, or save a creator from an idea once the screenshots reveal who posted it.</p></div> : null}
      <div className="creator-grid">
        {list.map((c) => (
          <Link key={c.id} href={`/creators/${c.id}`} className="creator-card">
            <span className="h">{c.handle}</span>
            <span className="muted small">{c.platform}{c.niche ? ` · ${c.niche}` : ""}</span>
            {c.summary ? <span className="n">{c.summary}</span> : <span className="n muted">Not broken down yet</span>}
            <span className="row-tags">
              <span className="tag">{c.ideas} saved piece{c.ideas === 1 ? "" : "s"}</span>
              {c.topics.map((t) => <span key={t} className="tag pillar-soft">{t}</span>)}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}
