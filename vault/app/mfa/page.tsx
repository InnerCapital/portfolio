import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { signOut } from "@/auth";
import { requireGoogleUser } from "@/lib/guard";
import { enrolledMethod, pendingSecret } from "@/lib/mfa";
import { emailEnabled } from "@/lib/mailer";
import { MFA_COOKIE, mfaValid } from "@/lib/mfaCookie";
import { otpauthUrl } from "@/lib/totp";
import MfaForm from "@/components/MfaForm";

export const dynamic = "force-dynamic";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ method?: string }> }) {
  const user = await requireGoogleUser();
  if (!user) redirect("/login");

  const jar = await cookies();
  if (await mfaValid(jar.get(MFA_COOKIE)?.value, user.email)) redirect("/");

  const method = await enrolledMethod(user.email);
  const canEmail = emailEnabled();
  const wantsEmail = canEmail && (await searchParams).method === "email";
  const emailSetup = !method && wantsEmail;
  let setup: { qr: string; secret: string } | null = null;
  if (!method && !wantsEmail) {
    const secret = await pendingSecret(user.email);
    const qr = await QRCode.toString(otpauthUrl(secret, user.email), {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 1,
      color: { dark: "#0d0d0d", light: "#ffffff" },
    });
    setup = { qr, secret: secret.replace(/(.{4})/g, "$1 ").trim() };
  }

  return (
    <main className="login">
      <div className="login-grid" aria-hidden="true" />
      <section className="login-card mfa-card">
        <p className="eyebrow">ACME HIRE. / Vault / Step 2 of 2</p>
        {emailSetup ? (
          <>
            <h1>Set up two-step sign-in</h1>
            <p className="muted" data-setup>
              Each time you sign in, the vault will email a 6-digit code to <strong>{user.email}</strong>. Send a code now to
              finish setting this up.
            </p>
            <p className="tiny muted" data-setup>
              An authenticator app is more secure, because a code by email only needs access to the same Google account.{" "}
              <a href="/mfa">Use an authenticator app instead</a>
            </p>
          </>
        ) : setup ? (
          <>
            <h1>Set up two-step sign-in</h1>
            <p className="muted" data-setup>
              The vault needs a code from an authenticator app as well as Google. You only set this up once.
            </p>
            <ol className="mfa-steps" data-setup>
              <li>Open an authenticator app on your phone: Google Authenticator, Microsoft Authenticator, 1Password or Authy.</li>
              <li>Scan this code, or type the setup key in by hand.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="mfa-qr" data-setup role="img" aria-label="QR code for your authenticator app" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <p className="tiny muted" data-setup>
              Setup key: <code className="mfa-key">{setup.secret}</code>
            </p>
            {canEmail && (
              <p className="tiny muted" data-setup>
                No authenticator app? <a href="/mfa?method=email">Get codes by email instead</a>
              </p>
            )}
          </>
        ) : method === "email" ? (
          <>
            <h1>Enter your code</h1>
            <p className="muted">We&apos;ll email a 6-digit code to {user.email}.</p>
          </>
        ) : (
          <>
            <h1>Enter your code</h1>
            <p className="muted">Open your authenticator app and enter the 6-digit code for AH Vault.</p>
          </>
        )}

        <MfaForm
          mode={method ? "signin" : "setup"}
          method={method ?? (emailSetup ? "email" : "totp")}
          email={user.email}
        />

        <p className="tiny muted">
          Signed in with Google as {user.email}.{" "}
          {method === "totp" && "Lost your phone? Use one of your recovery codes, or ask a vault admin to reset your two-step sign-in."}
        </p>
        <form
          action={async () => {
            "use server";
            (await cookies()).delete(MFA_COOKIE);
            await signOut({ redirectTo: "/login" });
          }}
        >
          <button className="link tiny" type="submit">
            Use a different account
          </button>
        </form>
      </section>
      <p className="login-foot tiny">Built by operators, for operators.</p>
    </main>
  );
}
