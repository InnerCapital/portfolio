"use client";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export default function AskPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next); setInput(""); setBusy(true); setErr("");
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Chat failed");
      setMessages((m) => [...m, { role: "assistant", content: j.reply }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ask card">
      <div className="sec-head"><h2>Ask for more InSyte</h2>{messages.length ? <button className="btn quiet sm" onClick={() => setMessages([])}>Clear</button> : null}</div>
      {messages.length ? (
        <div className="ask-thread">
          {messages.map((m, i) => <div key={i} className={`ask-msg ${m.role}`}>{m.content}</div>)}
          {busy ? <div className="ask-msg assistant busy"><span className="reading-dot" />Reading your numbers…</div> : null}
        </div>
      ) : (
        <p className="hint">Ask what to make and why. InSyte answers from your real numbers only, naming the posts and themes behind it. Try “what should I post this week?” or “why did my New York post pop?”</p>
      )}
      {err ? <div className="notice danger">{err}</div> : null}
      <div className="ask-input">
        <input placeholder="Ask your numbers…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button className="btn primary sm" disabled={busy || !input.trim()} onClick={send}>{busy ? "…" : "Ask"}</button>
      </div>
    </div>
  );
}
