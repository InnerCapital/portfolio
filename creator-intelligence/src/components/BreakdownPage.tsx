"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/* Per-video breakdown PAGE (Route A, Stage 3). Renders a stored teardown in
 * full: the six scored panels with "what worked / what to improve", a cut-
 * cadence chart drawn straight from the real shot timing, the transcript,
 * on-screen text, the script beats, and the honest caveats. Everything here is
 * either a real scraped number or a stored model read — nothing is computed in
 * the browser. The serialized shape mirrors BreakdownView in src/lib/breakdown.ts. */

interface Shot { start: number; end: number; seconds: number; label: string; onScreen: string }
interface Beat { beat: string; start: number | null; end: number | null; description: string }
interface Panel { area: string; score: number | null; worked: string; improve: string }
interface Scores {
  panels: Panel[];
  performance: { score: number | null; verdict: string; note: string };
  overall: number | null;
  headline: string;
  caveats: string[];
  transcriptAvailable: boolean;
}
export interface BreakdownVM {
  piece: {
    id: string; url: string; platform: string; shortcode: string; caption: string;
    mediaType: string; thumbnailUrl: string; postedAt: string | null;
    likes: number; comments: number; views: number; shares: number;
  };
  creator: { id: string; name: string; handle: string; isSelf: boolean };
  metrics: {
    interactions: number; engagementRate: number | null; recorded: boolean;
    percentile: number; verdict: string; vsMedianPct: number;
    baselineN: number; baselineMetric: string; followers: number | null;
  };
  teardown: {
    analysed: boolean; analysedAt: string | null; analysing: boolean;
    scored: boolean; scoredAt: string | null; source: string;
    hookText: string; hookType: string; hookWhy: string;
    transcript: string; wpm: number; onScreenText: string[];
    cutCount: number; avgShotSeconds: number; cutsPerMinute: number; durationSeconds: number;
    shots: Shot[]; structure: Beat[]; scores: Scores | null;
  } | null;
}

const num = (n: number) => n.toLocaleString("en-GB");
const title = (a: string) => a.charAt(0).toUpperCase() + a.slice(1);
function scoreClass(s: number | null): string {
  if (s === null) return "s-none";
  if (s >= 7) return "s-good";
  if (s >= 4) return "s-warn";
  return "s-bad";
}
const PANEL_WHAT: Record<string, string> = {
  hook: "The first seconds — does it stop the scroll?",
  script: "The spoken structure and payoff.",
  sound: "Delivery, music, and audio hooks.",
  visual: "Framing, cuts, and on-screen text.",
  packaging: "Caption, thumbnail, and the promise.",
  performance: "How it actually did against this account.",
};
function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}
function verdictLabel(v: string): string {
  if (v === "over") return "Over-performed";
  if (v === "under") return "Under-performed";
  if (v === "typical") return "Typical";
  return "Too few posts to judge";
}

/** Cut-cadence timeline, drawn from the real shots. Each segment's width is its
 * true duration, and a tick sits at every cut, so clustering (rapid cutting) vs
 * long holds is visible at a glance. Drawn only when there is real shot timing. */
function CadenceChart({ shots, duration }: { shots: Shot[]; duration: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const span = Math.max(duration, shots[shots.length - 1]?.end ?? 0);
  if (!shots.length || span <= 0) return null;
  const W = 1000, H = 56, pad = 2;
  const x = (t: number) => pad + (t / span) * (W - pad * 2);
  return (
    <div className="bd-cadence">
      <svg viewBox={`0 0 ${W} ${H + 22}`} preserveAspectRatio="none" role="img" aria-label={`Cut cadence: ${shots.length} shots over ${fmtTime(span)}`}>
        {shots.map((s, i) => (
          <rect key={i} x={x(s.start)} y={pad} width={Math.max(1, x(s.end) - x(s.start) - 1)} height={H - pad * 2}
            rx={2} className={`bd-seg ${i % 2 ? "alt" : ""} ${hover === i ? "hot" : ""}`}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <title>{`Shot ${i + 1}: ${fmtTime(s.seconds)}${s.label ? ` — ${s.label}` : ""}`}</title>
          </rect>
        ))}
        {shots.slice(1).map((s, i) => <line key={`c${i}`} x1={x(s.start)} x2={x(s.start)} y1={0} y2={H} className="bd-cut" />)}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={Math.min(W - 18, Math.max(2, x(span * f)))} y={H + 16} className="bd-axis">{fmtTime(span * f)}</text>
        ))}
      </svg>
      <p className="bd-cadence-read">
        {shots.length} shots over {fmtTime(span)} · {shots.length > 0 ? `${(Math.round((shots.length / span) * 600) / 10)}` : "0"} cuts/min · avg shot {fmtTime(span / shots.length)}
        {hover !== null ? <span className="bd-cadence-hot"> — hovering shot {hover + 1}: {fmtTime(shots[hover].seconds)}{shots[hover].label ? `, ${shots[hover].label}` : ""}</span> : null}
      </p>
    </div>
  );
}

export default function BreakdownPage({ vm }: { vm: BreakdownVM }) {
  const router = useRouter();
  const { piece, creator, metrics, teardown } = vm;
  const [busy, setBusy] = useState<"" | "teardown" | "score">("");
  const [err, setErr] = useState("");
  const [showScript, setShowScript] = useState(false);

  async function call(kind: "teardown" | "score", force: boolean) {
    setBusy(kind); setErr("");
    try {
      const res = await fetch(`/api/pieces/${piece.id}/${kind}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "That did not complete");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const embedUrl =
    piece.platform === "TikTok" && piece.id ? `https://www.tiktok.com/embed/v2/${piece.id}` :
    piece.platform === "Instagram" && piece.shortcode ? `https://www.instagram.com/p/${piece.shortcode}/embed` :
    "";
  const scores = teardown?.scores ?? null;
  const panels = scores?.panels ?? [];
  const perf = scores?.performance ?? null;
  const posted = piece.postedAt ? new Date(piece.postedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

  return (
    <div className="bd-wrap">
      <div className="bd-top">
        <Link href="/measure" className="bd-back">← Back to Measure</Link>
        <div className="bd-crumb">
          <span className="at">{creator.handle}</span>
          <span className="chip">{piece.platform}</span>
          {posted ? <span className="muted small">{posted}</span> : null}
          {teardown?.source ? <span className="muted small" title={teardown.source}>source verified</span> : null}
        </div>
      </div>

      <div className="bd-grid">
        {/* Left: the video + its real numbers */}
        <aside className="bd-media">
          {embedUrl ? (
            <div className="bd-embed">
              <iframe src={embedUrl} title="Video" loading="lazy" allow="encrypted-media" referrerPolicy="no-referrer" />
            </div>
          ) : piece.thumbnailUrl ? (
            <a href={piece.url} target="_blank" rel="noreferrer" className="bd-poster">
              <img src={piece.thumbnailUrl} alt="" referrerPolicy="no-referrer" />
              <span className="bd-play">▶</span>
            </a>
          ) : <div className="bd-poster empty" />}
          {piece.url ? <a href={piece.url} target="_blank" rel="noreferrer" className="btn quiet sm bd-watch">Watch on {piece.platform} ↗</a> : null}

          <dl className="bd-facts">
            <div><dt>Likes</dt><dd>{num(piece.likes)}</dd></div>
            <div><dt>Comments</dt><dd>{num(piece.comments)}</dd></div>
            {piece.views > 0 ? <div><dt>Views</dt><dd>{num(piece.views)}</dd></div> : null}
            {piece.shares > 0 ? <div><dt>Shares</dt><dd>{num(piece.shares)}</dd></div> : null}
            {metrics.engagementRate !== null && metrics.recorded ? <div><dt>Eng. rate</dt><dd>{(metrics.engagementRate * 100).toFixed(2)}%</dd></div> : null}
            <div><dt>Percentile</dt><dd>{metrics.percentile}th</dd></div>
          </dl>
          <p className={`bd-verdict pill ${metrics.verdict === "over" ? "v-over" : metrics.verdict === "under" ? "v-under" : metrics.verdict === "typical" ? "v-typical" : "v-insufficient"}`}>
            {verdictLabel(metrics.verdict)}
            {metrics.verdict !== "insufficient" ? ` · ${metrics.vsMedianPct >= 0 ? "+" : ""}${metrics.vsMedianPct}% vs your ${piece.platform} median` : ""}
          </p>
          <p className="bd-base muted small">Judged against {metrics.baselineN} {piece.platform} post{metrics.baselineN === 1 ? "" : "s"} on {metrics.baselineMetric === "engagementRate" ? "engagement rate" : "interactions"}{metrics.followers ? `, ${num(metrics.followers)} followers` : ", follower count unknown"}.</p>
          {piece.caption ? <p className="bd-caption">{piece.caption.slice(0, 400)}{piece.caption.length > 400 ? "…" : ""}</p> : null}
        </aside>

        {/* Right: the teardown */}
        <section className="bd-main">
          {!teardown || !teardown.analysed ? (
            <div className="bd-empty">
              <h2>No teardown yet</h2>
              <p className="muted">Tear this video down to read its hook, cut cadence, on-screen text and transcript, then score six parts of the craft out of ten against this account&rsquo;s own numbers.</p>
              <button className="btn primary" disabled={!!busy} onClick={() => call("teardown", false)}>
                {busy === "teardown" ? "Analysing…" : "✦ Analyse this video"}
              </button>
              {err ? <p className="danger small">{err}</p> : null}
            </div>
          ) : (
            <>
              <header className="bd-head">
                <div className={`bd-overall ${scoreClass(scores?.overall ?? null)}`}>
                  <b>{scores?.overall ?? "–"}</b><span>/10</span>
                </div>
                <div>
                  {scores?.headline ? <p className="bd-headline">{scores.headline}</p> : <p className="muted">Scored, but no headline was returned.</p>}
                  <div className="bd-tags">
                    {teardown.hookType ? <span className="chip">{teardown.hookType} hook</span> : null}
                    {teardown.cutsPerMinute ? <span className="chip">{teardown.cutsPerMinute} cuts/min</span> : null}
                    {teardown.durationSeconds ? <span className="chip">{fmtTime(teardown.durationSeconds)}</span> : null}
                    {teardown.wpm ? <span className="chip">{teardown.wpm} wpm</span> : null}
                    {!scores?.transcriptAvailable ? <span className="chip muted-chip" title="No speech transcript was available">no transcript</span> : null}
                  </div>
                </div>
              </header>

              {/* Six panels with the real prose */}
              <div className="bd-panels">
                {panels.map((p) => (
                  <article key={p.area} className="bd-panel">
                    <div className="bd-panel-head">
                      <div><h3>{title(p.area)}</h3><span className="muted small">{PANEL_WHAT[p.area]}</span></div>
                      <div className={`bd-pscore ${scoreClass(p.score)}`}>{p.score ?? "–"}<i>/10</i></div>
                    </div>
                    <div className={`bd-bar ${scoreClass(p.score)}`}><i style={{ width: `${p.score !== null ? p.score * 10 : 0}%` }} /></div>
                    {p.worked ? <p className="bd-worked"><b>Worked:</b> {p.worked}</p> : null}
                    {p.improve ? <p className="bd-improve"><b>Improve:</b> {p.improve}</p> : null}
                  </article>
                ))}
                {perf ? (
                  <article className="bd-panel bd-panel-perf">
                    <div className="bd-panel-head">
                      <div><h3>Performance</h3><span className="muted small">{PANEL_WHAT.performance}</span></div>
                      <div className={`bd-pscore ${scoreClass(perf.score)}`}>{perf.score ?? "–"}<i>/10</i></div>
                    </div>
                    <div className={`bd-bar ${scoreClass(perf.score)}`}><i style={{ width: `${perf.score !== null ? perf.score * 10 : 0}%` }} /></div>
                    <p className="bd-worked">{perf.verdict === "insufficient" ? "Too few posts on this platform to score performance honestly." : `Deterministic, from its real ${perf.verdict} performance — the ${metrics.percentile}th percentile on this account. Not a model guess.`}</p>
                    {perf.note ? <p className="bd-improve muted">{perf.note}</p> : null}
                  </article>
                ) : null}
              </div>

              {/* Hook detail */}
              {teardown.hookText ? (
                <section className="bd-block">
                  <h3>The hook</h3>
                  <blockquote className="bd-hook">&ldquo;{teardown.hookText}&rdquo;</blockquote>
                  {teardown.hookWhy ? <p className="muted">{teardown.hookWhy}</p> : null}
                </section>
              ) : null}

              {/* Cut cadence */}
              {teardown.shots.length ? (
                <section className="bd-block">
                  <h3>Cut cadence</h3>
                  <CadenceChart shots={teardown.shots} duration={teardown.durationSeconds} />
                </section>
              ) : teardown.cutCount ? (
                <section className="bd-block">
                  <h3>Cut cadence</h3>
                  <p className="muted">{teardown.cutCount} cuts, {teardown.cutsPerMinute} cuts/min, avg shot {teardown.avgShotSeconds ? `${teardown.avgShotSeconds.toFixed(1)}s` : "—"}. Per-shot timing was not returned for this video, so the timeline is not drawn.</p>
                </section>
              ) : null}

              {/* Transcript + on-screen text */}
              <div className="bd-two">
                <section className="bd-block">
                  <h3>Transcript {scores?.transcriptAvailable ? <span className="muted small">· {teardown.wpm} wpm</span> : null}</h3>
                  {teardown.transcript ? <p className="bd-transcript">{teardown.transcript}</p> :
                    <p className="muted">No spoken transcript was available for this video. Script and sound were judged on structure only.</p>}
                </section>
                <section className="bd-block">
                  <h3>On-screen text</h3>
                  {teardown.onScreenText.length ? (
                    <ul className="bd-ost">{teardown.onScreenText.map((t, i) => <li key={i}>{t}</li>)}</ul>
                  ) : <p className="muted">None detected.</p>}
                </section>
              </div>

              {/* Script beats */}
              {teardown.structure.length ? (
                <section className="bd-block">
                  <button className="bd-toggle" onClick={() => setShowScript((s) => !s)} aria-expanded={showScript}>
                    {showScript ? "▾" : "▸"} Script structure ({teardown.structure.length} beats)
                  </button>
                  {showScript ? (
                    <ol className="bd-beats">
                      {teardown.structure.map((b, i) => (
                        <li key={i}>
                          <span className="bd-beat-name">{b.beat}{b.start !== null ? <i className="muted"> · {fmtTime(b.start)}{b.end !== null ? `–${fmtTime(b.end)}` : ""}</i> : null}</span>
                          {b.description ? <span className="bd-beat-desc">{b.description}</span> : null}
                        </li>
                      ))}
                    </ol>
                  ) : null}
                </section>
              ) : null}

              {/* Caveats */}
              {scores?.caveats?.length ? (
                <section className="bd-block bd-caveats">
                  <h3>What this read can and can&rsquo;t see</h3>
                  <ul>{scores.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </section>
              ) : null}

              {creator.isSelf ? (
                <div className="bd-actions">
                  <button className="btn quiet sm" disabled={!!busy} onClick={() => call("score", true)}>{busy === "score" ? "Re-scoring…" : "Re-score"}</button>
                  <button className="btn quiet sm" disabled={!!busy} onClick={() => call("teardown", true)}>{busy === "teardown" ? "Re-analysing…" : "Re-analyse"}</button>
                  {teardown.scoredAt ? <span className="muted small">Scored {new Date(teardown.scoredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span> : null}
                  {err ? <span className="danger small">{err}</span> : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
