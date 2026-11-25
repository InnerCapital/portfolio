// Sends sign-in codes through Resend's HTTP API (no extra dependency).
// Needs RESEND_API_KEY on the Vercel project. MFA_EMAIL_FROM is optional and
// must be on a domain verified in Resend (acmehire.example is).

// Local testing only: prints the code to the server log instead of emailing it.
// Ignored in production builds.
const devLog = () => process.env.NODE_ENV !== "production" && process.env.MFA_EMAIL_DEV_LOG === "1";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || devLog();
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendCodeEmail(to: string, code: string, minutes: number): Promise<void> {
  if (devLog()) {
    console.log(`[dev] AH Vault code for ${to}: ${code}`);
    return;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const from = process.env.MFA_EMAIL_FROM || "AH Vault <noreply@acmehire.example>";
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${spaced} is your AH Vault sign-in code`,
      text:
        `Your AH Vault sign-in code is ${spaced}.\n\n` +
        `It works once and expires in ${minutes} minutes.\n\n` +
        `If you didn't just try to sign in to the vault, don't use this code and tell a vault admin straight away.`,
      html:
        `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0d0d0d;max-width:480px">` +
        `<p style="letter-spacing:.12em;font-size:11px;color:#5a5a5a;text-transform:uppercase">ACME HIRE. / Vault</p>` +
        `<p>Your sign-in code is</p>` +
        `<p style="font-size:32px;font-weight:700;letter-spacing:.15em;margin:8px 0 16px">${escapeHtml(spaced)}</p>` +
        `<p style="color:#5a5a5a">It works once and expires in ${minutes} minutes.</p>` +
        `<p style="color:#5a5a5a">If you didn't just try to sign in to the vault, don't use this code and tell a vault admin straight away.</p>` +
        `</div>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
}
