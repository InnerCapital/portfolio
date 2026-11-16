"use client";
import { useState } from "react";

interface Analysis {
  stats: { likes: number; comments: number; views: number; postedAt: string | null } | null;
  frames: string[];
  keyComments: { text: string; username: string; likes: number }[];
  read: { summary: string; craft: string; caveats: string[] };
  teardown: { hookText: string; hookType: string; cutCount: number; cutsPerMinute: number; durationSeconds: number; onScreenText: string[]; transcriptAvailable: boolean } | null;
  caveats: string[];
}
interface Recreation {
  whatMakesItWork: string;
  pattern: { hook: string; structure: string; pacing: string };
  yourVersion: { angle: string; hook: string; beats: { beat: string; detail: string }[]; shotList: string[]; caption: string; productionNotes: string };
  pillar: string;
  caveats: string[];
}

const num = (x: number) => x.toLocaleString("en-GB");
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function SavedVideoPanel({ ideaId, url, platform, initialAnalysis, initialRecreation, initialAnalysing }: {
  ideaId: string; url: string; platform: string;
  initialAnalysis: Analysis | null; initialRecreation: Recreation | null; initialAnalysing: boolean;
}) {
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis);
  const [rec, setRec] = useState<Recreation | null>(initialRecreation);
  const [busy, setBusy] = useState<"" | "analyse" | "recreate">(initialAnalysing ? "analyse" : "");
  const [err, setErr] = useState("");

  async function run(kind: "analyse" | "recreate") {
    setBusy(kind); setErr("");
    try {
      const path = kind === "analyse" ? "analyse-video" : "recreate";
      const res = await fetch(`/api/ideas/${ideaId}/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Something went wrong");
      if (kind === "analyse") setAnalysis(j.analysis); else setRec(j.recreation);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(""); }
  }

  if (!url) return null;

  return (
    <div className="card sv-panel">
      <div className="sec-head"><h2>What's in this video</h2>
        {analysis && busy !== "analyse" ? <button className="btn quiet sm" disabled={!!busy} onClick={() => run("analyse")}>Re-analyse</button> : null}
      </div>

      {!analysis && busy !== "analyse" ? (
        <div className="sv-cta">
          <p className="hint">Pull this video's real numbers, its key comments, and a read of how it's shot, so you can see exactly what's going on and how to make your own.</p>
          <button className="btn primary" disabled={!!busy} onClick={() => run("analyse")}>✦ Analyse this video</button>
        </div>
      ) : null}

      {busy === "analyse" ? (
        <div className="sv-loading"><span className="reading-dot" />Pulling the numbers, comments and shot breakdown. This can take a couple of minutes.</div>
      ) : null}

      {err ? <div className="notice danger">{err}</div> : null}

      {analysis ? (
        <div className="sv-body">
          {analysis.frames.length ? (
            <div className="sv-frames">
              {analysis.frames.map((f, i) => <img key={i} src={f} alt="" referrerPolicy="no-referrer" loading="lazy" />)}
            </div>
          ) : null}

          {analysis.stats ? (
            <div className="sv-stats">
              <div className="sv-stat"><b>{num(analysis.stats.likes)}</b><span>likes</span></div>
              <div className="sv-stat"><b>{num(analysis.stats.comments)}</b><span>comments</span></div>
              {analysis.stats.views > 0 ? <div className="sv-stat"><b>{num(analysis.stats.views)}</b><span>views</span></div> : null}
              {analysis.stats.postedAt ? <div className="sv-stat"><b>{day(analysis.stats.postedAt)}</b><span>posted</span></div> : null}
            </div>
          ) : null}

          <div className="sv-read">
            <h3 className="h3">What's going on</h3>
            <p>{analysis.read.summary}</p>
            <h3 className="h3">How it's shot</h3>
            <p>{analysis.read.craft}</p>
            {analysis.teardown ? (
              <div className="sv-facts">
                {analysis.teardown.hookType ? <span className="chip">{analysis.teardown.hookType} hook</span> : null}
                {analysis.teardown.cutCount ? <span className="chip">{analysis.teardown.cutCount} cuts</span> : null}
                {analysis.teardown.durationSeconds ? <span className="chip">{analysis.teardown.durationSeconds}s</span> : null}
                {!analysis.teardown.transcriptAvailable ? <span className="chip muted-chip">no spoken transcript</span> : null}
              </div>
            ) : null}
            {analysis.teardown?.hookText ? <p className="sv-hook">Hook: "{analysis.teardown.hookText}"</p> : null}
          </div>

          {analysis.keyComments.length ? (
            <div className="sv-comments">
              <h3 className="h3">Key comments</h3>
              <ul className="plain">
                {analysis.keyComments.map((c, i) => (
                  <li key={i} className="sv-comment">
                    <span className="sv-c-text">"{c.text}"</span>
                    <span className="muted small">{c.username ? `@${c.username.replace(/^@/, "")}` : ""}{c.likes ? ` · ${num(c.likes)} likes` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {analysis.caveats.length ? <ul className="sv-caveats">{analysis.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}

          <div className="sv-recreate-head">
            <h3 className="h3">How to recreate it</h3>
            {!rec && busy !== "recreate" ? <button className="btn primary sm" disabled={!!busy} onClick={() => run("recreate")}>✦ Build me a recipe</button> : null}
            {rec && busy !== "recreate" ? <button className="btn quiet sm" disabled={!!busy} onClick={() => run("recreate")}>Rebuild</button> : null}
          </div>
          {busy === "recreate" ? <div className="sv-loading"><span className="reading-dot" />Reverse-engineering the pattern and writing your version.</div> : null}

          {rec ? (
            <div className="sv-rec">
              <p className="summary">{rec.whatMakesItWork}</p>
              <div className="sv-pattern">
                <div><span className="k">Hook pattern</span>{rec.pattern.hook}</div>
                <div><span className="k">Structure</span>{rec.pattern.structure}</div>
                <div><span className="k">Pacing</span>{rec.pattern.pacing}</div>
              </div>
              <div className="sv-yours">
                <h4>Your version{rec.pillar ? ` · Pillar ${rec.pillar}` : ""}</h4>
                <p className="sv-angle">{rec.yourVersion.angle}</p>
                <p className="sv-yhook"><span className="k">Your hook</span>{rec.yourVersion.hook}</p>
                <ol className="sv-beats">
                  {rec.yourVersion.beats.map((b, i) => <li key={i}><b>{b.beat}</b><span>{b.detail}</span></li>)}
                </ol>
                {rec.yourVersion.shotList.length ? (
                  <div className="sv-shots"><span className="k">Shot list</span><ul className="plain">{rec.yourVersion.shotList.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                ) : null}
                <p className="sv-cap"><span className="k">Caption</span>{rec.yourVersion.caption}</p>
                <p className="muted small">{rec.yourVersion.productionNotes}</p>
              </div>
              {rec.caveats.length ? <ul className="sv-caveats">{rec.caveats.map((c, i) => <li key={i}>{c}</li>)}</ul> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
