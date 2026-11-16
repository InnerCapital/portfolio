"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";
import type { CreatorBreakdown } from "@/lib/intelligence";

interface C { id: string; handle: string; platform: string; name: string; url: string; niche: string; notes: string; evidence: string; breakdown: CreatorBreakdown | null; topicIds: string[] }

export default function CreatorDetail({ initial, ideas, topics, profileName }: { initial: C; ideas: { id: string; title: string; url: string; platform: string; analysed: boolean }[]; topics: { id: string; name: string }[]; profileName: string }) {
  const router = useRouter();
  const [c, setC] = useState(initial);
  const [topicList, setTopicList] = useState(topics);
  const [busy, setBusy] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [state, setState] = useState("Saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<Record<string, string>>({});

  function patch(f: Partial<C>) {
    setC((x) => ({ ...x, ...f }));
    Object.assign(pending.current, f);
    setState("Unsaved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }
  async function flush() {
    const body = pending.current; pending.current = {};
    if (!Object.keys(body).length) return;
    setState("Saving…");
    const r = await fetch(`/api/creators/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setState(r.ok ? "Saved" : "Not saved");
  }
  async function analyse() {
    setBusy(true);
    await flush();
    const r = await fetch(`/api/creators/${c.id}/analyse`, { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Breakdown failed");
    setC((x) => ({ ...x, breakdown: j.breakdown, niche: j.niche }));
    toast("Breakdown ready");
  }
  async function toggleTopic(name: string, attached: boolean, topicId?: string) {
    const r = await fetch("/api/topics/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicId, name, creatorId: c.id, attached }) });
    const j = await r.json();
    if (!r.ok) return toast(j.error || "Topic failed");
    if (!topicList.some((t) => t.id === j.topicId)) setTopicList((l) => [...l, { id: j.topicId, name }]);
    setC((x) => ({ ...x, topicIds: attached ? Array.from(new Set([...x.topicIds, j.topicId])) : x.topicIds.filter((t) => t !== j.topicId) }));
    setNewTopic("");
  }
  async function spin(idea: CreatorBreakdown["ideasForYou"][number]) {
    const r = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: idea.title, note: `Hook: ${idea.hook}\nFormat: ${idea.format}\n${idea.why}\n\nInspired by ${c.handle}`, pillar: idea.pillar, status: "DEVELOPING", creatorId: c.id, tags: ["from-creator"] }) });
    const j = await r.json();
    toast("Saved to ideas");
    router.push(`/ideas/${j.id}`);
  }
  async function remove() {
    if (!confirm(`Remove ${c.handle}? Saved ideas stay, they just lose the link.`)) return;
    await fetch(`/api/creators/${c.id}`, { method: "DELETE" });
    router.push("/creators");
  }
  const b = c.breakdown;

  return (
    <>
      <div className="page-head" style={{ paddingBottom: 8 }}>
        <div>
          <Link href="/creators" className="eyebrow" style={{ textDecoration: "none" }}>← Creators</Link>
          <input className="title-input" style={{ display: "block", width: "100%", marginTop: 8 }} value={c.handle} onChange={(e) => patch({ handle: e.target.value })} />
        </div>
        <div className="actions"><span className="save-state">{state}</span><button className="btn quiet sm" type="button" onClick={remove}>Remove</button></div>
      </div>
      <div className="editor">
        <div className="col">
          <div className="sec">
            <div className="grid2">
              <div className="field"><label className="label" htmlFor="platform">Platform</label><input id="platform" value={c.platform} onChange={(e) => patch({ platform: e.target.value })} /></div>
              <div className="field"><label className="label" htmlFor="name">Name</label><input id="name" value={c.name} onChange={(e) => patch({ name: e.target.value })} /></div>
            </div>
            <div className="field"><label className="label" htmlFor="url">Profile link</label><input id="url" value={c.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://www.instagram.com/..." /></div>
            <div className="field"><label className="label" htmlFor="niche">Niche</label><input id="niche" value={c.niche} onChange={(e) => patch({ niche: e.target.value })} placeholder="Filled in by the breakdown if empty" /></div>
            <div className="field"><label className="label" htmlFor="notes">Your notes</label><textarea id="notes" value={c.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="What you think they do well, what you would never copy." /></div>
            <div className="field">
              <span className="label">Topics</span>
              <div className="chips">{topicList.map((t) => { const on = c.topicIds.includes(t.id); return <button key={t.id} className="chip" type="button" aria-pressed={on} onClick={() => toggleTopic(t.name, !on, t.id)}>{t.name}</button>; })}</div>
              <div className="actions" style={{ marginTop: 6 }}>
                <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic" style={{ border: "1px solid var(--rule-strong)", background: "var(--surface)", borderRadius: 4, padding: "8px 10px" }} />
                <button className="btn quiet sm" type="button" onClick={() => toggleTopic(newTopic.trim(), true)} disabled={!newTopic.trim()}>Add</button>
              </div>
              {b?.suggestedTopics?.length ? <p className="hint">Suggested: {b.suggestedTopics.map((t) => <button key={t} className="chip" type="button" style={{ marginRight: 4 }} onClick={() => toggleTopic(t, true)}>{t}</button>)}</p> : null}
            </div>
          </div>
          <div className="sec">
            <div className="sec-head"><h3>Evidence</h3><p>Paste their bio, captions of their top posts with view counts, anything you have. The breakdown only describes what is here or in saved pieces.</p></div>
            <div className="field"><textarea value={c.evidence} onChange={(e) => patch({ evidence: e.target.value })} style={{ minHeight: 200 }} placeholder={"Bio: ...\nTop post: 'hook line' 1.2M views, 4k comments\n..."} /></div>
          </div>
          <div className="sec">
            <div className="sec-head"><h3>Saved pieces from this creator</h3><p>{ideas.length} in the bank</p></div>
            {ideas.length ? <ul className="plain">{ideas.map((i) => <li key={i.id}><Link href={`/ideas/${i.id}`}>{i.title || i.url}</Link> {i.analysed ? <span className="tag">analysed</span> : null}</li>)}</ul> : <p className="hint">Link ideas to this creator from the idea page.</p>}
          </div>
        </div>
        <div className="col">
          <div className="sec">
            <div className="sec-head"><h3>Breakdown</h3><p>What they make, what performs, and how it relates to {profileName}.</p></div>
            <div className="actions" style={{ marginBottom: 16 }}>
              <button className="btn accent sm" type="button" onClick={analyse} disabled={busy}>{busy ? "Reading…" : b ? "Run again" : "Break down this creator"}</button>
              {b ? <span className={`tag ${b.evidenceQuality === "strong" ? "pillar" : ""}`}>Evidence: {b.evidenceQuality}</span> : null}
            </div>
            {b ? (
              <div className="breakdown">
                <p className="summary">{b.summary}</p>
                <div className="cols">
                  <div><h4>What they make</h4><ul className="plain">{b.whatTheyMake?.map((x, n) => <li key={n}>{x}</li>)}</ul></div>
                  <div><h4>Formats and hooks</h4><ul className="plain">{b.formatsAndHooks?.map((x, n) => <li key={n}>{x}</li>)}</ul></div>
                </div>
                <div><h4>Popular topics</h4><ul className="themes">{b.popularTopics?.map((t, n) => <li key={n}><span className="t">{t.topic}</span><span className="e">{t.why}</span></li>)}</ul></div>
                <div><h4>Best performing</h4>{b.bestPerforming?.length ? <ul className="themes">{b.bestPerforming.map((t, n) => <li key={n}><span className="t">{t.piece}</span><span className="e">{t.whyItWorked}</span><span className="w">{t.signal}</span></li>)}</ul> : <p className="hint">Nothing in the evidence yet. Paste their top posts above.</p>}</div>
                <div className="identity">
                  <div><span className="label">Their audience wants to be</span>{b.audience?.whoTheyWantToBe}</div>
                  <div><span className="label">Their enemy</span>{b.audience?.enemy}</div>
                </div>
                <div className="sent-card">
                  <span className="label">How it relates to {profileName}</span>
                  <p><b>Overlap.</b> {b.relationToProfile?.overlap}</p>
                  <p><b>Only you can fill.</b> {b.relationToProfile?.gapOnlyYouCanFill}</p>
                  <div className="cols" style={{ marginTop: 8 }}>
                    <div><span className="label">Borrow</span><ul className="plain">{b.relationToProfile?.borrow?.map((x, n) => <li key={n}>{x}</li>)}</ul></div>
                    <div><span className="label">Avoid</span><ul className="plain">{b.relationToProfile?.avoid?.map((x, n) => <li key={n}>{x}</li>)}</ul></div>
                  </div>
                </div>
                <div><h4>Ideas for you</h4>
                  <div className="angles">{b.ideasForYou?.map((g, n) => (
                    <div className="angle" key={n}>
                      <div className="top"><span className="at">{g.title}</span><span className="tag pillar">Pillar {g.pillar}</span></div>
                      <div className="hook">“{g.hook}”</div><div className="why">{g.why}</div><div className="fm">{g.format}</div>
                      <div><button className="btn quiet sm" type="button" onClick={() => spin(g)}>Save to ideas</button></div>
                    </div>
                  ))}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}
