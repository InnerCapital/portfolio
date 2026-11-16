"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { HOOK_BLURB, type HookType } from "@/lib/hooks";

/* The breakdown Library (Route A, Stage 4): every torn-down video in one
 * sortable, filterable grid, plus a one-tap "break down my top N" batch. Every
 * number shown is the real scraped metric or the stored craft score — nothing
 * is computed here. The serialized shape mirrors LibraryItem in
 * src/lib/breakdown.ts. */

export interface LibItem {
  id: string;
  platform: string;
  thumbnailUrl: string;
  caption: string;
  postedAt: string | null;
  creator: { id: string; name: string; handle: string; isSelf: boolean };
  analysing: boolean;
  scored: boolean;
  overall: number | null;
  panels: { area: string; score: number | null }[];
  performance: number | null;
  hookType: string;
  cutsPerMinute: number;
  durationSeconds: number;
  transcriptAvailable: boolean;
  verdict: string;
  percentile: number;
  likes: number;
  views: number;
  interactions: number;
  hookGroup: HookType;
}

const num = (n: number) => n.toLocaleString("en-GB");
function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
const MIN_PER_TYPE = 3;
const MIN_TOTAL = 6;

/* Which hook types over-index on this creator-set's best posts. Deterministic,
 * grounded in each video's real per-platform percentile — no model call. Scoped
 * to the You/Muses/All toggle, and honest about sample size. */
function HookInsights({ items, scopeLabel }: { items: LibItem[]; scopeLabel: string }) {
  const [open, setOpen] = useState(true);
  const scored = items.filter((i) => i.scored && !i.analysing);
  const baseMed = median(scored.map((i) => i.percentile));
  const rows = useMemo(() => {
    const groups = Array.from(new Set(scored.map((i) => i.hookGroup)));
    return groups.map((g) => {
      const xs = scored.filter((i) => i.hookGroup === g);
      const crafts = xs.map((i) => i.overall).filter((v): v is number => v !== null);
      const med = median(xs.map((i) => i.percentile));
      return {
        group: g,
        n: xs.length,
        medianPct: med,
        shareOver: Math.round((100 * xs.filter((i) => i.verdict === "over").length) / xs.length),
        avgCraft: crafts.length ? +(crafts.reduce((a, b) => a + b, 0) / crafts.length).toFixed(1) : null,
        lift: med - baseMed,
      };
    }).sort((a, b) => b.medianPct - a.medianPct);
  }, [scored, baseMed]);

  if (scored.length < MIN_TOTAL) {
    return (
      <section className="hook-ix thin">
        <h2>Which hooks over-index</h2>
        <p className="muted">Tear down a few more {scopeLabel} videos ({scored.length}/{MIN_TOTAL} scored) and this will show which hook types land on the best posts.</p>
      </section>
    );
  }

  const readable = rows.filter((r) => r.n >= MIN_PER_TYPE);
  const thin = rows.filter((r) => r.n < MIN_PER_TYPE);
  const top = readable.find((r) => r.lift >= 8 && r.group !== "Other");
  const maxPct = Math.max(100, ...readable.map((r) => r.medianPct));

  return (
    <section className="hook-ix">
      <button className="hook-ix-top" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="hook-ix-caret">{open ? "▾" : "▸"}</span>
        <h2>Which hooks over-index</h2>
      </button>
      <p className="hook-ix-lead">
        {top
          ? <>Your <b>{top.group}</b> hooks sit at the <b>{top.medianPct}th</b> percentile — above your {baseMed}th across all hooks ({top.n} videos).</>
          : <>Across {scored.length} {scopeLabel} videos your hooks sit around the {baseMed}th percentile. No single type clearly over-indexes yet.</>}
      </p>
      {open ? (
        <>
          <ul className="hook-rows">
            {readable.map((r) => (
              <li key={r.group} className="hook-row">
                <div className="hook-row-head">
                  <span className="hook-name">{r.group}</span>
                  <span className="muted small">{r.n} video{r.n === 1 ? "" : "s"}</span>
                  {r.lift !== 0 ? <span className={`hook-lift ${r.lift > 0 ? "up" : "down"}`}>{r.lift > 0 ? "+" : ""}{r.lift} pts</span> : null}
                </div>
                <div className="hook-bar" title={`Median ${r.medianPct}th percentile`}>
                  <i style={{ width: `${(r.medianPct / maxPct) * 100}%` }} />
                  <span className="hook-base" style={{ left: `${(baseMed / maxPct) * 100}%` }} title={`Your overall median: ${baseMed}th`} />
                </div>
                <div className="hook-row-nums muted small">
                  <span>{r.medianPct}th median</span>
                  <span>{r.shareOver}% over-performed</span>
                  {r.avgCraft !== null ? <span>craft {r.avgCraft}/10</span> : null}
                  <span className="hook-blurb">{HOOK_BLURB[r.group]}</span>
                </div>
              </li>
            ))}
          </ul>
          {thin.length ? <p className="muted small hook-thin">Too few to judge yet: {thin.map((r) => `${r.group} (${r.n})`).join(", ")}.</p> : null}
          <p className="muted small hook-caveat">Percentile is vs this account&rsquo;s own posts on each platform. Hook type is one factor among many, and small samples move fast — treat these as a lead, not a verdict.</p>
        </>
      ) : null}
    </section>
  );
}
const PANEL_ORDER = ["hook", "script", "sound", "visual", "packaging"];
const titleCase = (a: string) => a.charAt(0).toUpperCase() + a.slice(1);
function scoreClass(s: number | null): string {
  if (s === null) return "s-none";
  if (s >= 7) return "s-good";
  if (s >= 4) return "s-warn";
  return "s-bad";
}
function fmtDur(s: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60), r = Math.round(s % 60);
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${r}s`;
}
type Scope = "all" | "mine" | "muses";
type Sort = "overall" | "newest" | "performance" | "cadence" | "duration";
const SORTS: { k: Sort; label: string }[] = [
  { k: "overall", label: "Overall score" },
  { k: "performance", label: "Performance" },
  { k: "newest", label: "Newest" },
  { k: "cadence", label: "Cuts / min" },
  { k: "duration", label: "Longest" },
];

export default function LibraryView({ items, selfCreatorId }: { items: LibItem[]; selfCreatorId: string | null }) {
  const router = useRouter();
  const [scope, setScope] = useState<Scope>("all");
  const [platform, setPlatform] = useState("all");
  const [hook, setHook] = useState("all");
  const [verdict, setVerdict] = useState("all");
  const [sort, setSort] = useState<Sort>("overall");
  const [topN, setTopN] = useState(6);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");

  const analysingCount = items.filter((i) => i.analysing).length;
  // While a batch runs, poll so finished teardowns appear.
  useEffect(() => {
    if (analysingCount === 0) return;
    const t = setInterval(() => router.refresh(), 6000);
    return () => clearInterval(t);
  }, [analysingCount, router]);

  const scopedForHooks = useMemo(() => {
    if (scope === "mine") return items.filter((i) => i.creator.isSelf);
    if (scope === "muses") return items.filter((i) => !i.creator.isSelf);
    return items;
  }, [items, scope]);
  const scopeLabel = scope === "mine" ? "your" : scope === "muses" ? "muse" : "these";

  const platforms = useMemo(() => Array.from(new Set(items.map((i) => i.platform).filter(Boolean))).sort(), [items]);
  const hooks = useMemo(() => Array.from(new Set(items.map((i) => i.hookType).filter(Boolean))).sort(), [items]);

  const shown = useMemo(() => {
    let xs = items.slice();
    if (scope === "mine") xs = xs.filter((i) => i.creator.isSelf);
    if (scope === "muses") xs = xs.filter((i) => !i.creator.isSelf);
    if (platform !== "all") xs = xs.filter((i) => i.platform === platform);
    if (hook !== "all") xs = xs.filter((i) => i.hookType === hook);
    if (verdict !== "all") xs = xs.filter((i) => i.verdict === verdict);
    const by: Record<Sort, (a: LibItem, b: LibItem) => number> = {
      overall: (a, b) => (b.overall ?? -1) - (a.overall ?? -1),
      performance: (a, b) => b.percentile - a.percentile,
      newest: (a, b) => (b.postedAt ? Date.parse(b.postedAt) : 0) - (a.postedAt ? Date.parse(a.postedAt) : 0),
      cadence: (a, b) => b.cutsPerMinute - a.cutsPerMinute,
      duration: (a, b) => b.durationSeconds - a.durationSeconds,
    };
    return xs.sort(by[sort]);
  }, [items, scope, platform, hook, verdict, sort]);

  async function runBatch() {
    if (!selfCreatorId) return;
    setBusy(true); setErr(""); setNote("");
    try {
      const res = await fetch(`/api/creators/${selfCreatorId}/breakdown-batch`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ limit: topN }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Could not start the batch");
      setNote(j.queued > 0 ? `Queued ${j.queued} video${j.queued === 1 ? "" : "s"} — scoring now, this takes a few minutes.` : "Your top videos are all already torn down. Nothing new to queue.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lib-wrap">
      <header className="lib-head">
        <div>
          <h1>Breakdown library</h1>
          <p className="muted">Every video you&rsquo;ve torn down, scored against its own account. {items.length} in all{analysingCount ? ` · ${analysingCount} scoring now` : ""}.</p>
        </div>
        {selfCreatorId ? (
          <div className="lib-batch">
            <label className="lib-topn">Top
              <input type="number" min={1} max={24} value={topN} onChange={(e) => setTopN(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} />
            </label>
            <button className="btn primary sm" disabled={busy} onClick={runBatch}>{busy ? "Starting…" : "✦ Break down my top videos"}</button>
          </div>
        ) : null}
      </header>
      {note ? <p className="lib-msg">{note}</p> : null}
      {err ? <p className="danger small">{err}</p> : null}

      <div className="lib-filters">
        <div className="seg">
          {(["all", "mine", "muses"] as Scope[]).map((s) => (
            <button key={s} className={scope === s ? "on" : ""} onClick={() => setScope(s)}>{s === "all" ? "All" : s === "mine" ? "You" : "Muses"}</button>
          ))}
        </div>
        {platforms.length > 1 ? (
          <select value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Platform">
            <option value="all">All platforms</option>
            {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        ) : null}
        {hooks.length > 1 ? (
          <select value={hook} onChange={(e) => setHook(e.target.value)} aria-label="Hook type">
            <option value="all">Any hook</option>
            {hooks.map((h) => <option key={h} value={h}>{h} hook</option>)}
          </select>
        ) : null}
        <select value={verdict} onChange={(e) => setVerdict(e.target.value)} aria-label="Performance verdict">
          <option value="all">Any result</option>
          <option value="over">Over-performed</option>
          <option value="typical">Typical</option>
          <option value="under">Under-performed</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by" className="lib-sort">
          {SORTS.map((s) => <option key={s.k} value={s.k}>Sort: {s.label}</option>)}
        </select>
      </div>

      <HookInsights items={scopedForHooks} scopeLabel={scopeLabel} />

      {shown.length === 0 ? (
        <div className="lib-empty">
          <p className="muted">{items.length === 0 ? "No videos torn down yet. Use “Break down my top videos”, or open a post and analyse it." : "Nothing matches these filters."}</p>
        </div>
      ) : (
        <div className="lib-grid">
          {shown.map((i) => (
            <Link key={i.id} href={`/pieces/${i.id}`} className={`lib-card ${i.analysing ? "pending" : ""}`}>
              <div className="lib-thumb">
                {i.thumbnailUrl ? <img src={i.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="lib-thumb-ph" />}
                {i.analysing ? <span className="lib-chip pending">scoring…</span> : (
                  <span className={`lib-chip ${scoreClass(i.overall)}`}>{i.overall ?? "–"}<i>/10</i></span>
                )}
                <span className="lib-plat">{i.platform}</span>
              </div>
              <div className="lib-body">
                <div className="lib-meta">
                  <span className="lib-at">{i.creator.isSelf ? "You" : i.creator.handle}</span>
                  {i.hookType ? <span className="muted small">{i.hookType} hook</span> : null}
                </div>
                {i.caption ? <p className="lib-cap">{i.caption.slice(0, 90)}{i.caption.length > 90 ? "…" : ""}</p> : null}
                {!i.analysing ? (
                  <div className="lib-bars">
                    {PANEL_ORDER.map((area) => {
                      const s = i.panels.find((p) => p.area === area)?.score ?? null;
                      return <span key={area} className={`lib-bseg ${scoreClass(s)}`} title={`${titleCase(area)}: ${s ?? "–"}/10`} style={{ height: `${s !== null ? 4 + s * 1.8 : 4}px` }} />;
                    })}
                    <span className={`lib-bseg perf ${scoreClass(i.performance)}`} title={`Performance: ${i.performance ?? "–"}/10`} style={{ height: `${i.performance !== null ? 4 + i.performance * 1.8 : 4}px` }} />
                  </div>
                ) : null}
                <div className="lib-nums muted small">
                  {i.views > 0 ? <span>{num(i.views)} views</span> : <span>{num(i.likes)} likes</span>}
                  <span className={`pill ${i.verdict === "over" ? "v-over" : i.verdict === "under" ? "v-under" : i.verdict === "typical" ? "v-typical" : "v-insufficient"}`}>{i.percentile}th</span>
                  {i.cutsPerMinute ? <span>{i.cutsPerMinute} cuts/min</span> : null}
                  {i.durationSeconds ? <span>{fmtDur(i.durationSeconds)}</span> : null}
                  {!i.transcriptAvailable && !i.analysing ? <span className="muted">no transcript</span> : null}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
