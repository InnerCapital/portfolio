"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EntryRow } from "@/lib/entries";
import "./vault.css";

const REVEAL_SECONDS = 15;
const CLIPBOARD_CLEAR_SECONDS = 30;

const CATEGORY_ORDER = [
  "Finance and operations",
  "CRM and sales data",
  "Communication and web",
  "Automation and contracts",
  "Hosting and development",
  "Hardware and tracking",
  "Internal apps",
  "Other",
];

function catRank(c: string): number {
  const i = CATEGORY_ORDER.indexOf(c);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

function hostOf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return "";
  }
}

function ToolIcon({ name, url }: { name: string; url: string }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  if (!host || !host.includes(".") || failed) {
    return (
      <span className="tool-icon fallback" aria-hidden="true">
        {name.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    <span className="tool-icon" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/logo?url=${encodeURIComponent(host)}`}
        alt=""
        width={28}
        height={28}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

const LOGIN_METHODS = ["Password", "Google SSO", "Microsoft SSO", "Shared login", "API key", "Other"];

type FormState = {
  name: string;
  category: string;
  purpose: string;
  login_url: string;
  login_method: string;
  username: string;
  password: string;
  owner: string;
  admins: string;
  access: string;
  two_fa: string;
  billing: string;
  notes: string;
  restricted: boolean;
  shared_with: string;
};

const EMPTY: FormState = {
  name: "",
  category: "General",
  purpose: "",
  login_url: "",
  login_method: "Password",
  username: "",
  password: "",
  owner: "",
  admins: "",
  access: "",
  two_fa: "",
  billing: "",
  notes: "",
  restricted: false,
  shared_with: "",
};

function generatePassword(length = 24): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+";
  const limit = Math.floor(256 / chars.length) * chars.length;
  let out = "";
  while (out.length < length) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < limit && out.length < length) out += chars[b % chars.length];
    }
  }
  return out;
}

export default function Vault({ admin, keyholder, email }: { admin: boolean; keyholder: boolean; email: string }) {
  const canSee = (e: EntryRow) =>
    !e.restricted || keyholder || e.shared_with.toLowerCase().split(/[,\s]+/).includes(email.toLowerCase());
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [toast, setToast] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [confirmDel, setConfirmDel] = useState<EntryRow | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: string | null; form: FormState } | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/entries", { cache: "no-store" });
    if (!res.ok) {
      setError(res.status === 401 ? "Your session has expired. Refresh to sign in again." : "Could not load entries.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setEntries(data.entries);
    setError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, [load]);

  const categories = useMemo(
    () => [
      "All",
      ...Array.from(new Set(entries.map((e) => e.category))).sort(
        (a, b) => catRank(a) - catRank(b) || a.localeCompare(b)
      ),
    ],
    [entries]
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: entries.length };
    for (const e of entries) c[e.category] = (c[e.category] ?? 0) + 1;
    return c;
  }, [entries]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries
      .filter((e) => {
        if (category !== "All" && e.category !== category) return false;
        if (!q) return true;
        return [e.name, e.category, e.purpose, e.username, e.owner, e.admins, e.access, e.notes]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => catRank(a.category) - catRank(b.category) || a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [entries, query, category]);

  function hide(id: string) {
    clearTimeout(timers.current[id]);
    setRevealed((r) => {
      const next = { ...r };
      delete next[id];
      return next;
    });
  }

  async function fetchPassword(id: string): Promise<string | null> {
    const res = await fetch(`/api/entries/${id}/reveal`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      flash(data.error ?? "Could not reveal");
      return null;
    }
    return data.password as string;
  }

  async function reveal(id: string) {
    const pw = await fetchPassword(id);
    if (pw === null) return;
    setRevealed((r) => ({ ...r, [id]: pw }));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(() => hide(id), REVEAL_SECONDS * 1000);
  }

  async function copyText(text: string, label: string, clearAfter = false) {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${label} copied`);
      if (clearAfter) {
        setTimeout(() => navigator.clipboard.writeText("").catch(() => {}), CLIPBOARD_CLEAR_SECONDS * 1000);
      }
    } catch {
      flash("Copy blocked by the browser");
    }
  }

  async function copyPassword(id: string) {
    const pw = revealed[id] ?? (await fetchPassword(id));
    if (pw) copyText(pw, "Password", true);
  }

  function openNew() {
    setEditing({ id: null, form: { ...EMPTY } });
  }

  function openEdit(e: EntryRow) {
    setEditing({
      id: e.id,
      form: {
        name: e.name,
        category: e.category,
        purpose: e.purpose,
        login_url: e.login_url,
        login_method: e.login_method,
        username: e.username,
        password: "",
        owner: e.owner,
        admins: e.admins,
        access: e.access,
        two_fa: e.two_fa,
        billing: e.billing,
        notes: e.notes,
        restricted: e.restricted,
        shared_with: e.shared_with,
      },
    });
  }

  async function save() {
    if (!editing) return;
    const { id, form } = editing;
    if (!form.name.trim()) {
      flash("Name is required");
      return;
    }
    const body: Partial<FormState> = { ...form };
    if (id && !form.password) delete body.password;
    const res = await fetch(id ? `/api/entries/${id}` : "/api/entries", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      flash(data.error ?? "Save failed");
      return;
    }
    if (id) hide(id);
    setEditing(null);
    flash("Saved");
    load();
  }

  async function remove(e: EntryRow) {
    const res = await fetch(`/api/entries/${e.id}`, { method: "DELETE" });
    if (!res.ok) {
      flash("Delete failed");
      return;
    }
    setConfirmDel(null);
    flash("Deleted");
    load();
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setEditing((cur) => (cur ? { ...cur, form: { ...cur.form, [key]: value } } : cur));
  }

  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      const tag = (ev.target as HTMLElement)?.tagName;
      if (ev.key === "Escape") {
        setEditing(null);
        setConfirmDel(null);
      } else if (ev.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
        ev.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="wrap">
      <div className="page-head">
        <p className="eyebrow">Team vault</p>
        <h1>Tools and access.</h1>
        <p className="muted">
          {loading ? "Loading entries" : `${entries.length} ${entries.length === 1 ? "tool" : "tools"} logged. Every reveal is recorded.`}
        </p>
      </div>

      <div className="toolbar">
        <label className="search grow">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4" />
          </svg>
          <input
            ref={searchRef}
            className="input"
            placeholder="Search tools, owners, notes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>/</kbd>
        </label>
        {admin && (
          <button className="btn primary" onClick={openNew}>
            <span aria-hidden="true">+</span> Add tool
          </button>
        )}
      </div>

      <div className="chips" role="tablist" aria-label="Filter by category">
        {categories.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            className={`chip ${category === c ? "on" : ""}`}
            onClick={() => setCategory(c)}
          >
            {c}
            <span className="chip-n">{counts[c] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p className="error">{error}</p>}
      {!loading && !error && visible.length === 0 && (
        <div className="empty">
          <p className="h3">{entries.length === 0 ? "Nothing here yet." : "No matches."}</p>
          <p className="muted">
            {entries.length === 0
              ? admin
                ? "Use Add tool to create the first entry."
                : "An admin needs to add the first entry."
              : "Clear the search or pick another category."}
          </p>
        </div>
      )}

      <div className="grid">
        {loading &&
          [0, 1, 2].map((n) => (
            <div className="card skeleton" key={n} aria-hidden="true">
              <i /> <i /> <i />
            </div>
          ))}
        {visible.map((e, idx) => (
          <article className="card" key={e.id} style={{ animationDelay: `${Math.min(idx, 10) * 45}ms` }}>
            <div className="card-head">
              <ToolIcon name={e.name} url={e.login_url} />
              <div className="card-title">
                <h2>{e.name}</h2>
                <span className="pill">{e.category}</span>
                {e.restricted && (
                  <span className="pill locked" title={e.shared_with ? `Keyholders and ${e.shared_with}` : "Only keyholders can see or change this"}>
                    {e.shared_with ? "Restricted" : "Keyholders only"}
                  </span>
                )}
              </div>
            </div>

            <dl>
              <dt>Login</dt>
              <dd>
                {e.login_url ? (
                  <a href={/^https?:\/\//i.test(e.login_url) ? e.login_url : `https://${e.login_url}`} target="_blank" rel="noopener noreferrer">
                    {e.login_url.replace(/^https?:\/\//i, "")}
                  </a>
                ) : (
                  <span className="muted">Not set</span>
                )}
              </dd>
              <dt>Email</dt>
              <dd>
                {e.username ? (
                  <>
                    {e.username}{" "}
                    <button className="link" onClick={() => copyText(e.username, "Email")}>
                      copy
                    </button>
                  </>
                ) : (
                  <span className="muted">Not set</span>
                )}
              </dd>
              <dt>Password</dt>
              <dd>
                {!e.has_password ? (
                  <span className="muted">Not set</span>
                ) : !canSee(e) ? (
                  <span className="muted">No access</span>
                ) : (
                  <>
                    {revealed[e.id] !== undefined ? (
                      <>
                        <code className="secret">{revealed[e.id]}</code>{" "}
                        <button className="link" onClick={() => hide(e.id)}>
                          hide
                        </button>
                        <span
                          className="countdown"
                          style={{ animationDuration: `${REVEAL_SECONDS}s` }}
                          aria-hidden="true"
                        />
                      </>
                    ) : (
                      <>
                        <span className="dots">••••••••••</span>{" "}
                        <button className="link" onClick={() => reveal(e.id)}>
                          reveal
                        </button>
                      </>
                    )}{" "}
                    <button className="link" onClick={() => copyPassword(e.id)}>
                      copy
                    </button>
                  </>
                )}
              </dd>
            </dl>

            <button
              className={`more-toggle ${open[e.id] ? "on" : ""}`}
              aria-expanded={!!open[e.id]}
              onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}
            >
              <span>{open[e.id] ? "Hide details" : "Details"}</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" aria-hidden="true">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            <div className={`more ${open[e.id] ? "open" : ""}`}>
              <dl className="more-inner">
                {e.purpose && (
                  <>
                    <dt>Purpose</dt>
                    <dd>{e.purpose}</dd>
                  </>
                )}
                <dt>Method</dt>
                <dd>{e.login_method}</dd>
                <dt>2FA</dt>
                <dd>{e.two_fa || <span className="muted">Not set</span>}</dd>
                {e.owner && (
                  <>
                    <dt>Owner</dt>
                    <dd>{e.owner}</dd>
                  </>
                )}
                {e.admins && (
                  <>
                    <dt>Admins</dt>
                    <dd>{e.admins}</dd>
                  </>
                )}
                {e.access && (
                  <>
                    <dt>Access</dt>
                    <dd>{e.access}</dd>
                  </>
                )}
                {e.billing && (
                  <>
                    <dt>Billing</dt>
                    <dd>{e.billing}</dd>
                  </>
                )}
                {e.notes && (
                  <>
                    <dt>Notes</dt>
                    <dd className="pre">{e.notes}</dd>
                  </>
                )}
              </dl>
            </div>

            <div className="card-foot">
              <span className="tiny muted">
                Updated {new Date(e.updated_at).toLocaleDateString("en-GB")} by {e.updated_by}
              </span>
              {admin && (!e.restricted || keyholder) && (
                <span className="actions">
                  <button className="btn small" onClick={() => openEdit(e)}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => setConfirmDel(e)}>
                    Delete
                  </button>
                </span>
              )}
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <div className="overlay" onClick={() => setEditing(null)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}>
            <p className="eyebrow">{editing.id ? "Edit entry" : "New entry"}</p>
            <h2>{editing.id ? "Edit tool" : "Add tool"}</h2>
            <div className="form">
              <Field label="Tool name *">
                <input className="input" value={editing.form.name} onChange={(e) => setField("name", e.target.value)} />
              </Field>
              <Field label="Category">
                <input className="input" list="ah-categories" value={editing.form.category} onChange={(e) => setField("category", e.target.value)} />
                <datalist id="ah-categories">
                  {categories.filter((c) => c !== "All").map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label="Purpose" wide>
                <input className="input" value={editing.form.purpose} onChange={(e) => setField("purpose", e.target.value)} />
              </Field>
              <Field label="Login URL">
                <input className="input" value={editing.form.login_url} onChange={(e) => setField("login_url", e.target.value)} />
              </Field>
              <Field label="Login method">
                <select className="input" value={editing.form.login_method} onChange={(e) => setField("login_method", e.target.value)}>
                  {LOGIN_METHODS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Username">
                <input className="input" autoComplete="off" value={editing.form.username} onChange={(e) => setField("username", e.target.value)} />
              </Field>
              <Field label={editing.id ? "Password (blank keeps current)" : "Password"}>
                <div className="row">
                  <input
                    className="input grow"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={editing.form.password}
                    onChange={(e) => setField("password", e.target.value)}
                  />
                  <button type="button" className="btn small" onClick={() => setField("password", generatePassword())}>
                    Generate
                  </button>
                </div>
              </Field>
              <Field label="Account owner">
                <input className="input" value={editing.form.owner} onChange={(e) => setField("owner", e.target.value)} />
              </Field>
              <Field label="Admins">
                <input className="input" value={editing.form.admins} onChange={(e) => setField("admins", e.target.value)} />
              </Field>
              <Field label="Who has access" wide>
                <textarea className="input" rows={2} value={editing.form.access} onChange={(e) => setField("access", e.target.value)} />
              </Field>
              <Field label="2FA method and recovery" wide>
                <input className="input" value={editing.form.two_fa} onChange={(e) => setField("two_fa", e.target.value)} />
              </Field>
              <Field label="Billing and renewal" wide>
                <input className="input" value={editing.form.billing} onChange={(e) => setField("billing", e.target.value)} />
              </Field>
              <Field label="Notes" wide>
                <textarea className="input" rows={3} value={editing.form.notes} onChange={(e) => setField("notes", e.target.value)} />
              </Field>
              {keyholder && (
                <label className="field wide check">
                  <input
                    type="checkbox"
                    checked={editing.form.restricted || editing.form.login_method === "API key"}
                    disabled={editing.form.login_method === "API key"}
                    onChange={(e) => setField("restricted", e.target.checked)}
                  />
                  <span>Keyholders only (API keys, tokens, passcodes). Always on when the login method is "API key".</span>
                </label>
              )}
              {keyholder && (editing.form.restricted || editing.form.login_method === "API key") && (
                <Field label="Also shared with (Acme Hire emails, comma-separated)" wide>
                  <input className="input" placeholder="coordinator@acmehire.example" value={editing.form.shared_with} onChange={(e) => setField("shared_with", e.target.value)} />
                </Field>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}


      {confirmDel && (
        <div className="overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal small-modal" role="alertdialog" aria-modal="true" onClick={(ev) => ev.stopPropagation()}>
            <p className="eyebrow">Delete entry</p>
            <h2>Delete {confirmDel.name}?</h2>
            <p className="muted">This cannot be undone. The deletion is written to the audit log.</p>
            <div className="modal-foot">
              <button className="btn" onClick={() => setConfirmDel(null)}>
                Cancel
              </button>
              <button className="btn primary danger-solid" onClick={() => remove(confirmDel)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}
