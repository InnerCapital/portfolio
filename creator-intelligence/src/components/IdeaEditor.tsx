"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "./Toast";
import BriefView from "./BriefView";
import type { Analysis, Brief } from "@/lib/intelligence";
import { FORMAT_LABELS } from "@/lib/brand";

export interface IdeaFull {
  id: string;
  title: string;
  url: string;
  platform: string;
  note: string;
  sourceComments: string;
  ownComments: string;
  ownPostRef: string;
  tags: string[];
  pillar: "A" | "B" | "C" | null;
  status: string;
  creatorId: string | null;
  enriching: boolean;
  analysis: Analysis | null;
  createdAt: string;
  screenshots: string[];
  refinements: { id: string; format: string; brief: Brief; createdAt: string }[];
  linkedPosts: { postId: string; role: string }[];
  topicIds: string[];
}
type CreatorLite = { id: string; handle: string; platform: string };
type TopicLite = { id: string; name: string };
type PostLite = { id: string; caption: string; permalink: string; commentsCount: number; likeCount: number; postedAt: string | null };

const STATUSES = ["SPARK", "DEVELOPING", "SCHEDULED", "POSTED", "PARKED"];
const cap = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

async function shrink(file: File, max = 1400): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      c.toBlob((b) => resolve(b || file), "image/jpeg", 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(u); resolve(file); };
    img.src = u;
  });
}

export default function IdeaEditor({ initial, creators, topics, posts, pillars }: { initial: IdeaFull; creators: CreatorLite[]; topics: TopicLite[]; posts: PostLite[]; pillars: { A: string; B: string; C: string } }) {
  const router = useRouter();
  const [idea, setIdea] = useState<IdeaFull>(initial);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const [analysing, setAnalysing] = useState(false);
  const [refining, setRefining] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [creatorList, setCreatorList] = useState(creators);
  const [topicList, setTopicList] = useState(topics);
  const [newCreator, setNewCreator] = useState("");
  const [newTopic, setNewTopic] = useState("");
  const [activeBrief, setActiveBrief] = useState<string | null>(initial.refinements[0]?.id || null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Record<string, unknown>>({});

  function patch(fields: Partial<IdeaFull>) {
    setIdea((i) => ({ ...i, ...fields }));
    Object.assign(pending.current, fields);
    setSaveState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }
  async function flush() {
    const body = pending.current;
    pending.current = {};
    if (!Object.keys(body).length) return;
    setSaveState("saving");
    const r = await fetch(`/api/ideas/${idea.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { toast("Could not save"); setSaveState("dirty"); return; }
    setSaveState("saved");
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // While a freshly pasted link is being researched in the background, poll
  // for the result and fold it in once it lands.
  useEffect(() => {
    if (!idea.enriching) return;
    let cancelled = false;
    const t = setInterval(async () => {
      const r = await fetch(`/api/ideas/${idea.id}`);
      if (!r.ok || cancelled) return;
      const j = await r.json();
      setIdea((cur) => ({
        ...cur,
        title: j.title ?? cur.title,
        analysis: (j.analysis as Analysis | null) ?? cur.analysis,
        creatorId: j.creatorId ?? cur.creatorId,
        pillar: j.pillar ?? cur.pillar,
        enriching: Boolean(j.enriching),
      }));
      if (!j.enriching) {
        clearInterval(t);
        toast(j.analysis ? "Creator and post researched" : "Could not research this link");
        const cr = await fetch("/api/creators");
        if (cr.ok) setCreatorList(await cr.json());
      }
    }, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [idea.enriching, idea.id]);

  async function addShots(files: FileList | null) {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", await shrink(f), f.name.replace(/\.\w+$/, ".jpg"));
    toast("Uploading…");
    const r = await fetch(`/api/ideas/${idea.id}/screenshots`, { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) return toast(j.error || "Upload failed");
    setIdea((i) => ({ ...i, screenshots: [...i.screenshots, ...j.map((s: { id: string }) => s.id)] }));
    toast("Screenshots added");
  }
  async function removeShot(sid: string) {
    await fetch(`/api/ideas/${idea.id}/screenshots`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ screenshotId: sid }) });
    setIdea((i) => ({ ...i, screenshots: i.screenshots.filter((x) => x !== sid) }));
  }
  async function transcribe() {
    setTranscribing(true);
    await flush();
    const r = await fetch(`/api/ideas/${idea.id}/transcribe`, { method: "POST" });
    const j = await r.json();
    setTranscribing(false);
    if (!r.ok) return toast(j.error || "Could not read screenshots");
    setIdea((i) => ({ ...i, sourceComments: j.idea.sourceComments, platform: j.idea.platform }));
    if (j.handle && !idea.creatorId) setNewCreator(j.handle);
    toast(j.handle ? `Comments added. Creator looks like ${j.handle}` : "Comments added from screenshots");
  }
  async function analyse() {
    setAnalysing(true);
    await flush();
    const r = await fetch(`/api/ideas/${idea.id}/analyse`, { method: "POST" });
    const j = await r.json();
    setAnalysing(false);
    if (!r.ok) return toast(j.error || "Analysis failed");
    setIdea((i) => ({ ...i, analysis: j.analysis, pillar: j.pillar }));
    if (j.analysis?.creatorRead?.handle && !idea.creatorId) setNewCreator(j.analysis.creatorRead.handle);
    toast("Analysis ready");
  }
  async function refine(format: string, angle?: string) {
    setRefining(format);
    await flush();
    const r = await fetch(`/api/ideas/${idea.id}/refine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format, angle }) });
    const j = await r.json();
    setRefining(null);
    if (!r.ok) return toast(j.error || "Brief failed");
    setIdea((i) => ({ ...i, refinements: [{ id: j.id, format: j.format, brief: j.brief, createdAt: j.createdAt }, ...i.refinements], status: i.status === "SPARK" ? "DEVELOPING" : i.status }));
    setActiveBrief(j.id);
    toast(`${FORMAT_LABELS[format]} brief ready`);
  }
  async function deleteBrief(rid: string) {
    await fetch(`/api/ideas/${idea.id}/refine`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refinementId: rid }) });
    setIdea((i) => ({ ...i, refinements: i.refinements.filter((r) => r.id !== rid) }));
    if (activeBrief === rid) setActiveBrief(null);
  }
  async function spinOff(angle: Analysis["angles"][number]) {
    const r = await fetch("/api/ideas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      title: angle.title,
      note: `Hook: ${angle.hook}\nFormat: ${angle.format}\n${angle.why}\n\nSpun from: ${idea.title}`,
      pillar: angle.pillar, status: "DEVELOPING", tags: ["angle", ...idea.tags], url: idea.url, platform: idea.platform,
      sourceComments: idea.sourceComments, ownComments: idea.ownComments, ownPostRef: idea.ownPostRef, creatorId: idea.creatorId,
    }) });
    const j = await r.json();
    toast("Saved as its own idea");
    router.push(`/ideas/${j.id}`);
  }
  async function saveCreator(handle: string) {
    const h = handle.trim();
    if (!h) return;
    const platform = idea.platform && idea.platform !== "Web" ? idea.platform : "Instagram";
    const r = await fetch("/api/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle: h, platform, ideaId: idea.id, niche: idea.analysis?.creatorRead?.niche || "" }) });
    const j = await r.json();
    if (!r.ok) return toast(j.error || "Could not save creator");
    if (!creatorList.some((c) => c.id === j.id)) setCreatorList((l) => [...l, { id: j.id, handle: j.handle, platform: j.platform }]);
    setIdea((i) => ({ ...i, creatorId: j.id }));
    setNewCreator("");
    toast(`${j.handle} saved to your creators`);
  }
  async function toggleTopic(name: string, attached: boolean, topicId?: string) {
    const r = await fetch("/api/topics/assign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topicId, name, ideaId: idea.id, attached }) });
    const j = await r.json();
    if (!r.ok) return toast(j.error || "Topic failed");
    if (!topicList.some((t) => t.id === j.topicId)) setTopicList((l) => [...l, { id: j.topicId, name }]);
    setIdea((i) => ({ ...i, topicIds: attached ? Array.from(new Set([...i.topicIds, j.topicId])) : i.topicIds.filter((x) => x !== j.topicId) }));
    setNewTopic("");
  }
  async function linkPost(postId: string, linked: boolean, role: string) {
    await fetch(`/api/ideas/${idea.id}/posts`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, linked, role }) });
    setIdea((i) => ({ ...i, linkedPosts: linked ? [...i.linkedPosts.filter((x) => x.postId !== postId), { postId, role }] : i.linkedPosts.filter((x) => x.postId !== postId), status: role === "result" && linked ? "POSTED" : i.status }));
  }
  async function remove() {
    if (!confirm(`Delete "${idea.title || "this idea"}"? This cannot be undone.`)) return;
    await fetch(`/api/ideas/${idea.id}`, { method: "DELETE" });
    router.push("/");
  }

  const a = idea.analysis;
  const hasInput = Boolean(idea.note.trim() || idea.sourceComments.trim() || idea.ownComments.trim() || idea.linkedPosts.length);
  const active = idea.refinements.find((r) => r.id === activeBrief) || null;
  const signalPosts = posts.filter((p) => idea.linkedPosts.some((l) => l.postId === p.id && l.role === "signal"));
  const resultPost = posts.find((p) => idea.linkedPosts.some((l) => l.postId === p.id && l.role === "result"));

  return (
    <>
      <div className="page-head" style={{ paddingBottom: 8 }}>
        <div>
          <Link href="/" className="eyebrow" style={{ textDecoration: "none" }}>← Ideas</Link>
          <input className="title-input" style={{ display: "block", width: "100%", marginTop: 8 }} value={idea.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Give the idea a working title" />
        </div>
        <div className="actions">
          <span className="save-state">{saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : "Unsaved changes"}</span>
          <button className="btn quiet sm" type="button" onClick={remove}>Delete</button>
        </div>
      </div>

      <div className="editor">
        {/* LEFT: inputs */}
        <div className="col">
          <div className="sec">
            <div className="grid2">
              <div className="field">
                <label className="label" htmlFor="pillar">Pillar</label>
                <select id="pillar" value={idea.pillar || ""} onChange={(e) => patch({ pillar: (e.target.value || null) as IdeaFull["pillar"] })}>
                  <option value="">Not assigned yet</option>
                  <option value="A">A · {pillars.A}</option>
                  <option value="B">B · {pillars.B}</option>
                  <option value="C">C · {pillars.C}</option>
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="status">Status</label>
                <select id="status" value={idea.status} onChange={(e) => patch({ status: e.target.value })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="sec">
            <div className="sec-head"><h3>The inspiration</h3><p>A link, screenshots, a note, or all three.</p></div>
            <div className="grid2">
              <div className="field"><label className="label" htmlFor="url">Link</label><input id="url" type="url" value={idea.url} onChange={(e) => patch({ url: e.target.value })} placeholder="https://www.instagram.com/reel/..." /></div>
              <div className="field"><label className="label" htmlFor="platform">Platform</label><input id="platform" value={idea.platform} onChange={(e) => patch({ platform: e.target.value })} placeholder="Auto-detected" /></div>
            </div>
            {idea.url ? <p className="hint" style={{ marginBottom: 12 }}><a href={idea.url} target="_blank" rel="noreferrer">Open the original ↗</a></p> : null}
            <div className="field">
              <label className="label" htmlFor="note">Why it caught you</label>
              <textarea id="note" value={idea.note} onChange={(e) => patch({ note: e.target.value })} placeholder="What hooked you. The angle. How it could be made yours." />
            </div>
            <div className="field">
              <span className="label">Screenshots</span>
              <div className="shots">
                {idea.screenshots.map((sid, n) => (
                  <div className="shot" key={sid}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/screenshots/${sid}`} alt={`Screenshot ${n + 1}`} />
                    <button type="button" aria-label="Remove" onClick={() => removeShot(sid)}>×</button>
                  </div>
                ))}
              </div>
              <div className="actions" style={{ marginTop: 8 }}>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { addShots(e.target.files); e.target.value = ""; }} />
                <button className="btn quiet sm" type="button" onClick={() => fileRef.current?.click()}>Add screenshots</button>
                <button className="btn quiet sm" type="button" onClick={transcribe} disabled={!idea.screenshots.length || transcribing}>{transcribing ? "Reading…" : "Read caption and comments from screenshots"}</button>
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="creator">Creator</label>
              <div className="actions">
                <select id="creator" value={idea.creatorId || ""} onChange={(e) => patch({ creatorId: e.target.value || null })} style={{ border: "1px solid var(--rule-strong)", background: "var(--surface)", borderRadius: 4, padding: "8px 10px" }}>
                  <option value="">Not linked</option>
                  {creatorList.map((c) => <option key={c.id} value={c.id}>{c.handle} · {c.platform}</option>)}
                </select>
                <input value={newCreator} onChange={(e) => setNewCreator(e.target.value)} placeholder="@handle to save" style={{ border: "1px solid var(--rule-strong)", background: "var(--surface)", borderRadius: 4, padding: "8px 10px" }} />
                <button className="btn quiet sm" type="button" onClick={() => saveCreator(newCreator)} disabled={!newCreator.trim()}>Save creator</button>
              </div>
              {idea.creatorId ? <p className="hint"><Link href={`/creators/${idea.creatorId}`}>Open this creator's breakdown</Link></p> : null}
            </div>
            <div className="field">
              <span className="label">Topics</span>
              <div className="chips">
                {topicList.map((t) => {
                  const on = idea.topicIds.includes(t.id);
                  return <button key={t.id} className="chip" type="button" aria-pressed={on} onClick={() => toggleTopic(t.name, !on, t.id)}>{t.name}</button>;
                })}
              </div>
              <div className="actions" style={{ marginTop: 6 }}>
                <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="New topic" style={{ border: "1px solid var(--rule-strong)", background: "var(--surface)", borderRadius: 4, padding: "8px 10px" }} />
                <button className="btn quiet sm" type="button" onClick={() => toggleTopic(newTopic.trim(), true)} disabled={!newTopic.trim()}>Add</button>
                {a?.creatorRead?.suggestedTopics?.length ? <span className="hint">Suggested: {a.creatorRead.suggestedTopics.map((t) => <button key={t} className="chip" type="button" style={{ marginLeft: 4 }} onClick={() => toggleTopic(t, true)}>{t}</button>)}</span> : null}
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="tags">Tags</label>
              <input id="tags" value={idea.tags.join(", ")} onChange={(e) => patch({ tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} placeholder="hook, documentary, contrarian" />
            </div>
          </div>

          <div className="sec">
            <div className="sec-head"><h3>Comments on the inspiration</h3><p>What the source audience said underneath it.</p></div>
            <div className="field"><textarea value={idea.sourceComments} onChange={(e) => patch({ sourceComments: e.target.value })} style={{ minHeight: 150 }} placeholder="Paste the comments, one per line. handle: comment works well. Or add screenshots above and read them in." /></div>
          </div>

          <div className="sec">
            <div className="sec-head"><h3>Comments on our posts</h3><p>What your own audience has been saying that connects to this.</p></div>
            {posts.length ? (
              <div className="field">
                <span className="label">Link synced posts whose comments should feed this idea</span>
                <div className="linked-posts" style={{ maxHeight: 220, overflow: "auto" }}>
                  {posts.map((p) => {
                    const on = idea.linkedPosts.some((l) => l.postId === p.id && l.role === "signal");
                    return (
                      <label key={p.id} className="post-pick">
                        <input type="checkbox" checked={on} onChange={(e) => linkPost(p.id, e.target.checked, "signal")} />
                        <span>
                          <span className="cap">{p.caption || p.permalink}</span>
                          <span className="m">{p.commentsCount} comments · {p.likeCount} likes{p.postedAt ? ` · ${new Date(p.postedAt).toLocaleDateString("en-GB")}` : ""}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {signalPosts.length ? <p className="hint">{signalPosts.length} post{signalPosts.length === 1 ? "" : "s"} feeding this idea.</p> : null}
              </div>
            ) : <p className="hint" style={{ marginBottom: 12 }}>Connect Instagram in Settings and sync to pick posts here. Until then, paste below.</p>}
            <div className="field"><label className="label" htmlFor="ownref">Pasted from which post</label><input id="ownref" value={idea.ownPostRef} onChange={(e) => patch({ ownPostRef: e.target.value })} placeholder="Link or name of the post" /></div>
            <div className="field"><textarea value={idea.ownComments} onChange={(e) => patch({ ownComments: e.target.value })} style={{ minHeight: 120 }} placeholder="Paste comments people left on your own posts (LinkedIn, TikTok, or Instagram before syncing)." /></div>
          </div>

          {posts.length ? (
            <div className="sec">
              <div className="sec-head"><h3>What it became</h3><p>Once posted, link the result so its comments close the loop.</p></div>
              <select value={resultPost?.id || ""} onChange={(e) => { const v = e.target.value; if (v) linkPost(v, true, "result"); else if (resultPost) linkPost(resultPost.id, false, "result"); }} style={{ border: "1px solid var(--rule-strong)", background: "var(--surface)", borderRadius: 4, padding: "8px 10px", width: "100%" }}>
                <option value="">Not posted yet</option>
                {posts.map((p) => <option key={p.id} value={p.id}>{(p.caption || p.permalink).slice(0, 80)} · {p.commentsCount} comments</option>)}
              </select>
              {resultPost ? <p className="hint" style={{ marginTop: 8 }}>Result: {resultPost.likeCount} likes, {resultPost.commentsCount} comments. <a href={resultPost.permalink} target="_blank" rel="noreferrer">Open ↗</a></p> : null}
            </div>
          ) : null}
        </div>

        {/* RIGHT: intelligence */}
        <div className="col">
          <div className="sec">
            <div className="sec-head"><h3>Sentiment and angles</h3><p>Merges both comment sets with your note.</p></div>
            {idea.enriching ? <p className="hint" style={{ marginBottom: 12 }}>Researching the creator and post from the link, this takes a moment…</p> : null}
            <div className="actions" style={{ marginBottom: 16 }}>
              <button className="btn accent sm" type="button" onClick={analyse} disabled={!hasInput || analysing}>{analysing ? "Reading the comments…" : a ? "Run again" : "Analyse"}</button>
              {!hasInput ? <span className="hint">Add a note or some comments first.</span> : null}
              {a?.generatedAt ? <span className="hint">{a.source === "research" ? "Researched from the link" : "Generated"} {new Date(a.generatedAt).toLocaleDateString("en-GB")}</span> : null}
            </div>
            {a ? (
              <div className="analysis">
                <p className="summary">{a.sentiment?.summary}</p>
                <div className="sentiment-row">
                  <div className="sent-card"><span className="label">Under the inspiration</span><b className={`pill ${a.sentiment?.inspiration}`}>{a.sentiment?.inspiration}</b><p>{a.sentiment?.inspirationNote}</p></div>
                  <div className="sent-card"><span className="label">On our posts</span><b className={`pill ${a.sentiment?.ours}`}>{a.sentiment?.ours}</b><p>{a.sentiment?.oursNote}</p></div>
                </div>
                {a.identity ? (
                  <div className="identity">
                    <div><span className="label">Who they want to be</span>{a.identity.whoTheyWantToBe}</div>
                    <div><span className="label">What they are running from</span>{a.identity.enemy}</div>
                    <div><span className="label">Transformation</span>{a.identity.transformation}</div>
                  </div>
                ) : null}
                {a.themes?.length ? (
                  <div><div className="h3">Recurring themes</div>
                    <ul className="themes">{a.themes.map((t, n) => <li key={n}><span className="t">{t.theme}</span><span className="e">{t.evidence}</span><span className="w">{t.where === "both" ? "Both audiences" : t.where === "ours" ? "Our audience" : "Source audience"}</span></li>)}</ul>
                  </div>
                ) : null}
                <div className="twocol">
                  <div><div className="h3">What people want</div><ul className="plain">{(a.audienceWants || []).map((w, n) => <li key={n}>{w}</li>)}</ul></div>
                  <div><div className="h3">Objections and friction</div>{a.objections?.length ? <ul className="plain">{a.objections.map((w, n) => <li key={n}>{w}</li>)}</ul> : <p className="hint">None surfaced.</p>}</div>
                </div>
                {a.creatorRead ? (
                  <div className="sent-card">
                    <span className="label">Creator read</span>
                    <p style={{ marginTop: 4 }}><b>{a.creatorRead.handle || "Unknown handle"}</b> · {a.creatorRead.niche}. {a.creatorRead.whatTheyDoWell}</p>
                    {!idea.creatorId && a.creatorRead.handle ? <button className="btn quiet sm" type="button" style={{ marginTop: 8 }} onClick={() => saveCreator(a.creatorRead!.handle)}>Save {a.creatorRead.handle} to creators</button> : null}
                  </div>
                ) : null}
                {a.factCheck?.length ? (
                  <div><div className="h3">Fact check</div>
                    <ul className="themes">
                      {a.factCheck.map((f, n) => (
                        <li key={n}>
                          <span className="t">{f.claim}</span>
                          <span className="e">{f.note}</span>
                          <span className="w">{f.verdict === "true" ? "Checks out" : f.verdict === "false" ? "False" : f.verdict === "misleading" ? "Misleading" : "Unverified"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {a.angles?.length ? (
                  <div><div className="h3">Content angles</div>
                    <div className="angles">
                      {a.angles.map((g, n) => (
                        <div className="angle" key={n}>
                          <div className="top"><span className="at">{g.title}</span><span className="tag pillar">Pillar {g.pillar}</span></div>
                          <div className="hook">“{g.hook}”</div>
                          <div className="why">{g.why}</div>
                          <div className="fm">{g.format}</div>
                          <div className="actions">
                            <button className="btn quiet sm" type="button" onClick={() => spinOff(g)}>Spin into its own idea</button>
                            <span className="hint">Brief this angle as:</span>
                            {Object.keys(FORMAT_LABELS).map((f) => <button key={f} className="chip" type="button" onClick={() => refine(f, g.title)} disabled={refining !== null}>{FORMAT_LABELS[f]}</button>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="sec">
            <div className="sec-head"><h3>Format briefs</h3><p>Structured briefs to write from, built with cult marketing and direct response thinking.</p></div>
            <div className="format-tabs">
              {Object.keys(FORMAT_LABELS).map((f) => (
                <button key={f} className="btn quiet sm" type="button" onClick={() => refine(f)} disabled={refining !== null || !hasInput}>{refining === f ? "Briefing…" : `+ ${FORMAT_LABELS[f]}`}</button>
              ))}
            </div>
            {idea.refinements.length ? (
              <>
                <div className="chips" style={{ marginBottom: 14 }}>
                  {idea.refinements.map((r) => <button key={r.id} className="chip" type="button" aria-pressed={activeBrief === r.id} onClick={() => setActiveBrief(r.id)}>{FORMAT_LABELS[r.format]} · {new Date(r.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</button>)}
                </div>
                {active ? <BriefView brief={active.brief} onDelete={() => deleteBrief(active.id)} /> : null}
              </>
            ) : <p className="hint">No briefs yet. Analyse first, then brief an angle, or brief the whole idea in a format above.</p>}
          </div>
        </div>
      </div>
    </>
  );
}
