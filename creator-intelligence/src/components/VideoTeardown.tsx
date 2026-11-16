"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* Per-post video teardown: trigger, the "analysing" experience while the
 * actor + scoring run, and the stored six-panel scorecard once it lands.
 * The overlay is cosmetic (the server gives no progress), but it names each
 * real stage and previews the six panels it will deliver, so the wait reads as
 * productive and the payoff is set up before it arrives. */

interface Teardown {
  scored: boolean;
  overall: number | null;
  panels: { area: string; score: number | null }[];
  performance: { score: number | null; verdict: string } | null;
  headline: string;
  caveats: string[];
  transcriptAvailable: boolean;
  hookType: string;
  hookPreview: string;
  cutsPerMinute: number;
  durationSeconds: number;
}

const PHASES = [
  "Pulling the frames",
  "Finding the hook",
  "Mapping the cuts",
  "Reading on-screen text",
  "Transcribing the audio",
  "Scoring the craft",
];
const PANELS = ["Hook", "Script", "Sound", "Visual", "Packaging", "Performance"];

function scoreClass(s: number | null): string {
  if (s === null) return "s-none";
  if (s >= 7) return "s-good";
  if (s >= 4) return "s-warn";
  return "s-bad";
}
const title = (a: string) => a.charAt(0).toUpperCase() + a.slice(1);

export default function VideoTeardown({ pieceId, thumbnailUrl, teardown, readOnly = false }: { pieceId: string; thumbnailUrl: string; teardown: Teardown | null; readOnly?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "teardown" | "score">("");
  const [err, setErr] = useState("");
  const [phase, setPhase] = useState(0);
  const [pctState, setPctState] = useState(6);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  // Advance the phases and the progress while a teardown runs. Progress eases
  // toward 95% and holds there until the real call resolves, then the card
  // swaps to the result on refresh.
  useEffect(() => {
    if (busy !== "teardown") { setPhase(0); setPctState(6); return; }
    const p = setInterval(() => setPhase((n) => Math.min(n + 1, PHASES.length - 1)), 2600);
    const g = setInterval(() => setPctState((v) => (v < 95 ? v + Math.max(1, Math.round((95 - v) / 12)) : v)), 650);
    timers.current = [p, g];
    return () => { clearInterval(p); clearInterval(g); };
  }, [busy]);

  async function callTeardown(force: boolean) {
    setBusy("teardown"); setErr(""); setPhase(0); setPctState(6);
    try {
      const res = await fetch(`/api/pieces/${pieceId}/teardown`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "The teardown could not complete");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }
  async function reScore() {
    setBusy("score"); setErr("");
    try {
      const res = await fetch(`/api/pieces/${pieceId}/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force: true }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Re-score failed");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  // Analysing overlay
  if (busy === "teardown") {
    return (
      <div className="vt-analyse" role="status" aria-live="polite">
        <div className="vt-scanner">
          {thumbnailUrl ? <img className="vt-frame" src={thumbnailUrl} alt="" referrerPolicy="no-referrer" /> : <span className="vt-frame empty" />}
          <span className="vt-grid" aria-hidden />
          <span className="vt-scan" aria-hidden />
          <span className="vt-reticle tl" aria-hidden /><span className="vt-reticle tr" aria-hidden />
          <span className="vt-reticle bl" aria-hidden /><span className="vt-reticle br" aria-hidden />
        </div>
        <div className="vt-readout">
          <div className="vt-phase"><span className="vt-tick" />{PHASES[phase]}<span className="vt-ellipsis">…</span></div>
          <div className="vt-meter"><span style={{ width: `${pctState}%` }} /></div>
          <div className="vt-wave" aria-hidden>{Array.from({ length: 16 }).map((_, i) => <i key={i} style={{ animationDelay: `${i * 70}ms` }} />)}</div>
          <div className="vt-ghosts">
            {PANELS.map((name, i) => (
              <span key={name} className={`vt-ghost ${i <= phase ? "lit" : ""}`}>{name}</span>
            ))}
          </div>
          <p className="vt-note">Reading this video frame by frame, then scoring six parts of the craft against your own numbers. Worth the ten seconds.</p>
        </div>
      </div>
    );
  }

  // Read-only (a muse's post): show nothing until the stored scorecard exists.
  if (readOnly && (!teardown || !teardown.scored)) return null;

  // No teardown yet: the call to action
  if (!teardown) {
    return (
      <div className="vt-cta">
        <button className="btn primary sm" onClick={() => callTeardown(false)}>✦ Analyse this video</button>
        <span className="hint">Tears the video down (hook, cuts, on-screen text, transcript) and scores six parts of the craft out of ten.</span>
        {err ? <span className="danger small">{err}</span> : null}
      </div>
    );
  }

  // Scorecard
  const craft = teardown.panels || [];
  const perf = teardown.performance;
  return (
    <div className="vt-card">
      <div className="vt-head">
        <div className={`vt-overall ${scoreClass(teardown.overall)}`}>
          <b>{teardown.overall ?? "–"}</b><span>/10</span>
        </div>
        <div className="vt-head-main">
          {teardown.headline ? <p className="vt-headline">{teardown.headline}</p> : null}
          <div className="vt-facts">
            {teardown.hookType ? <span className="chip">{teardown.hookType} hook</span> : null}
            {teardown.cutsPerMinute ? <span className="chip">{teardown.cutsPerMinute} cuts/min</span> : null}
            {teardown.durationSeconds ? <span className="chip">{teardown.durationSeconds}s</span> : null}
            {!teardown.transcriptAvailable ? <span className="chip muted-chip" title="No speech transcript was available for this video">no transcript</span> : null}
          </div>
        </div>
        <Link href={`/pieces/${pieceId}`} className="vt-more">Full breakdown →</Link>
      </div>

      <div className="vt-panels">
        {craft.map((p) => (
          <div key={p.area} className="vt-panel">
            <div className="vt-panel-top"><span>{title(p.area)}</span><b>{p.score ?? "–"}</b></div>
            <div className={`vt-bar ${scoreClass(p.score)}`}><i style={{ width: `${p.score !== null ? p.score * 10 : 0}%` }} /></div>
          </div>
        ))}
        {perf ? (
          <div className="vt-panel">
            <div className="vt-panel-top"><span>Performance</span><b>{perf.score ?? "–"}</b></div>
            <div className={`vt-bar ${scoreClass(perf.score)}`}><i style={{ width: `${perf.score !== null ? perf.score * 10 : 0}%` }} /></div>
            <span className="vt-panel-note">{perf.verdict === "insufficient" ? "too few posts to score" : `from its real ${perf.verdict} performance`}</span>
          </div>
        ) : null}
      </div>

      {teardown.hookPreview ? <p className="vt-hook">Hook: “{teardown.hookPreview}”</p> : null}
      {teardown.caveats.length ? <ul className="vt-caveats">{teardown.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}

      {!readOnly ? (
        <div className="vt-actions">
          <button className="btn quiet sm" disabled={!!busy} onClick={reScore}>{busy === "score" ? "Re-scoring…" : "Re-score"}</button>
          <button className="btn quiet sm" disabled={!!busy} onClick={() => callTeardown(true)}>Re-analyse</button>
          {err ? <span className="danger small">{err}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
