"use client";

import { useState } from "react";

// Admin tool: someone lost their phone and their recovery codes. Clearing their
// two-step sign-in makes them set up a new authenticator next time they sign in.
export default function MfaReset() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirm(`Reset two-step sign-in for ${email}? They will set up a new authenticator app next time they sign in.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/mfa/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) setMsg({ ok: false, text: data.error || "Reset failed" });
      else {
        setMsg({
          ok: true,
          text: data.existed
            ? `Done. ${email} will set up a new authenticator next time they sign in.`
            : `${email} had not set up two-step sign-in yet. Nothing to reset.`,
        });
        setEmail("");
      }
    } catch {
      setMsg({ ok: false, text: "Could not reach the vault" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="toolbar" style={{ marginBottom: 24, alignItems: "flex-end", flexWrap: "wrap" }}>
      <label className="field" style={{ flex: "1 1 260px" }}>
        <span>Reset someone&apos;s two-step sign-in (lost phone)</span>
        <input
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@acmehire.example"
          required
        />
      </label>
      <button className="btn danger" type="submit" disabled={busy}>
        {busy ? "Resetting…" : "Reset"}
      </button>
      {msg && (
        <p className={msg.ok ? "muted tiny" : "error"} role="status" style={{ flexBasis: "100%", margin: 0 }}>
          {msg.text}
        </p>
      )}
    </form>
  );
}
