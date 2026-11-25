import { audit, db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { hashRecoveryCode, newRecoveryCodes, newSecret, verifyCode } from "@/lib/totp";
import { emailEnabled, sendCodeEmail } from "@/lib/mailer";

// Per-person second factor. Each person picks ONE method at setup:
//   totp  - authenticator app. Secret encrypted with VAULT_KEY (AES-256-GCM), bound to the email.
//   email - a 6-digit code emailed to their @acmehire.example address, valid 10 minutes, single use.
// Recovery codes work with either.

const MAX_FAILURES = 5;
const FAILURE_WINDOW = "15 minutes";

let schemaReady: Promise<void> | null = null;

/** Creates the 2FA tables on first use, so no manual migration is needed. */
export function ensureMfaSchema(): Promise<void> {
  schemaReady ??= db()
    .query(
      `create table if not exists mfa_factors (
         email text primary key,
         secret_enc text not null,
         enabled boolean not null default false,
         last_used_step bigint,
         created_at timestamptz not null default now(),
         enabled_at timestamptz
       );
       create table if not exists mfa_recovery_codes (
         id bigserial primary key,
         email text not null,
         code_hash text not null,
         used_at timestamptz
       );
       create index if not exists mfa_recovery_codes_email_idx on mfa_recovery_codes (email);
       alter table mfa_factors add column if not exists method text not null default 'totp';
       create table if not exists mfa_email_codes (
         id bigserial primary key,
         email text not null,
         code_hash text not null,
         expires_at timestamptz not null,
         used_at timestamptz,
         created_at timestamptz not null default now()
       );
       create index if not exists mfa_email_codes_email_idx on mfa_email_codes (email, created_at desc);`
    )
    .then(() => undefined)
    .catch((e) => {
      schemaReady = null;
      throw e;
    });
  return schemaReady;
}

const aad = (email: string) => `mfa:${email.toLowerCase()}`;

export type Method = "totp" | "email";
type FactorRow = { secret_enc: string; enabled: boolean; last_used_step: string | null; method: Method };

async function factor(email: string): Promise<FactorRow | null> {
  await ensureMfaSchema();
  const { rows } = await db().query<FactorRow>(
    "select secret_enc, enabled, last_used_step, method from mfa_factors where email = $1",
    [email]
  );
  return rows[0] ?? null;
}

export async function isEnrolled(email: string): Promise<boolean> {
  return (await factor(email))?.enabled === true;
}

/** The method this person set up, or null if they haven't finished setup. */
export async function enrolledMethod(email: string): Promise<Method | null> {
  const f = await factor(email);
  return f?.enabled ? f.method : null;
}

/** Returns the pending setup secret, creating one if needed. Never for an enrolled person. */
export async function pendingSecret(email: string): Promise<string> {
  const f = await factor(email);
  if (f?.enabled) throw new Error("Already enrolled");
  if (f && f.method === "totp" && f.secret_enc) return decrypt(f.secret_enc, aad(email));
  const secret = newSecret();
  await db().query(
    `insert into mfa_factors (email, secret_enc, method) values ($1, $2, 'totp')
     on conflict (email) do update set secret_enc = excluded.secret_enc, method = 'totp'
     where mfa_factors.enabled = false and mfa_factors.method <> 'totp'`,
    [email, encrypt(secret, aad(email))]
  );
  // Re-read in case two tabs raced: everyone sees the same pending secret.
  const again = await factor(email);
  return decrypt(again!.secret_enc, aad(email));
}

export async function tooManyFailures(email: string): Promise<boolean> {
  const { rows } = await db().query(
    `select count(*)::int as n from audit_log
     where actor = $1 and action = 'mfa-failed' and at > now() - interval '${FAILURE_WINDOW}'`,
    [email]
  );
  return rows[0].n >= MAX_FAILURES;
}

export type CheckResult =
  | { ok: true; recoveryCodes?: string[]; usedRecovery?: boolean; remaining?: number }
  | { ok: false; status: number; error: string };

/** First-time setup: confirm the app is working, switch 2FA on, issue recovery codes. */
export async function confirmEnrollment(email: string, code: string): Promise<CheckResult> {
  if (await tooManyFailures(email)) {
    await audit(email, "mfa-blocked", null, "too many attempts");
    return { ok: false, status: 429, error: "Too many attempts. Wait 15 minutes and try again." };
  }
  const f = await factor(email);
  if (!f) return { ok: false, status: 400, error: "Start setup again." };
  if (f.enabled) return { ok: false, status: 409, error: "Two-step sign-in is already set up." };

  let step: number | null = null;
  let ok: boolean;
  if (f.method === "email") ok = await useEmailCode(email, code);
  else {
    step = verifyCode(decrypt(f.secret_enc, aad(email)), code, null);
    ok = step !== null;
  }
  if (!ok) {
    await audit(email, "mfa-failed", null, "setup code wrong");
    return {
      ok: false,
      status: 401,
      error: f.method === "email"
        ? "That code didn't match, or it has expired. Send a new code and try again."
        : "That code didn't match. Check the app and try the newest code.",
    };
  }

  const codes = newRecoveryCodes();
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query(
      "update mfa_factors set enabled = true, enabled_at = now(), last_used_step = $2 where email = $1",
      [email, step]
    );
    await client.query("delete from mfa_recovery_codes where email = $1", [email]);
    for (const c of codes) {
      await client.query("insert into mfa_recovery_codes (email, code_hash) values ($1, $2)", [email, hashRecoveryCode(c)]);
    }
    await client.query("commit");
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
  await audit(email, "mfa-enrolled", null, f.method === "email" ? "email codes set up" : "authenticator app set up");
  return { ok: true, recoveryCodes: codes };
}

/** Normal sign-in: a 6-digit app code, or one of the person's recovery codes. */
export async function checkSignIn(email: string, input: string): Promise<CheckResult> {
  if (await tooManyFailures(email)) {
    await audit(email, "mfa-blocked", null, "too many attempts");
    return { ok: false, status: 429, error: "Too many attempts. Wait 15 minutes and try again." };
  }
  const f = await factor(email);
  if (!f?.enabled) return { ok: false, status: 400, error: "Two-step sign-in isn't set up yet." };

  const raw = input.trim();
  if (/^\d[\d\s]*$/.test(raw) && f.method === "email") {
    if (await useEmailCode(email, raw)) {
      await audit(email, "mfa-passed", null, "email code");
      return { ok: true };
    }
  } else if (/^\d[\d\s]*$/.test(raw)) {
    const last = f.last_used_step === null ? null : Number(f.last_used_step);
    const step = verifyCode(decrypt(f.secret_enc, aad(email)), raw, last);
    if (step !== null) {
      // Conditional update: if two requests race with the same code, only one wins.
      const { rowCount } = await db().query(
        "update mfa_factors set last_used_step = $2 where email = $1 and (last_used_step is null or last_used_step < $2)",
        [email, step]
      );
      if (rowCount === 1) {
        await audit(email, "mfa-passed", null, "authenticator code");
        return { ok: true };
      }
    }
  } else {
    const { rows } = await db().query(
      `update mfa_recovery_codes set used_at = now()
       where id = (select id from mfa_recovery_codes where email = $1 and code_hash = $2 and used_at is null limit 1)
       returning id`,
      [email, hashRecoveryCode(raw)]
    );
    if (rows.length === 1) {
      const left = await db().query(
        "select count(*)::int as n from mfa_recovery_codes where email = $1 and used_at is null",
        [email]
      );
      await audit(email, "mfa-passed", null, `recovery code used, ${left.rows[0].n} left`);
      return { ok: true, usedRecovery: true, remaining: left.rows[0].n };
    }
  }
  await audit(email, "mfa-failed", null, "sign-in code wrong");
  return {
    ok: false,
    status: 401,
    error: f.method === "email"
      ? "That code didn't work, or it has expired. Send a new code and try again."
      : "That code didn't work. Try the newest code from your app.",
  };
}

/** Admin action: wipe someone's 2FA so they set it up again on next sign-in (lost phone). */
export async function resetFactor(admin: string, email: string): Promise<boolean> {
  await ensureMfaSchema();
  const target = email.trim().toLowerCase();
  const { rowCount } = await db().query("delete from mfa_factors where email = $1", [target]);
  await db().query("delete from mfa_recovery_codes where email = $1", [target]);
  await db().query("delete from mfa_email_codes where email = $1", [target]);
  await audit(admin, "mfa-reset", null, `reset 2FA for ${target}`);
  return (rowCount ?? 0) > 0;
}

// ---------- Email codes ----------

const EMAIL_CODE_MINUTES = 10;

function hashEmailCode(email: string, code: string): string {
  return createHash("sha256").update(`${email.toLowerCase()}:${code}`).digest("hex");
}

/**
 * Sends a 6-digit code to the person's own work address. Used for email-method
 * setup and sign-in. Starting email setup switches a not-yet-finished app setup over.
 */
export async function sendEmailCode(email: string): Promise<CheckResult> {
  if (!emailEnabled()) return { ok: false, status: 503, error: "Email codes aren't switched on for this vault." };
  await ensureMfaSchema();
  const f = await factor(email);
  if (f?.enabled && f.method !== "email") {
    return { ok: false, status: 400, error: "You use an authenticator app for this vault. Enter the code from your app." };
  }
  if (!f) {
    await db().query(
      `insert into mfa_factors (email, secret_enc, method) values ($1, '', 'email') on conflict (email) do nothing`,
      [email]
    );
  } else if (!f.enabled && f.method !== "email") {
    await db().query("update mfa_factors set method = 'email', secret_enc = '' where email = $1 and enabled = false", [email]);
  }

  const { rows } = await db().query(
    `select
       count(*) filter (where at > now() - interval '60 seconds')::int as last_min,
       count(*) filter (where at > now() - interval '1 hour')::int as last_hour
     from audit_log where actor = $1 and action = 'mfa-email-sent'`,
    [email]
  );
  if (rows[0].last_min >= 1) return { ok: false, status: 429, error: "A code was just sent. Wait a minute before asking for another." };
  if (rows[0].last_hour >= 5) return { ok: false, status: 429, error: "Too many codes sent. Wait an hour, or ask a vault admin for help." };

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Only the newest code works.
  await db().query("update mfa_email_codes set used_at = now() where email = $1 and used_at is null", [email]);
  await db().query(
    `insert into mfa_email_codes (email, code_hash, expires_at) values ($1, $2, now() + interval '${EMAIL_CODE_MINUTES} minutes')`,
    [email, hashEmailCode(email, code)]
  );
  try {
    await sendCodeEmail(email, code, EMAIL_CODE_MINUTES);
  } catch (e) {
    await audit(email, "mfa-email-failed", null, "send error");
    console.error("[mfa] email send failed", e instanceof Error ? e.message : e);
    return { ok: false, status: 502, error: "Couldn't send the email. Try again in a minute." };
  }
  await audit(email, "mfa-email-sent", null, "code emailed");
  return { ok: true };
}

/** Uses up the person's newest unexpired email code if it matches. */
async function useEmailCode(email: string, input: string): Promise<boolean> {
  const code = input.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return false;
  const { rows } = await db().query<{ id: string; code_hash: string }>(
    `select id, code_hash from mfa_email_codes
     where email = $1 and used_at is null and expires_at > now()
     order by created_at desc limit 1`,
    [email]
  );
  if (!rows[0]) return false;
  const a = Buffer.from(rows[0].code_hash);
  const b = Buffer.from(hashEmailCode(email, code));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const used = await db().query("update mfa_email_codes set used_at = now() where id = $1 and used_at is null", [rows[0].id]);
  return used.rowCount === 1;
}
