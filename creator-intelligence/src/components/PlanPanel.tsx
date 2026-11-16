"use client";
import { useState } from "react";
import Link from "next/link";
import type { WeeklyPlan } from "@/lib/intelligence";
import { toast } from "./Toast";

export default function PlanPanel({ initial }: { initial: WeeklyPlan | null }) {
  const [plan, setPlan] = useState<WeeklyPlan | null>(initial);
  const [open, setOpen] = useState(Boolean(initial));
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const r = await fetch("/api/plan", { method: "POST" });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return toast(j.error || "Plan failed");
    setPlan(j); setOpen(true);
    toast("Plan ready");
  }

  return (
    <section className="plan">
      <div className="sec-head" style={{ paddingTop: 20 }}>
        <h3 className="h3" style={{ marginBottom: 0 }}>This week, from the bank</h3>
        <div className="actions">
          {plan ? <button className="btn quiet sm" type="button" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Show"}</button> : null}
          <button className="btn accent sm" type="button" onClick={run} disabled={busy}>{busy ? "Planning…" : plan ? "Plan again" : "Plan this week"}</button>
        </div>
      </div>
      {plan && open ? (
        <div className="plan-body">
          <p className="summary">{plan.readOfTheBank}</p>
          <ul className="plan-list">
            {plan.pieces.map((x, n) => (
              <li key={n}>
                <span className="day">{x.day}</span>
                <div>
                  <div className="pt"><Link href={`/ideas/${x.ideaId}`}>{x.ideaTitle}</Link> <span className="tag pillar">Pillar {x.pillar}</span> <span className="tag">{x.format}</span></div>
                  <div className="angle-line">{x.angle}</div>
                  <div className="why">{x.why}</div>
                  <div className="next">Next: {x.nextStep}</div>
                </div>
              </li>
            ))}
          </ul>
          {plan.gaps?.length ? <p className="hint">Gaps in the bank: {plan.gaps.join(" · ")}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
