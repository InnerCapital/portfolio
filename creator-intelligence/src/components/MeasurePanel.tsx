"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import VideoTeardown from "./VideoTeardown";

/* Local, serialized shapes (kept here so this client file never imports the
 * server libs). They mirror src/lib/measure.ts and src/lib/intelligence.ts. */
type Verdict = "over" | "typical" | "under" | "insufficient";
type EvidenceQuality = "none" | "thin" | "ok" | "strong";
interface Sentiment {
  distribution: { positive: number; negative: number; neutral: number; question: number; spam: number };
  positiveShare: number;
  surfaced: { quote: string; label: string; why: string }[];
  themes: { theme: string; example: string }[];
  sampleSize: number;
  evidenceQuality: EvidenceQuality;
  partial: boolean;
}
interface Teardown {
  scored: boolean; overall: number | null;
  panels: { area: string; score: number | null }[];
  performance: { score: number | null; verdict: string } | null;
  headline: string; caveats: string[]; transcriptAvailable: boolean;
  hookType: string; hookPreview: string; cutsPerMinute: number; durationSeconds: number;
}
interface MPiece {
  id: string; url: string; caption: string; platform: string; mediaType: string; thumbnailUrl: string; postedAt: string | null;
  likes: number; comments: number; views: number; shares: number;
  engagementRate: number | null; interactions: number; recorded: boolean; percentile: number;
  verdict: Verdict; vsMedianPct: number; sentiment: Sentiment | null;
  read: string; suggestion: string; reading: boolean;
  teardown: Teardown | null;
}
const isVideoPiece = (p: MPiece) => /video|reel|tiktok|short/i.test(p.mediaType) || p.platform === "TikTok";
interface BatchInsight { summary: string; winnersShare: string[]; losersShare: string[]; recommendations: { action: string; evidence: string }[]; caveats: string[] }
interface Baseline { n: number; median: number; p25: number; p75: number; mean: number; metric: "engagementRate" | "interactions"; evidenceQuality: EvidenceQuality }
interface PlatformM { platform: string; followers: number | null; baseline: Baseline; count: number; recordedCount: number }
interface Growth { followerStart: number; followerEnd: number; followerDelta: number; followerPct: number | null; days: number; postsPerWeek: number | null; evidenceQuality: EvidenceQuality; note: string }
interface CMeasure { creatorId: string; handle: string; name: string; avatarUrl: string; platform: string; isSelf: boolean; followers: number | null; lastScrapedAt: string | null; baseline: Baseline; platforms: PlatformM[]; growth: Growth; pieces: MPiece[] }
interface Compare { handle: string; n: number; theirMedianRate: number | null; ratioVsSelf: number | null; evidenceQuality: EvidenceQuality; note: string }
interface Report { self: CMeasure | null; competitors: { measure: CMeasure; compare: Compare }[]; generatedAt: string }
interface Advice {
  summary: string;
  whatsWorking: { claim: string; evidence: string }[];
  whatsNot: { claim: string; evidence: string }[];
  recommendations: { action: string; rationale: string; expectedSignal: string; confidence: "low" | "medium" | "high" }[];
  steelman: string[];
  caveats: string[];
}
interface ThemeStat { theme: string; n: number; metric: "engagementRate" | "interactions"; median: number; indexPct: number; medianSaves: number; medianSaveRate: number | null; medianFollows: number; verdict: Verdict; evidenceQuality: EvidenceQuality }
interface ThemeBenchmark { metric: "engagementRate" | "interactions"; overallMedian: number; n: number; evidenceQuality: EvidenceQuality; themes: ThemeStat[] }
interface CreatorRow { id: string; handle: string; platform: string; isSelf: boolean; followers: number | null; pieces: number; lastScrapedAt: string | null; tiktokHandle: string; linkedinUrl: string }

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(2)}%`);
const num = (x: number) => x.toLocaleString("en-GB");
const ago = (iso: string | null) => {
  if (!iso) return "never";
  const h = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (h < 1) return "just now";
  if (h < 48) return `${Math.round(h)}h ago`;
  return `${Math.round(h / 24)}d ago`;
};
const EQ: Record<EvidenceQuality, string> = { none: "no data yet", thin: "only a little data", ok: "enough data", strong: "lots of data" };

function Badge({ q }: { q: EvidenceQuality }) {
  return <span className={`pill eq-${q}`} title="How sure we can be, based on how many real posts back this up (never guessed by the AI)">{EQ[q]}</span>;
}
function VerdictChip({ v }: { v: Verdict }) {
  const label = v === "over" ? "did better than usual" : v === "under" ? "did worse than usual" : v === "typical" ? "about usual" : "not enough posts yet";
  return <span className={`pill v-${v}`}>{label}</span>;
}

export default function MeasurePanel({ apifyReady, notionReady, creators, report, themes }: { apifyReady: boolean; notionReady: boolean; creators: CreatorRow[]; report: Report; themes: ThemeBenchmark | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState<string>("");
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [newHandle, setNewHandle] = useState("");
  const [newPlatform, setNewPlatform] = useState("Instagram");

  const self = report.self;
  const selfRow = creators.find((c) => c.isSelf);
  const hasSelf = Boolean(selfRow);
  const nextStep = !hasSelf
    ? "Add your account below, then tap “Set as mine” to start measuring."
    : self && self.pieces.length === 0
    ? "Tap “Force” on your account to pull a year of your posts across platforms."
    : self && !self.pieces.some((p) => p.teardown)
    ? "Pick a video below and tap “Analyse this video” to score its craft out of ten."
    : "";
  const [tt, setTt] = useState(selfRow?.tiktokHandle || "@maya.rivers");
  const [li, setLi] = useState(selfRow?.linkedinUrl || "https://www.linkedin.com/in/maya-rivers/");

  // While posts are being read in the background, poll so the reads appear.
  useEffect(() => {
    if (!self?.pieces.some((p) => p.reading)) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [self, router]);

  async function post(url: string, body?: object) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
    return json;
  }
  async function patch(url: string, body: object) {
    const res = await fetch(url, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Update failed");
  }
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setMsg("");
    try { await fn(); } catch (e) { setMsg(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(""); }
  };

  const refresh = (id: string, force = false) => run(`refresh-${id}`, async () => {
    const r = await post(`/api/creators/${id}/refresh`, { force });
    if (!r.scraped && r.reason) setMsg(r.reason);
    router.refresh();
  });
  const setSelf = (id: string) => run(`self-${id}`, async () => { await patch(`/api/creators/${id}`, { isSelf: true }); router.refresh(); });
  const addCompetitor = () => run("add", async () => {
    if (newHandle.trim().length < 2) throw new Error("Enter a handle");
    await post(`/api/creators`, { handle: newHandle.trim(), platform: newPlatform });
    setNewHandle(""); router.refresh();
  });
  const analysePiece = (id: string) => run(`piece-${id}`, async () => { await post(`/api/pieces/${id}/analyse`); router.refresh(); });
  const getAdvice = () => run("advise", async () => { const r = await post(`/api/measure/advise`); setAdvice(r.advice); });
  const importNotion = () => run("notion", async () => { const r = await post(`/api/notion/import-data`); setMsg(`Imported ${r.imported} posts from Notion Content Data.`); router.refresh(); });
  const clearImported = (id: string) => run(`clear-${id}`, async () => { const r = await post(`/api/creators/${id}/clear-imported`); setMsg(`Removed ${num(r.removed)} imported posts. Re-add any time with Import from Notion.`); router.refresh(); });
  const saveHandles = () => run("handles", async () => { if (!selfRow) return; await patch(`/api/creators/${selfRow.id}`, { tiktokHandle: tt.trim(), linkedinUrl: li.trim() }); setMsg("Saved your TikTok and LinkedIn. Hit Force to scrape them."); router.refresh(); });
  // Pull all pulls the MUSES only, never your own account (your account holds
  // a full year already and is refreshed on its own, not on a muse sweep).
  const pullAll = () => run("pullall", async () => {
    const muses = creators.filter((c) => !c.isSelf);
    let done = 0;
    for (const c of muses) {
      setMsg(`Pulling ${c.handle}… (${done}/${muses.length})`);
      try { await post(`/api/creators/${c.id}/refresh`, { force: true }); } catch { /* keep going */ }
      done++;
    }
    setMsg(`Pulled all ${muses.length} muses.`);
    router.refresh();
  });

  return (
    <div className="measure">
      <div className="page-head">
        <div><div className="eyebrow">Real numbers, no guesses</div><h1>Measure</h1></div>
      </div>

      {nextStep ? <div className="next-step"><span className="ns-k">Do this next</span><span>{nextStep}</span></div> : null}

      {!apifyReady ? (
        <div className="notice danger">Apify is not connected. Set <code>APIFY_TOKEN</code> on the server to pull real metrics. The page works, but no numbers can be scraped until then.</div>
      ) : null}
      {msg ? <div className="notice danger">{msg}</div> : null}

      {/* Muses carousel: a glance at who you learn from, with one-click pulls */}
      {report.competitors.length ? (
        <MuseCarousel
          competitors={report.competitors}
          busy={busy}
          apifyReady={apifyReady}
          onPull={(id) => refresh(id, true)}
          onPullAll={pullAll}
          count={creators.filter((c) => !c.isSelf).length}
        />
      ) : null}

      {/* Accounts & sources: a thin collapsed bar so the feed leads */}
      <details className="manage" open={!hasSelf}>
        <summary className="manage-sum">Manage accounts &amp; sources</summary>
      <div className="card">
        <div className="sec-head"><h2>Accounts</h2>
          {notionReady ? <button className="btn quiet sm" disabled={!!busy} onClick={importNotion} title="Import your Notion 'Maya Content Data' (Organic rows) as real posts, no scraping">{busy === "notion" ? "Importing…" : "Import from Notion"}</button> : null}
        </div>
        {notionReady ? <p className="hint">Import pulls your already-curated post metrics from Notion as real posts on your own account, so benchmarks work with no Apify or AI credits. Set your account first.</p> : null}
        {creators.length === 0 ? <p className="hint">No accounts yet. Add your own account below, then your muses.</p> : null}
        <ul className="plain acct-list">
          {creators.map((c) => (
            <li key={c.id} className="acct">
              <span className="at">{c.handle}</span>
              <span className="muted small">{c.platform}</span>
              {c.isSelf ? <span className="pill v-over">your account</span> : <span className="pill">muse</span>}
              <span className="muted small">{c.followers !== null ? `${num(c.followers)} followers` : "followers unknown"}</span>
              <span className="muted small">{c.pieces} posts · scraped {ago(c.lastScrapedAt)}</span>
              <span className="acct-actions">
                {!c.isSelf ? <button className="btn quiet sm" disabled={!!busy} onClick={() => setSelf(c.id)}>{busy === `self-${c.id}` ? "…" : "Set as mine"}</button> : null}
                <button className="btn sm" disabled={!!busy || !apifyReady} onClick={() => refresh(c.id)}>{busy === `refresh-${c.id}` ? "Scraping…" : "Refresh"}</button>
                <button className="btn quiet sm" disabled={!!busy || !apifyReady} title="Ignore the freshness window and scrape now" onClick={() => refresh(c.id, true)}>Force</button>
                {c.isSelf ? <button className="btn quiet sm" disabled={!!busy} title="Remove Notion-imported posts, keeping only live scraped ones (re-importable)" onClick={() => clearImported(c.id)}>{busy === `clear-${c.id}` ? "…" : "Clear imported"}</button> : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="add-row">
          <input placeholder="@handle" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} />
          <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
            <option>Instagram</option><option>TikTok</option>
          </select>
          <button className="btn primary sm" disabled={!!busy} onClick={addCompetitor}>{busy === "add" ? "Adding…" : "Add a muse"}</button>
        </div>
        {!hasSelf ? <p className="hint">Mark one account as yours with “Set as mine” so it becomes the main creator being measured.</p> : null}
        {hasSelf ? (
          <div className="add-row" style={{ borderBottom: "none" }}>
            <input placeholder="TikTok @handle" value={tt} onChange={(e) => setTt(e.target.value)} />
            <input placeholder="LinkedIn profile URL" value={li} onChange={(e) => setLi(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <button className="btn quiet sm" disabled={!!busy} onClick={saveHandles}>{busy === "handles" ? "Saving…" : "Save TikTok + LinkedIn"}</button>
          </div>
        ) : null}
        {hasSelf ? <p className="hint">Your account pulls a year of posts across Instagram, TikTok and LinkedIn on Refresh. LinkedIn is best-effort (it blocks scraping), so its data may be partial or missing.</p> : null}
      </div>
      </details>

      {/* Feed: your profile, performance and posts */}
      {self ? <SelfSection self={self} busy={busy} onAnalyse={analysePiece} /> : (
        <div className="empty">Open “Manage accounts &amp; sources” above, add your account and Refresh to see your feed.</div>
      )}

      {/* Muses: a main feature on the home page */}
      {report.competitors.length ? (
        <div className="card">
          <div className="sec-head"><h2>Muses</h2></div>
          <p className="hint">The creators you learn from. Their breakout posts (10,000+ likes or 500,000+ views) get broken down automatically, so you can see what made them work. Pull a muse to bring in a year of their posts.</p>
          <div className="add-row" style={{ borderBottom: "none", paddingBottom: 4 }}>
            <input placeholder="Add a muse @handle" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} />
            <select value={newPlatform} onChange={(e) => setNewPlatform(e.target.value)}>
              <option>Instagram</option><option>TikTok</option>
            </select>
            <button className="btn primary sm" disabled={!!busy} onClick={addCompetitor}>{busy === "add" ? "Adding…" : "Add muse"}</button>
          </div>
          <ul className="plain">
            {report.competitors.map(({ measure, compare }) => {
              const outliers = measure.pieces.filter((p) => p.likes >= 10000 || p.views >= 500000);
              const analysed = outliers.filter((p) => p.teardown?.scored).length;
              return (
                <li key={measure.creatorId} className="muse">
                  <div className="bench-row">
                    <span className="at">{compare.handle}</span>
                    <span className="muted small">{measure.followers !== null ? `${num(measure.followers)} followers` : "followers unknown"}</span>
                    <span className="muted small">they usually get {compare.theirMedianRate !== null ? `${pct(compare.theirMedianRate)} engagement` : "too little data to tell"}</span>
                    {compare.ratioVsSelf !== null ? (
                      <span className={`pill ${compare.ratioVsSelf >= 1 ? "v-over" : "v-under"}`}>
                        you get {compare.ratioVsSelf.toFixed(2)}× their engagement
                      </span>
                    ) : <span className="pill v-insufficient">not enough to compare yet</span>}
                    <Badge q={compare.evidenceQuality} />
                    {compare.note ? <span className="muted small">{compare.note}</span> : null}
                    <button className="btn quiet sm" style={{ marginLeft: "auto" }} disabled={!!busy || !apifyReady} onClick={() => refresh(measure.creatorId)}>{busy === `refresh-${measure.creatorId}` ? "Scraping…" : measure.lastScrapedAt ? "Refresh" : "Pull posts"}</button>
                  </div>
                  {outliers.length ? <MuseOutliers outliers={outliers} analysed={analysed} /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Themes */}
      {themes && themes.themes.length ? <ThemesSection tb={themes} /> : null}

      {/* Growth advice */}
      <div className="card">
        <div className="sec-head"><h2>Growth advice</h2>
          <button className="btn primary sm" disabled={!!busy || !self} onClick={getAdvice}>{busy === "advise" ? "Reading the numbers…" : "Generate from the numbers"}</button>
        </div>
        <p className="hint">Built only from the measured numbers above. Each point cites a figure, every conclusion carries its own counter-argument, and low-evidence areas are flagged rather than dressed up.</p>
        {advice ? <AdviceView a={advice} /> : <p className="hint">No advice generated yet. This is the only step that spends model credits.</p>}
      </div>
    </div>
  );
}

function MuseCarousel({ competitors, busy, apifyReady, onPull, onPullAll, count }: {
  competitors: { measure: CMeasure; compare: Compare }[];
  busy: string; apifyReady: boolean;
  onPull: (id: string) => void; onPullAll: () => void; count: number;
}) {
  const pulling = busy === "pullall";
  return (
    <div className="muse-carousel-wrap">
      <div className="mc-head">
        <h2>Your muses</h2>
        <button className="btn primary sm" disabled={!!busy || !apifyReady} onClick={onPullAll}>
          {pulling ? "Pulling muses…" : `Pull all ${count} muses`}
        </button>
      </div>
      <div className="muse-carousel">
        {competitors.map(({ measure, compare }) => {
          // 1–2 freshest posts to show as a rotating peek (newest first).
          const peek = [...measure.pieces]
            .sort((a, b) => (new Date(b.postedAt || 0).getTime()) - (new Date(a.postedAt || 0).getTime()))
            .slice(0, 2);
          const outliers = measure.pieces.filter((p) => p.likes >= 10000 || p.views >= 500000).length;
          const initial = (measure.name || compare.handle).replace(/^@/, "").slice(0, 1).toUpperCase() || "?";
          const isPulling = busy === `refresh-${measure.creatorId}`;
          return (
            <div key={measure.creatorId} className="mc-card">
              <div className="mc-top">
                {measure.avatarUrl ? <img className="mc-avatar" src={measure.avatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="mc-avatar initial">{initial}</span>}
                <div className="mc-id">
                  <span className="mc-handle">{compare.handle}</span>
                  <span className="muted small">{measure.followers !== null ? `${num(measure.followers)} followers` : measure.pieces.length ? `${measure.pieces.length} posts` : "not pulled yet"}</span>
                </div>
              </div>
              {peek.length ? (
                <div className="mc-peek">
                  {peek.map((p) => (
                    <a key={p.id} href={p.url} target="_blank" rel="noreferrer" title={p.caption} className="mc-thumb">
                      {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="mc-thumb-ph" />}
                    </a>
                  ))}
                </div>
              ) : <div className="mc-peek empty"><span className="muted small">Pull to see their posts</span></div>}
              <div className="mc-foot">
                {outliers > 0 ? <span className="pill v-over">{outliers} breakout{outliers === 1 ? "" : "s"}</span> : <span className="muted small">no breakout posts yet</span>}
                <button className="btn quiet sm" disabled={!!busy || !apifyReady} onClick={() => onPull(measure.creatorId)}>{isPulling ? "Pulling…" : measure.lastScrapedAt ? "Refresh" : "Pull"}</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MuseOutliers({ outliers, analysed }: { outliers: MPiece[]; analysed: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const openPiece = open ? outliers.find((p) => p.id === open) || null : null;
  return (
    <div className="muse-outliers">
      <div className="muse-out-head"><b>{outliers.length} breakout post{outliers.length === 1 ? "" : "s"}</b> <span className="muted small">10,000+ likes or 500,000+ views · {analysed} broken down{analysed < outliers.length ? `, ${outliers.length - analysed} still going` : ""}. Tap a post to see its breakdown.</span></div>
      <div className="muse-out-grid">
        {outliers.slice(0, 8).map((p) => {
          const isOpen = open === p.id;
          return (
            <button type="button" key={p.id} className={`muse-out ${isOpen ? "open" : ""}`} onClick={() => setOpen(isOpen ? null : p.id)} title={p.caption} aria-expanded={isOpen}>
              {p.thumbnailUrl ? <img src={p.thumbnailUrl} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="muse-out-ph" />}
              <span className="muse-out-meta">
                {p.teardown?.scored ? (
                  <span className={`pill ${p.teardown.overall !== null && p.teardown.overall >= 7 ? "v-over" : p.teardown.overall !== null && p.teardown.overall < 4 ? "v-under" : "v-typical"}`}>{p.teardown.overall ?? "–"}/10</span>
                ) : <span className="pill v-insufficient">analysing…</span>}
                <span className="muted small">{num(p.likes)} likes{p.views > 0 ? ` · ${num(p.views)} views` : ""}</span>
                {p.teardown?.hookType ? <span className="muted small">{p.teardown.hookType} hook</span> : null}
              </span>
            </button>
          );
        })}
      </div>
      {openPiece ? (
        <div className="muse-breakdown">
          <a className="muted small" href={openPiece.url} target="_blank" rel="noreferrer">Open post on Instagram ↗</a>
          {openPiece.teardown?.scored
            ? <VideoTeardown pieceId={openPiece.id} thumbnailUrl={openPiece.thumbnailUrl} teardown={openPiece.teardown} readOnly />
            : <p className="hint reading">Still analysing this post. Its breakdown appears here once scoring lands.</p>}
        </div>
      ) : null}
    </div>
  );
}

function ThemesSection({ tb }: { tb: ThemeBenchmark }) {
  const metricLabel = tb.metric === "engagementRate" ? "engagement" : "likes and comments";
  const val = (x: number) => (tb.metric === "engagementRate" ? pct(x) : num(x));
  return (
    <div className="card">
      <div className="sec-head"><h2>Topics · what works best</h2></div>
      <p className="hint">Your posts grouped by the topic you tag in Notion, with the ones that usually do best on top. We only say a topic does better or worse once it has at least five posts; topics with fewer are shown but not ranked, so nothing looks more certain than it is.{tb.metric === "interactions" ? " We don't have a follower count here yet, so topics are compared on likes and comments instead." : ""}</p>
      <div className="stats" style={{ marginBottom: 10 }}>
        <div className="stat"><div className="big">{val(tb.overallMedian)}</div><div className="label">your typical {metricLabel}</div></div>
        <div className="stat"><div className="big">{tb.n}</div><div className="label">posts with a topic <Badge q={tb.evidenceQuality} /></div></div>
      </div>
      <ul className="plain">
        {tb.themes.map((t) => (
          <li key={t.theme} className="bench-row">
            <span className="at">{t.theme}</span>
            <VerdictChip v={t.verdict} />
            <span className="muted small">{t.n} posts</span>
            <Badge q={t.evidenceQuality} />
            <span className="muted small">usually gets {val(t.median)} {metricLabel}</span>
            <span className={`pill ${t.indexPct >= 0 ? "v-over" : "v-under"}`}>{t.indexPct >= 0 ? "+" : ""}{t.indexPct}% vs your average</span>
            <span className="muted small">{num(t.medianSaves)} saves</span>
            {t.medianSaveRate !== null ? <span className="muted small">{t.medianSaveRate}% saved it</span> : null}
            <span className="muted small">{num(t.medianFollows)} new follows a post</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function InstagramLogo() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Instagram" style={{ verticalAlign: "-2px" }}>
      <rect x="3" y="3" width="18" height="18" rx="5.2" /><circle cx="12" cy="12" r="3.6" /><circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function SelfSection({ self, busy, onAnalyse }: { self: CMeasure; busy: string; onAnalyse: (id: string) => void }) {
  const platforms: PlatformM[] = self.platforms && self.platforms.length
    ? self.platforms
    : [{ platform: self.platform || "Instagram", followers: self.followers, baseline: self.baseline, count: self.pieces.length, recordedCount: self.pieces.filter((p) => p.recorded).length }];
  const [tab, setTab] = useState(platforms[0].platform);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [limit, setLimit] = useState(9);
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [batch, setBatch] = useState<BatchInsight | null>(null);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchErr, setBatchErr] = useState("");
  async function runBatch() {
    if (selected.size < 2) return;
    setBatchBusy(true); setBatchErr(""); setBatch(null);
    try {
      const res = await fetch("/api/measure/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pieceIds: [...selected] }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Batch analysis failed");
      setBatch(j.insight);
    } catch (e) { setBatchErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBatchBusy(false); }
  }
  const active = platforms.find((p) => p.platform === tab) || platforms[0];
  const isPrimary = active.platform === platforms[0].platform;
  const b = active.baseline;
  const g = self.growth;
  const metricLabel = b.metric === "engagementRate" ? "engagement" : "likes and comments";
  const medianText = b.metric === "engagementRate" ? pct(b.median) : num(b.median);
  const shown = self.pieces.filter((p) => p.platform === active.platform);
  const viewsOnly = active.count - active.recordedCount;
  const isIg = /instagram/i.test(self.platform);
  const initial = (self.name || self.handle).replace(/^@/, "").slice(0, 1).toUpperCase() || "?";
  return (
    <div className="card">
      <div className="self-head">
        {self.avatarUrl ? (
          <img className="self-avatar" src={self.avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : <span className="self-avatar initial">{initial}</span>}
        <div className="self-id">
          {self.name ? <div className="self-name">{self.name}</div> : null}
          <div className="self-handle">{isIg ? <InstagramLogo /> : null} {self.handle}</div>
        </div>
        <span className="muted small" style={{ marginLeft: "auto" }}>your performance</span>
      </div>

      {platforms.length > 1 ? (
        <div className="platform-tabs" role="tablist" aria-label="Platform">
          {platforms.map((p) => (
            <button key={p.platform} role="tab" aria-selected={p.platform === active.platform}
              className={`ptab ${p.platform === active.platform ? "on" : ""}`} onClick={() => setTab(p.platform)}>
              {p.platform}<span className="ptab-n">{p.count}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="stats">
        <div className="stat"><div className="big">{active.followers !== null ? num(active.followers) : "–"}</div><div className="label">{active.platform} followers</div></div>
        <div className="stat"><div className="big">{active.recordedCount}</div><div className="label">posts we could measure <Badge q={b.evidenceQuality} /></div></div>
        <div className="stat"><div className="big">{b.n ? medianText : "–"}</div><div className="label">typical {metricLabel}</div></div>
        {isPrimary ? (
          <>
            <div className="stat"><div className="big">{g.followerDelta >= 0 ? "+" : ""}{num(g.followerDelta)}</div><div className="label">new followers {g.followerPct !== null ? `(last ${g.days} days)` : ""}</div></div>
            <div className="stat"><div className="big">{g.postsPerWeek ?? "–"}</div><div className="label">posts a week</div></div>
          </>
        ) : null}
      </div>

      {b.n === 0 ? (
        <p className="hint">Not enough {active.platform} posts we could fully measure yet.{viewsOnly > 0 ? ` ${viewsOnly} ${active.platform} post${viewsOnly === 1 ? "" : "s"} came in with view counts but no likes or comments, so ${viewsOnly === 1 ? "it is" : "they are"} shown below but can't be scored.` : ""}</p>
      ) : (
        <p className="hint">
          Compared with your own {active.recordedCount} {active.platform} post{active.recordedCount === 1 ? "" : "s"} we could fully measure. A typical one gets {medianText} {metricLabel}{active.followers === null ? " (no follower count here yet, so these are compared on likes and comments instead)" : ""}.{viewsOnly > 0 ? ` ${viewsOnly} more post${viewsOnly === 1 ? "" : "s"} had view counts but no likes or comments, so ${viewsOnly === 1 ? "it is" : "they are"} shown but not scored.` : ""}
        </p>
      )}
      {g.note && isPrimary ? <p className="hint">{g.note}</p> : null}

      {shown.length === 0 ? <p className="hint">No {active.platform} posts pulled in yet. Hit Refresh on your account above.</p> : (
        <>
        {selected.size > 0 ? (
          <div className="batch-bar">
            <span className="muted small">{selected.size} selected</span>
            <button className="btn primary sm" disabled={batchBusy || selected.size < 2} onClick={runBatch}>{batchBusy ? "Analysing the group…" : "Analyse together"}</button>
            <button className="btn quiet sm" onClick={() => { setSelected(new Set()); setBatch(null); }}>Clear</button>
          </div>
        ) : <p className="hint">Tick a few posts to look at them together, or tap one to open it.</p>}
        {batchErr ? <div className="notice danger">{batchErr}</div> : null}
        {batch ? <BatchInsightView b={batch} count={selected.size} /> : null}
        <ul className="plain piece-list grid">
          {shown.slice(0, limit).map((p) => {
            const isOpen = open.has(p.id);
            const hasInsight = Boolean(p.read || p.teardown || p.sentiment || p.reading);
            return (
            <li key={p.id} className={`piece ${isOpen ? "open" : ""}`}>
              <div className="piece-head" role="button" tabIndex={0} aria-expanded={isOpen}
                onClick={() => toggle(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(p.id); } }}>
                <input type="checkbox" className="piece-check" checked={selected.has(p.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleSel(p.id)} aria-label="Select for group analysis" />
                {p.thumbnailUrl ? (
                  <img className="piece-thumb" src={p.thumbnailUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
                ) : <span className="piece-thumb empty" aria-hidden />}
                <div className="piece-main">
                  <div className="piece-top">
                    <span className="piece-cap" title={p.caption}>{p.caption ? p.caption.slice(0, 80) : "(no caption)"}{p.caption.length > 80 ? "…" : ""}</span>
                    {p.recorded ? <VerdictChip v={p.verdict} /> : <span className="pill v-insufficient" title="We got a view count for this one but no likes or comments, so we can't score its engagement">views only</span>}
                  </div>
                  <div className="piece-nums">
                    <span>{p.postedAt ? new Date(p.postedAt).toLocaleDateString("en-GB") : "no date"}</span>
                    <span>{num(p.likes)} likes</span>
                    <span>{num(p.comments)} comments</span>
                    {p.views > 0 ? <span>{num(p.views)} views</span> : null}
                    {p.recorded ? <span>{p.engagementRate !== null ? `${pct(p.engagementRate)} engagement` : `${num(p.interactions)} likes + comments`}</span> : null}
                    {p.recorded ? <span className="muted">beats {p.percentile}% of your posts</span> : null}
                    {p.teardown?.scored ? <span className="pill v-typical">craft score {p.teardown.overall ?? "–"}/10</span> : null}
                  </div>
                </div>
                <span className="piece-caret" aria-hidden>{hasInsight || isVideoPiece(p) ? (isOpen ? "▾" : "▸") : ""}</span>
              </div>
              {isOpen ? (
                <div className="piece-detail">
                  <a className="muted small" href={p.url} target="_blank" rel="noreferrer">Open post ↗</a>
                  {p.read ? (
                    <div className="piece-read">
                      <p className="read-line">{p.read}</p>
                      {p.suggestion ? <p className="read-suggest"><span className="try">Try</span> {p.suggestion}</p> : null}
                    </div>
                  ) : p.reading ? <p className="hint reading">Reading this post…</p> : null}
                  {isVideoPiece(p) ? <VideoTeardown pieceId={p.id} thumbnailUrl={p.thumbnailUrl} teardown={p.teardown} /> : null}
                  {p.sentiment ? <SentimentView s={p.sentiment} /> : (
                    <button className="btn quiet sm" disabled={!!busy} onClick={() => onAnalyse(p.id)}>{busy === `piece-${p.id}` ? "Scraping comments…" : `Analyse comments${p.comments ? ` (${num(p.comments)})` : ""}`}</button>
                  )}
                </div>
              ) : null}
            </li>
            );
          })}
        </ul>
        {shown.length > limit ? (
          <button className="btn quiet sm" style={{ marginTop: 12 }} onClick={() => setLimit((l) => l + 9)}>Show 9 more ({shown.length - limit} left)</button>
        ) : null}
        </>
      )}
    </div>
  );
}

function BatchInsightView({ b, count }: { b: BatchInsight; count: number }) {
  const [pushing, setPushing] = useState(false);
  const [pushed, setPushed] = useState(false);
  const [err, setErr] = useState("");
  async function push() {
    setPushing(true); setErr("");
    try {
      const text = `From ${count} posts. ${b.summary} Winners share: ${b.winnersShare.join("; ")}. Weak posts share: ${b.losersShare.join("; ")}. Do: ${b.recommendations.map((r) => r.action).join("; ")}.`;
      const res = await fetch("/api/profile/push-insight", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, source: "batch analysis" }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Push failed");
      setPushed(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setPushing(false); }
  }
  return (
    <div className="batch-insight">
      <p className="summary">{b.summary}</p>
      <div className="grid2">
        <div><h3 className="h3">Winners share</h3><ul className="plain">{b.winnersShare.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        <div><h3 className="h3">Weak posts share</h3><ul className="plain">{b.losersShare.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
      </div>
      <h3 className="h3">Do next</h3>
      <ul className="plain">{b.recommendations.map((r, i) => <li key={i} className="claim"><b>{r.action}</b><span className="muted small">{r.evidence}</span></li>)}</ul>
      {b.caveats.length ? <p className="hint">{b.caveats.join(" ")}</p> : null}
      <div className="actions">
        <button className="btn primary sm" disabled={pushing || pushed} onClick={push}>{pushed ? "Pushed to Ideas Bank ✓" : pushing ? "Pushing…" : "Push to Ideas Bank"}</button>
        {err ? <span className="danger small">{err}</span> : null}
      </div>
    </div>
  );
}

function SentimentView({ s }: { s: Sentiment }) {
  const d = s.distribution;
  const total = d.positive + d.negative + d.neutral + d.question;
  const w = (x: number) => (total > 0 ? `${(x / total) * 100}%` : "0%");
  if (s.sampleSize === 0) return <p className="hint">No comments on this post to read.</p>;
  return (
    <div className="sentiment">
      <div className="sent-head">
        <span className="muted small">read {s.sampleSize} comments</span>
        <Badge q={s.evidenceQuality} />
        {s.partial ? <span className="pill v-insufficient" title="The model returned fewer labels than comments; counts are partial">partial</span> : null}
        <span className="muted small">{Math.round(s.positiveShare * 100)}% positive (of non-spam)</span>
      </div>
      <div className="sent-bar">
        <span className="seg pos" style={{ width: w(d.positive) }} title={`positive ${d.positive}`} />
        <span className="seg neu" style={{ width: w(d.neutral) }} title={`neutral ${d.neutral}`} />
        <span className="seg qst" style={{ width: w(d.question) }} title={`question ${d.question}`} />
        <span className="seg neg" style={{ width: w(d.negative) }} title={`negative ${d.negative}`} />
      </div>
      {s.surfaced.length ? (
        <ul className="plain surfaced">
          {s.surfaced.map((c, i) => (
            <li key={i} className={`surf ${c.label}`}>
              <span className="pill">{c.label}</span>
              <span className="surf-quote">“{c.quote}”</span>
              {c.why ? <span className="muted small">{c.why}</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className="hint">No standout comments surfaced.</p>}
      {s.themes.length ? (
        <div className="surf-themes">{s.themes.map((t, i) => <span key={i} className="chip" title={t.example}>{t.theme}</span>)}</div>
      ) : null}
    </div>
  );
}

function AdviceView({ a }: { a: Advice }) {
  const Conf = ({ c }: { c: "low" | "medium" | "high" }) => <span className={`pill conf-${c}`}>{c} confidence</span>;
  return (
    <div className="advice">
      <p className="summary">{a.summary}</p>
      <div className="grid2">
        <div>
          <h3 className="h3">What is working</h3>
          <ul className="plain">{a.whatsWorking.map((x, i) => <li key={i} className="claim"><b>{x.claim}</b><span className="muted small">{x.evidence}</span></li>)}</ul>
        </div>
        <div>
          <h3 className="h3">What is not</h3>
          <ul className="plain">{a.whatsNot.map((x, i) => <li key={i} className="claim"><b>{x.claim}</b><span className="muted small">{x.evidence}</span></li>)}</ul>
        </div>
      </div>
      <h3 className="h3">Do next</h3>
      <ul className="plain">{a.recommendations.map((r, i) => (
        <li key={i} className="rec">
          <div className="rec-top"><b>{r.action}</b><Conf c={r.confidence} /></div>
          <span className="muted small">{r.rationale}</span>
          <span className="muted small">expected signal: {r.expectedSignal}</span>
        </li>
      ))}</ul>
      {a.steelman.length ? <><h3 className="h3">Steelman (where this could be wrong)</h3><ul className="plain steel">{a.steelman.map((s, i) => <li key={i}>{s}</li>)}</ul></> : null}
      {a.caveats.length ? <><h3 className="h3">Caveats</h3><ul className="plain caveats">{a.caveats.map((s, i) => <li key={i} className="muted small">{s}</li>)}</ul></> : null}
    </div>
  );
}
