"use client";
import type { Brief } from "@/lib/intelligence";
import { FORMAT_LABELS } from "@/lib/brand";
import { toast } from "./Toast";

function briefToText(b: Brief): string {
  const lines = [
    `${FORMAT_LABELS[b.format] || b.format} brief`,
    `Big idea: ${b.bigIdea}`,
    "",
    `For: ${b.identity?.whoItsFor}`,
    `Enemy: ${b.identity?.enemy}`,
    `Transformation: ${b.identity?.transformation}`,
    "",
    "Hooks:",
    ...(b.hooks || []).map((h, n) => `${n + 1}. ${h.line}${h.spoken ? `\n   Spoken: ${h.spoken}` : ""}${h.onScreen ? `\n   On screen: ${h.onScreen}` : ""}\n   Why: ${h.why}`),
    "",
    "Structure:",
    ...(b.structure || []).map((s) => `${s.timing ? `[${s.timing}] ` : ""}${s.beat}: ${s.detail}`),
    "",
    `Proof: ${(b.proof || []).join("; ")}`,
    `Objection handled: ${b.objectionHandled}`,
    `Tribe phrase: ${b.tribePhrase}`,
    `CTA: ${b.cta?.ask} (${b.cta?.whyItsTheSmallestStep})`,
    "",
    `Caption / copy notes: ${b.captionOrCopyNotes}`,
    `Production notes: ${b.productionNotes}`,
    `Pillar ${b.pillar}. ${b.whyItWorks}`,
    `Risks: ${(b.risks || []).join("; ")}`,
  ];
  return lines.join("\n");
}

export default function BriefView({ brief: b, onDelete }: { brief: Brief; onDelete: () => void }) {
  async function copy() {
    try { await navigator.clipboard.writeText(briefToText(b)); toast("Brief copied"); } catch { toast("Could not copy"); }
  }
  return (
    <div className="brief">
      <div className="actions">
        <span className="tag pillar">Pillar {b.pillar}</span>
        <span className="tag">{FORMAT_LABELS[b.format] || b.format}</span>
        <button className="btn quiet sm" type="button" onClick={copy}>Copy as text</button>
        <button className="btn quiet sm" type="button" onClick={onDelete}>Delete brief</button>
      </div>
      <p className="big">{b.bigIdea}</p>
      <div className="identity">
        <div><span className="label">Who it is for</span>{b.identity?.whoItsFor}</div>
        <div><span className="label">The enemy</span>{b.identity?.enemy}</div>
        <div><span className="label">Transformation</span>{b.identity?.transformation}</div>
      </div>
      <div><div className="h3">Hooks</div>
        <div className="hooks">
          {(b.hooks || []).map((h, n) => (
            <div className="hook-card" key={n}>
              <span className="line">{h.line}</span>
              {h.spoken ? <span className="sub">Spoken: {h.spoken}</span> : null}
              {h.onScreen ? <span className="sub">On screen: {h.onScreen}</span> : null}
              <span className="sub">Why: {h.why}</span>
            </div>
          ))}
        </div>
      </div>
      <div><div className="h3">Structure</div>
        <ul className="beats">
          {(b.structure || []).map((s, n) => (
            <li key={n}><span className="timing">{s.timing || n + 1}</span><span><span className="beat">{s.beat}</span><br /><span className="detail">{s.detail}</span></span></li>
          ))}
        </ul>
      </div>
      <div className="twocol">
        <div className="kv"><span className="label">Proof to include</span><ul className="plain">{(b.proof || []).map((x, n) => <li key={n}>{x}</li>)}</ul></div>
        <div className="kv"><span className="label">Objection handled</span><p>{b.objectionHandled}</p></div>
      </div>
      <div className="twocol">
        <div className="kv"><span className="label">Tribe phrase</span><p>{b.tribePhrase}</p></div>
        <div className="kv"><span className="label">Call to action</span><p>{b.cta?.ask}</p><p className="hint">{b.cta?.whyItsTheSmallestStep}</p></div>
      </div>
      <div className="kv"><span className="label">Caption and copy notes</span><p>{b.captionOrCopyNotes}</p></div>
      <div className="kv"><span className="label">Production notes</span><p>{b.productionNotes}</p></div>
      <div className="kv"><span className="label">Why it works</span><p>{b.whyItWorks}</p></div>
      {b.risks?.length ? <div className="kv"><span className="label">Watch out for</span><ul className="plain">{b.risks.map((x, n) => <li key={n}>{x}</li>)}</ul></div> : null}
    </div>
  );
}
