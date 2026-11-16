"use client";
import { useState } from "react";

/* "Give me ideas" — a short, ranked list of content ideas grounded in Maya's
 * real numbers AND what the video teardowns learned (hook types that
 * over-index, cadence of her winners, what worked). Each idea cites one real
 * figure + one visual reason, and can be saved straight into the bank. The
 * shape mirrors ContentIdeas in src/lib/intelligence.ts. */

interface Idea {
  title: string;
  format: string;
  pillar: "A" | "B" | "C" | null;
  hookAngle: string;
  whyNumber: string;
  whyVisual: string;
  firstStep: string;
  series: boolean;
}
const PLATFORMS = ["All", "Reels", "TikTok", "Carousel", "LinkedIn"];

export default function IdeasPanel() {
  const [ideas, setIdeas] = useState<Idea[] | null>(null);
  const [caveat, setCaveat] = useState("");
  const [platform, setPlatform] = useState("All");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState<Record<number, "saving" | "done">>({});

  async function generate() {
    setBusy(true); setErr(""); setSaved({});
    try {
      const res = await fetch("/api/ideas/suggest", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ platform }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not generate ideas");
      setIdeas(Array.isArray(j.ideas) ? j.ideas : []);
      setCaveat(j.caveat || "");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function save(i: number, idea: Idea) {
    setSaved((s) => ({ ...s, [i]: "saving" }));
    try {
      const note = `${idea.hookAngle}\n\nWhy: ${idea.whyNumber} ${idea.whyVisual}\nFirst step: ${idea.firstStep}`;
      const res = await fetch("/api/ideas", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: idea.title, note, pillar: idea.pillar, tags: ["insyte", idea.format].filter(Boolean) }),
      });
      if (!res.ok) throw new Error();
      setSaved((s) => ({ ...s, [i]: "done" }));
    } catch {
      setSaved((s) => { const n = { ...s }; delete n[i]; return n; });
      setErr("Could not save that idea.");
    }
  }

  return (
    <div className="ideas card">
      <div className="sec-head">
        <h2>Give me ideas</h2>
        <div className="ideas-controls">
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Format" disabled={busy}>
            {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <button className="btn primary sm" disabled={busy} onClick={generate}>{busy ? "Thinking…" : ideas ? "Again" : "Give me ideas"}</button>
        </div>
      </div>

      {!ideas && !busy ? (
        <p className="hint">Five content ideas, ranked, from your real numbers and what your video teardowns learned — each tied to one figure and one thing that worked on the footage. Break down your top videos first for the sharpest read.</p>
      ) : null}
      {busy ? <p className="hint"><span className="reading-dot" />Reading your numbers and your teardowns…</p> : null}
      {err ? <div className="notice danger">{err}</div> : null}

      {ideas && !busy ? (
        ideas.length === 0 ? <p className="hint">No ideas came back. Try again, or tear down a few videos first.</p> : (
          <>
            <ol className="idea-list">
              {ideas.map((idea, i) => (
                <li key={i} className="idea">
                  <div className="idea-head">
                    <span className="idea-title">{idea.title}</span>
                    <div className="idea-tags">
                      <span className="chip">{idea.format}</span>
                      {idea.pillar ? <span className="chip">Pillar {idea.pillar}</span> : null}
                      {idea.series ? <span className="chip series">series</span> : null}
                    </div>
                  </div>
                  {idea.hookAngle ? <p className="idea-hook">Hook: {idea.hookAngle}</p> : null}
                  <div className="idea-why">
                    {idea.whyNumber ? <p><b>Number:</b> {idea.whyNumber}</p> : null}
                    {idea.whyVisual ? <p><b>Visual:</b> {idea.whyVisual}</p> : null}
                  </div>
                  <div className="idea-foot">
                    {idea.firstStep ? <span className="idea-step">→ {idea.firstStep}</span> : <span />}
                    <button className="btn quiet sm" disabled={saved[i] === "saving" || saved[i] === "done"} onClick={() => save(i, idea)}>
                      {saved[i] === "done" ? "Saved ✓" : saved[i] === "saving" ? "Saving…" : "Save to bank"}
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {caveat ? <p className="idea-caveat muted small">{caveat}</p> : null}
          </>
        )
      ) : null}
    </div>
  );
}
