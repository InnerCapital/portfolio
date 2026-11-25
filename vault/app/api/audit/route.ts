import { db } from "@/lib/db";
import { requireUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });
  if (!user.admin) return Response.json({ error: "Admins only" }, { status: 403 });

  const { rows } = await db().query(
    "select id, at, actor, action, entry_name, detail from audit_log order by at desc limit 300"
  );
  return Response.json({ log: rows });
}
