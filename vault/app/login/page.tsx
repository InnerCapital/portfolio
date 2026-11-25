import { signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const domain = process.env.ALLOWED_DOMAIN ?? "your workspace";

  return (
    <main className="login">
      <div className="login-grid" aria-hidden="true" />
      <section className="login-card">
        <p className="eyebrow">ACME HIRE. / Vault</p>
        <h1>Tools and access. One place.</h1>
        <p className="muted">Tools, access and credentials for the Acme Hire team.</p>
        {error && (
          <p className="error">That account is not allowed. Sign in with your @{domain} Google account.</p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn primary wide big" type="submit">
            Sign in with Google
            <span className="arrow" aria-hidden="true">→</span>
          </button>
        </form>
        <p className="tiny muted">Only @{domain} accounts can enter. Access is logged.</p>
      </section>
      <p className="login-foot tiny">Built by operators, for operators.</p>
    </main>
  );
}
