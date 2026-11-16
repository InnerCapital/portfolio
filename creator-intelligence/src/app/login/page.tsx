import { googleConfigured } from "@/lib/auth";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const sp = await searchParams;
  const google = googleConfigured();
  const password = Boolean(process.env.APP_PASSWORD);
  const next = sp.next || "/";
  return (
    <main className="login">
      <div className="login-card">
        <div className="eyebrow">Inner Capital</div>
        <h1>Ideas Bank</h1>
        <p className="muted">Your inspiration, your audience, your briefs. Sign in to open your own bank.</p>
        {sp.error ? <p className="danger">{sp.error}</p> : null}
        {google ? (
          <a className="btn primary" href={`/api/auth/google?next=${encodeURIComponent(next)}`}>Continue with Google</a>
        ) : null}
        {password ? (
          <form method="post" action="/api/auth/password">
            <input type="hidden" name="next" value={next} />
            <label className="label" htmlFor="password">{google ? "Or use the shared password" : "Password"}</label>
            <input id="password" name="password" type="password" required />
            <button className="btn" type="submit">Open</button>
          </form>
        ) : null}
        {!google && !password ? <p className="danger">No sign-in method is configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or APP_PASSWORD for local use.</p> : null}
      </div>
    </main>
  );
}
