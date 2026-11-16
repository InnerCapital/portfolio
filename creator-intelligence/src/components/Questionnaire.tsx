"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { QUESTIONNAIRE } from "@/lib/brand";
import { toast } from "./Toast";

interface P { id: string; name: string; handle: string; answers: Record<string, string>; context: string }

export default function Questionnaire({ initial }: { initial: P }) {
  const router = useRouter();
  const [p, setP] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [editContext, setEditContext] = useState(false);
  const answered = QUESTIONNAIRE.flatMap((s) => s.questions).filter((q) => (p.answers[q.key] || "").trim()).length;
  const total = QUESTIONNAIRE.flatMap((s) => s.questions).length;

  function set(key: string, v: string) { setP((x) => ({ ...x, answers: { ...x.answers, [key]: v } })); }

  async function saveAnswers() {
    setBusy(true);
    const r = await fetch(`/api/profiles/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name, handle: p.handle, answers: p.answers }) });
    setBusy(false);
    toast(r.ok ? "Answers saved" : "Could not save");
  }
  async function build() {
    setBusy(true);
    await fetch(`/api/profiles/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: p.name, handle: p.handle }) });
    const r = await fetch(`/api/profiles/${p.id}/build`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: p.answers }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Could not build the brief");
    setP((x) => ({ ...x, context: j.context }));
    toast("Your brief is ready. Every analysis now writes for you.");
    router.refresh();
  }
  async function saveContext() {
    setBusy(true);
    const r = await fetch(`/api/profiles/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context: p.context }) });
    setBusy(false);
    setEditContext(false);
    toast(r.ok ? "Brief saved" : "Could not save");
  }

  return (
    <>
      <div className="page-head">
        <div><div className="eyebrow">Who the intelligence layer writes for</div><h1>Your profile</h1></div>
        <div className="stats"><div className="stat"><b>{answered}/{total}</b><span>Answered</span></div><div className="stat"><b>{p.context.trim().length > 200 ? "Yes" : "No"}</b><span>Brief built</span></div></div>
      </div>
      <p className="hint" style={{ maxWidth: "62ch", marginTop: 8 }}>Answer in your own words. Nothing here is generic: the analysis, the angles and every brief are built from what you write below. The more specific you are, the less the output sounds like everyone else.</p>

      <div className="qs">
        <section>
          <h2>Basics</h2>
          <div className="grid2">
            <div className="q"><label htmlFor="pname">Name</label><input id="pname" value={p.name} onChange={(e) => setP((x) => ({ ...x, name: e.target.value }))} /></div>
            <div className="q"><label htmlFor="phandle">Main handle</label><input id="phandle" value={p.handle} onChange={(e) => setP((x) => ({ ...x, handle: e.target.value }))} placeholder="@handle" /></div>
          </div>
        </section>
        {QUESTIONNAIRE.map((s) => (
          <section key={s.section}>
            <h2>{s.section}</h2>
            {s.questions.map((q) => (
              <div className="q" key={q.key}>
                <label htmlFor={q.key}>{q.label}</label>
                <span className="help">{q.help}</span>
                {q.kind === "short" ? <input id={q.key} value={p.answers[q.key] || ""} onChange={(e) => set(q.key, e.target.value)} /> : <textarea id={q.key} value={p.answers[q.key] || ""} onChange={(e) => set(q.key, e.target.value)} style={q.kind === "list" ? { minHeight: 110 } : undefined} placeholder={q.kind === "list" ? "One per line" : ""} />}
              </div>
            ))}
          </section>
        ))}
        <section>
          <h2>The brief the intelligence layer uses</h2>
          <p className="hint">Generated from your answers. You can edit it by hand; rebuilding from answers replaces it.</p>
          {editContext ? (
            <>
              <textarea value={p.context} onChange={(e) => setP((x) => ({ ...x, context: e.target.value }))} style={{ minHeight: 400, border: "1px solid var(--rule-strong)", background: "var(--surface)", borderRadius: 4, padding: 12, width: "100%" }} />
              <div className="actions"><button className="btn sm" type="button" onClick={saveContext} disabled={busy}>Save brief</button><button className="btn quiet sm" type="button" onClick={() => setEditContext(false)}>Cancel</button></div>
            </>
          ) : (
            <>
              <div className="context-box">{p.context.trim() || "Not built yet. Answer the questions and press Build my brief."}</div>
              <div className="actions"><button className="btn quiet sm" type="button" onClick={() => setEditContext(true)}>Edit by hand</button></div>
            </>
          )}
        </section>
      </div>
      <div className="sticky-actions">
        <button className="btn quiet" type="button" onClick={saveAnswers} disabled={busy}>Save answers</button>
        <button className="btn primary" type="button" onClick={build} disabled={busy || answered < 6}>{busy ? "Working…" : "Build my brief from these answers"}</button>
        {answered < 6 ? <span className="hint">Answer at least six questions to build.</span> : null}
      </div>
    </>
  );
}
