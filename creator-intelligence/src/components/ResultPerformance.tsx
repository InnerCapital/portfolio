"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Verdict = "over" | "typical" | "under" | "insufficient";
type EvidenceQuality = "none" | "thin" | "ok" | "strong";
interface Sentiment {
  distribution: { positive: number; negative: number; neutral: number; question: number; spam: number };
  positiveShare: number;
  surfaced: { quote: string; label: string; why: string }[];
  themes: { theme: string; example: string }[];
  sampleSize: number; evidenceQuality: EvidenceQuality; partial: boolean;
}
export interface LinkedPiece {
  id: string; url: string; caption: string; platform: string; postedAt: string | null;
  likes: number; comments: number; views: number; shares: number;
  engagementRate: number | null; interactions: number; percentile: number;
  verdict: Verdict; vsMedianPct: number; handle: string; sentiment: Sentiment | null;
}
export interface LinkablePiece { id: string; url: string; caption: string; platform: string; postedAt: string | null; likes: number; comments: number; views: number }

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(2)}%`);
const num = (x: number) => x.toLocaleString("en-GB");
const cap = (c: string) => (c ? (c.length > 80 ? c.slice(0, 80) + "…" : c) : "(no caption)");

function VerdictChip({ v }: { v: Verdict }) {
  const label = v === "over" ? "over-performing" : v === "under" ? "under-performing" : v === "typical" ? "typical" : "too few posts to judge";
  return <span className={`pill v-${v}`}>{label}</span>;
}

export default function ResultPerformance({ ideaId, linked, linkable, apifyReady }: { ideaId: string; linked: LinkedPiece[]; linkable: LinkablePiece[]; apifyReady: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [pick, setPick] = useState("");

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr("");
    try { await fn(); } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(""); }
  };
  const post = async (url: string, body: object) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
    return j;
  };

  const link = () => run("link", async () => { if (!pick) throw new Error("Pick one of your posts"); await post(`/api/ideas/${ideaId}/result`, { pieceId: pick }); setPick(""); router.refresh(); });
  const unlink = (pieceId: string) => run(`unlink-${pieceId}`, async () => { await post(`/api/ideas/${ideaId}/result`, { pieceId, unlink: true }); router.refresh(); });
  const analyse = (pieceId: string) => run(`an-${pieceId}`, async () => { await post(`/api/pieces/${pieceId}/analyse`, {}); router.refresh(); });

  return (
    <div className="measure" style={{ marginTop: 24 }}>
      <div className="card">
        <div className="sec-head"><h2>Published result</h2></div>
        <p className="hint">Attach the real post this idea became to see how it actually did: real numbers scraped via Apify, scored against your own baseline, with a link back to the post. Nothing here is estimated.</p>
        {err ? <div className="notice danger">{err}</div> : null}

        {linked.map((p) => (
          <div key={p.id} className="result-piece">
            <div className="piece-top">
              <a className="piece-cap" href={p.url} target="_blank" rel="noreferrer" title={p.caption}>{cap(p.caption)}</a>
              <VerdictChip v={p.verdict} />
            </div>
            <div className="stats" style={{ marginTop: 8 }}>
              <div className="stat"><div className="big">{num(p.likes)}</div><div className="label">likes</div></div>
              <div className="stat"><div className="big">{num(p.comments)}</div><div className="label">comments</div></div>
              {p.views > 0 ? <div className="stat"><div className="big">{num(p.views)}</div><div className="label">views</div></div> : null}
              {p.shares > 0 ? <div className="stat"><div className="big">{num(p.shares)}</div><div className="label">shares</div></div> : null}
              <div className="stat"><div className="big">{p.engagementRate !== null ? pct(p.engagementRate) : num(p.interactions)}</div><div className="label">{p.engagementRate !== null ? "engagement rate" : "interactions"}</div></div>
              <div className="stat"><div className="big">{p.percentile}th</div><div className="label">percentile vs your posts</div></div>
              <div className="stat"><div className="big">{p.vsMedianPct >= 0 ? "+" : ""}{p.vsMedianPct}%</div><div className="label">vs your median</div></div>
            </div>
            <div className="piece-nums" style={{ marginTop: 8 }}>
              <span>{p.handle}</span>
              <span>{p.postedAt ? new Date(p.postedAt).toLocaleDateString("en-GB") : "no date"}</span>
              <a className="muted small" href={p.url} target="_blank" rel="noreferrer">source ↗</a>
              <button className="btn quiet sm" disabled={!!busy} onClick={() => unlink(p.id)}>{busy === `unlink-${p.id}` ? "…" : "Unlink"}</button>
            </div>
            {p.sentiment && p.sentiment.sampleSize > 0 ? (
              <div className="sentiment">
                <div className="sent-head">
                  <span className="muted small">read {p.sentiment.sampleSize} comments</span>
                  <span className="muted small">{Math.round(p.sentiment.positiveShare * 100)}% positive (of non-spam)</span>
                </div>
                {p.sentiment.surfaced.slice(0, 4).map((c, i) => (
                  <div key={i} className="surf"><span className={`pill ${c.label}`}>{c.label}</span><span className="surf-quote">“{c.quote}”</span></div>
                ))}
                {p.sentiment.themes.length ? <div className="surf-themes">{p.sentiment.themes.map((t, i) => <span key={i} className="chip" title={t.example}>{t.theme}</span>)}</div> : null}
              </div>
            ) : (
              <button className="btn quiet sm" disabled={!!busy || !apifyReady} onClick={() => analyse(p.id)}>{busy === `an-${p.id}` ? "Scraping comments…" : `Analyse comments${p.comments ? ` (${num(p.comments)})` : ""}`}</button>
            )}
          </div>
        ))}

        {/* Linker */}
        {linkable.length ? (
          <div className="add-row" style={{ borderBottom: "none" }}>
            <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ flex: 1, minWidth: 220 }}>
              <option value="">Pick one of your posts…</option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>{p.postedAt ? new Date(p.postedAt).toLocaleDateString("en-GB") : "?"} · {cap(p.caption)} · {num(p.likes)}❤ {num(p.comments)}💬</option>
              ))}
            </select>
            <button className="btn primary sm" disabled={!!busy} onClick={link}>{busy === "link" ? "Linking…" : "Link as result"}</button>
          </div>
        ) : linked.length === 0 ? (
          <p className="hint">{apifyReady ? "None of your own posts are available to link yet. Go to Measure, set your account, and Refresh to pull your posts, then come back here." : "Set APIFY_TOKEN and refresh your account on Measure to pull your own posts, then link one here."}</p>
        ) : null}
      </div>
    </div>
  );
}
