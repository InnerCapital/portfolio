"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";

export interface IdeaRow {
  id: string;
  title: string;
  url: string;
  platform: string;
  note: string;
  tags: string[];
  pillar: "A" | "B" | "C" | null;
  status: string;
  creator: string;
  topics: string[];
  createdAt: string;
  analysis: { sentiment?: { inspiration?: string; ours?: string }; themes?: { theme: string }[]; angles?: unknown[]; source?: string } | null;
  counts: { screenshots: number; refinements: number; linkedPosts: number };
  hasComments: boolean;
  enriching: boolean;
  hasResult: boolean;
  videoAnalysed: boolean;
  videoAnalysing: boolean;
  hasRecipe: boolean;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function IdeasList({ initial }: { initial: IdeaRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("new");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState(false);

  // Keep the feed live while a saved video is analysing or a link is enriching.
  useEffect(() => {
    if (!initial.some((i) => i.enriching || i.videoAnalysing)) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [initial, router]);

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const out = initial.filter((i) => {
      if (!ql) return true;
      const hay = [i.title, i.note, i.url, i.platform, i.creator, i.topics.join(" "), i.tags.join(" ")].join(" ").toLowerCase();
      return hay.includes(ql);
    });
    out.sort((a, b) => {
      if (sort === "to-analyse") { const d = (a.videoAnalysed ? 1 : 0) - (b.videoAnalysed ? 1 : 0); if (d) return d; }
      const c = a.createdAt.localeCompare(b.createdAt);
      return sort === "old" ? c : -c;
    });
    return out;
  }, [initial, q, sort]);

  const stats = {
    total: initial.length,
    analysed: initial.filter((i) => i.videoAnalysed).length,
    recipes: initial.filter((i) => i.hasRecipe).length,
  };

  async function newIdea() {
    setBusy(true);
    const r = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const idea = await r.json();
    router.push(`/ideas/${idea.id}`);
  }

  async function runImport() {
    setBusy(true);
    const r = await fetch("/api/ideas/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: importText }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Import failed");
    toast(`${j.created} added${j.skipped.length ? `, ${j.skipped.length} already in the bank` : ""}`);
    setImportText(""); setShowImport(false);
    router.refresh();
  }

  function state(i: IdeaRow): { label: string; cls: string } {
    if (i.videoAnalysing) return { label: "Analysing…", cls: "pillar-soft" };
    if (i.hasRecipe) return { label: "Recipe ready", cls: "v-over" };
    if (i.videoAnalysed) return { label: "Analysed · build the recipe", cls: "v-typical" };
    if (i.enriching) return { label: "Reading the link…", cls: "pillar-soft" };
    return { label: "Tap to analyse", cls: "" };
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Save a video, see how it works, recreate it</div>
          <h1>Ideas</h1>
        </div>
        <div className="stats">
          {[[stats.total, "Saved"], [stats.analysed, "Analysed"], [stats.recipes, "Recipes"]].map(([n, l]) => (
            <div className="stat" key={String(l)}><b>{n}</b><span>{l}</span></div>
          ))}
        </div>
        <div className="actions">
          <button className="btn quiet" type="button" onClick={() => setShowImport((s) => !s)}>Paste links</button>
          <button className="btn primary" type="button" onClick={newIdea} disabled={busy}>+ New idea</button>
        </div>
      </div>

      {showImport ? (
        <div className="import">
          <label className="label" htmlFor="importText">Paste links, one per line or separated by spaces</label>
          <textarea id="importText" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="https://www.instagram.com/reel/...&#10;https://vm.tiktok.com/..." />
          <div className="actions">
            <button className="btn accent sm" type="button" onClick={runImport} disabled={busy || !importText.trim()}>Add to the bank</button>
            <span className="hint">Each link becomes a saved video. Open it to analyse what's going on and build your own version.</span>
          </div>
        </div>
      ) : null}

      <div className="toolbar simple">
        <label className="search">
          <span className="label">Search</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your saved videos" />
        </label>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="old">Oldest first</option>
          <option value="to-analyse">Not analysed first</option>
        </select>
      </div>

      {initial.length === 0 ? (
        <div className="empty">
          <h2>Nothing saved yet</h2>
          <p>Share an Instagram or TikTok video into the bank from your phone, or paste a link. Then open it to see its numbers, comments, how it's shot, and how to recreate it.</p>
        </div>
      ) : null}
      {initial.length > 0 && list.length === 0 ? <p className="empty">No saved videos match that search.</p> : null}

      <ul className="feed">
        {list.map((i) => {
          const st = state(i);
          return (
            <li key={i.id}>
              <Link href={`/ideas/${i.id}`} className="feed-row">
                <div className="feed-main">
                  <div className="feed-title">{i.title || "Untitled video"}</div>
                  <div className="feed-meta">
                    {i.platform ? <span className="platform">{i.platform}</span> : null}
                    {i.creator ? <span>{i.creator}</span> : null}
                    <span>{fmt(i.createdAt)}</span>
                  </div>
                  {i.note ? <div className="feed-note">{i.note}</div> : null}
                </div>
                <span className={`pill ${st.cls}`}>{st.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
