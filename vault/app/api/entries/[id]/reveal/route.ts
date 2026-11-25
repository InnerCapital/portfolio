import { audit, db, ensureEntriesSchema } from "@/lib/db";
import { canReveal } from "@/lib/access";
import { decrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/guard";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_REVEALS_PER_MINUTE = 15;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  // Throttle bulk harvesting. The count lives in the database so it holds across serverless instances.
  const recent = await db().query(
    `select count(*)::int as n from audit_log
     where actor = $1 and action = 'reveal' and at > now() - interval '1 minute'`,
    [user.email]
  );
  if (recent.rows[0].n >= MAX_REVEALS_PER_MINUTE) {
    await audit(user.email, "reveal-blocked", null, "rate limit");
    return Response.json({ error: "Too many reveals, wait a minute" }, { status: 429 });
  }

  await ensureEntriesSchema();
  const { rows } = await db().query(
    "select id, name, password_enc, restricted, login_method, shared_with from entries where id = $1",
    [id]
  );
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });
  if (!canReveal(rows[0], user)) {
    await audit(user.email, "reveal-denied", { id: rows[0].id, name: rows[0].name }, "keyholders only");
    return Response.json({ error: "You don't have access to this one" }, { status: 403 });
  }
  if (!rows[0].password_enc) return Response.json({ error: "No password stored" }, { status: 404 });

  let password: string;
  try {
    password = decrypt(rows[0].password_enc, id);
  } catch {
    await audit(user.email, "reveal-failed", rows[0], "decrypt error");
    return Response.json({ error: "Could not decrypt this entry" }, { status: 500 });
  }

  await audit(user.email, "reveal", { id: rows[0].id, name: rows[0].name });
  return Response.json({ password });
}
