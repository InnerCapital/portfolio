"use client";

import { useState } from "react";

export default function MfaForm({
  mode,
  method,
  email,
}: {
  mode: "setup" | "signin";
  method: "totp" | "email";
  email: string;
}) {
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);

  async function sendCode() {
    setSending(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/mfa/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Couldn't send the code. Try again.");
        return;
      }
      setSent(true);
      setNotice(`Code sent to ${email}. It works for 10 minutes. Check spam if it hasn't arrived.`);
    } catch {
      setError("Could not reach the vault. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "That didn't work. Try again.");
        setCode("");
        return;
      }
      if (data.recoveryCodes) {
        // Setup is done: take the QR code and setup key off the screen.
        document.querySelectorAll<HTMLElement>("[data-setup]").forEach((el) => (el.hidden = true));
        setRecoveryCodes(data.recoveryCodes);
        return;
      }
      if (typeof data.remaining === "number" && data.remaining <= 3) {
        alert(`Recovery code used. You have ${data.remaining} left. Ask a vault admin to reset your two-step sign-in soon.`);
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the vault. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="mfa-recovery">
        <p className="h3">Save your recovery codes</p>
        <p className="muted tiny">
          If you lose your phone, each of these lets you in once. They are shown only now. Keep them somewhere safe
          and separate from your phone, such as a printed copy.
        </p>
        <ul className="mfa-codes">
          {recoveryCodes.map((c) => (
            <li key={c}>
              <code>{c}</code>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn small"
          onClick={() => navigator.clipboard?.writeText(recoveryCodes.join("\n")).catch(() => {})}
        >
          Copy codes
        </button>
        <label className="mfa-check">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved these codes
        </label>
        <button
          type="button"
          className="btn primary wide big"
          disabled={!saved}
          onClick={() => (window.location.href = "/")}
        >
          Open the vault <span className="arrow" aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  if (method === "email" && !sent && !useRecovery) {
    return (
      <div className="mfa-form">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn primary wide big" type="button" onClick={sendCode} disabled={sending}>
          {sending ? "Sending…" : "Email me a code"}
          <span className="arrow" aria-hidden="true">→</span>
        </button>
        {mode === "signin" && (
          <button type="button" className="link tiny" onClick={() => setUseRecovery(true)}>
            Use a recovery code instead
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mfa-form">
      {notice && !useRecovery && (
        <p className="tiny muted" role="status">
          {notice}
        </p>
      )}
      <label className="field">
        <span>{useRecovery ? "Recovery code" : "6-digit code"}</span>
        <input
          className="input mfa-input"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={useRecovery ? "text" : "numeric"}
          autoComplete="one-time-code"
          pattern={useRecovery ? undefined : "[0-9 ]{6,7}"}
          maxLength={useRecovery ? 20 : 7}
          placeholder={useRecovery ? "xxxxx-xxxxx" : "123456"}
          autoFocus
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "mfa-error" : undefined}
        />
      </label>
      {error && (
        <p className="error" id="mfa-error" role="alert">
          {error}
        </p>
      )}
      <button className="btn primary wide big" type="submit" disabled={busy}>
        {busy ? "Checking…" : mode === "setup" ? "Turn on two-step sign-in" : "Continue"}
        <span className="arrow" aria-hidden="true">→</span>
      </button>
      {method === "email" && !useRecovery && (
        <button type="button" className="link tiny" onClick={sendCode} disabled={sending}>
          {sending ? "Sending…" : "Send a new code"}
        </button>
      )}
      {mode === "signin" && (
        <button
          type="button"
          className="link tiny"
          onClick={() => {
            setUseRecovery(!useRecovery);
            setCode("");
            setError(null);
          }}
        >
          {useRecovery
            ? method === "email"
              ? "Use an emailed code instead"
              : "Use a code from my app instead"
            : "Use a recovery code instead"}
        </button>
      )}
    </form>
  );
}
