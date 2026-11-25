import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/guard";
import TopBar from "@/components/TopBar";
import MfaReset from "@/components/MfaReset";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  at: Date;
  actor: string;
  action: string;
  entry_name: string | null;
  detail: string;
};

export default async function AuditPage() {
  const user = await requireUser();
  if (!user) redirect("/mfa");
  if (!user.admin) redirect("/");

  const { rows } = await db().query<Row>(
    "select id, at, actor, action, entry_name, detail from audit_log order by at desc limit 300"
  );

  return (
    <>
      <TopBar section="Audit log">
        <a href="/" className="navlink">
          Back to vault
        </a>
      </TopBar>
      <main className="wrap">
        <div className="page-head">
          <p className="eyebrow">Admin only</p>
          <h1>Audit log</h1>
          <p className="muted">Latest 300 events. Passwords themselves are never written to this log.</p>
        </div>
        <MfaReset />
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Who</th>
                <th>Action</th>
                <th>Entry</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.at).toLocaleString("en-GB", { timeZone: "Europe/London" })}</td>
                  <td>{r.actor}</td>
                  <td>
                    <span className={`pill ${r.action.startsWith("reveal") || r.action === "mfa-failed" || r.action === "mfa-blocked" || r.action === "mfa-reset" ? "warn" : ""}`}>
                      {r.action}
                    </span>
                  </td>
                  <td>{r.entry_name ?? ""}</td>
                  <td>{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
