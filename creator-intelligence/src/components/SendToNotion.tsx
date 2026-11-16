"use client";
import { useState } from "react";

export default function SendToNotion({ ideaId, notionReady }: { ideaId: string; notionReady: boolean }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [url, setUrl] = useState("");

  if (!notionReady) return null;

  async function send() {
    setBusy(true); setErr(""); setUrl("");
    try {
      const res = await fetch(`/api/ideas/${ideaId}/to-notion`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Failed to send");
      setUrl(j.url);
    } catch (e) { setErr(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(false); }
  }

  return (
    <div className="measure" style={{ marginTop: 16 }}>
      <div className="card">
        <div className="sec-head"><h2>Send to Notion pipeline</h2>
          <button className="btn primary sm" disabled={busy} onClick={send}>{busy ? "Sending…" : "Create production row"}</button>
        </div>
        <p className="hint">Creates a row in your Content System: Brand Maya pipeline (Video, Platform, Format, and Notes built from this idea and its latest brief), so it moves from the bank into production. Status stays at the pipeline default.</p>
        {err ? <div className="notice danger">{err}</div> : null}
        {url ? <p className="hint">Added to the pipeline. <a href={url} target="_blank" rel="noreferrer">Open in Notion ↗</a></p> : null}
      </div>
    </div>
  );
}
