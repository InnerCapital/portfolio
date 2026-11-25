import { audit, db, ensureEntriesSchema } from "@/lib/db";
import { invalidSharedWith, isRestricted } from "@/lib/access";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/guard";
import { TEXT_FIELDS, parseInput } from "@/lib/entries";

export const dynamic = "force-dynamic";

// Keyholders only may touch an entry that is restricted now, or make one restricted.
async function lockedFor(id: string, keyholder: boolean): Promise<Response | null> {
  if (keyholder) return null;
  await ensureEntriesSchema();
  const { rows } = await db().query("select restricted, login_method from entries where id = $1", [id]);
  if (rows.length && isRestricted(rows[0])) {
    return Response.json({ error: "Only keyholders can change API key entries" }, { status: 403 });
  }
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });
  if (!user.admin) return Response.json({ error: "Admins only" }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  const parsed = parseInput(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;
  const locked = await lockedFor(id, user.keyholder);
  if (locked) return locked;
  if (isRestricted(d) && !user.keyholder) {
    return Response.json({ error: "Only keyholders can mark entries as API keys" }, { status: 403 });
  }
  // Only keyholders decide who an entry is shared with.
  if (!user.keyholder) delete d.shared_with;
  const bad = d.shared_with ? invalidSharedWith(d.shared_with) : null;
  if (bad) return Response.json({ error: `Can only share with @acmehire.example accounts (${bad})` }, { status: 400 });
  if (d.name !== undefined && !d.name) {
    return Response.json({ error: "Name cannot be empty" }, { status: 400 });
  }

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const field of TEXT_FIELDS) {
    if (d[field] !== undefined) {
      values.push(d[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  // A blank password field means "leave the password unchanged".
  if (d.restricted !== undefined) {
    values.push(d.restricted);
    sets.push(`restricted = $${values.length}`);
  }
  let passwordChanged = false;
  if (d.password) {
    values.push(encrypt(d.password, id));
    sets.push(`password_enc = $${values.length}`);
    passwordChanged = true;
  }
  if (sets.length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });

  values.push(user.email);
  sets.push(`updated_by = $${values.length}`, "updated_at = now()");
  values.push(id);

  const { rows } = await db().query(
    `update entries set ${sets.join(", ")} where id = $${values.length} returning id, name`,
    values
  );
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

  await audit(user.email, passwordChanged ? "update+password" : "update", rows[0]);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });
  if (!user.admin) return Response.json({ error: "Admins only" }, { status: 403 });

  const { id } = await ctx.params;
  if (!UUID.test(id)) return Response.json({ error: "Bad id" }, { status: 400 });
  const locked = await lockedFor(id, user.keyholder);
  if (locked) return locked;

  const { rows } = await db().query("delete from entries where id = $1 returning id, name", [id]);
  if (rows.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

  await audit(user.email, "delete", rows[0]);
  return Response.json({ ok: true });
}
