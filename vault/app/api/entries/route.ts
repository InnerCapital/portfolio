import { randomUUID } from "node:crypto";
import { audit, db, ensureEntriesSchema } from "@/lib/db";
import { invalidSharedWith, isRestricted } from "@/lib/access";
import { encrypt } from "@/lib/crypto";
import { requireUser } from "@/lib/guard";
import { PUBLIC_COLUMNS, parseInput } from "@/lib/entries";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });

  await ensureEntriesSchema();
  const { rows } = await db().query(
    `select ${PUBLIC_COLUMNS} from entries order by lower(category), lower(name)`
  );
  return Response.json({ entries: rows, user });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return Response.json({ error: "Not allowed" }, { status: 401 });
  if (!user.admin) return Response.json({ error: "Admins only" }, { status: 403 });

  const parsed = parseInput(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  const d = parsed.data;
  if (!d.name) return Response.json({ error: "Name is required" }, { status: 400 });
  if (isRestricted(d) && !user.keyholder) {
    return Response.json({ error: "Only keyholders can add API keys" }, { status: 403 });
  }
  if (!user.keyholder) delete d.shared_with;
  const bad = d.shared_with ? invalidSharedWith(d.shared_with) : null;
  if (bad) return Response.json({ error: `Can only share with @acmehire.example accounts (${bad})` }, { status: 400 });
  await ensureEntriesSchema();

  const id = randomUUID();
  const passwordEnc = d.password ? encrypt(d.password, id) : null;

  await db().query(
    `insert into entries
      (id, name, category, purpose, login_url, login_method, username, password_enc,
       owner, admins, access, two_fa, billing, notes, created_by, updated_by, restricted, shared_with)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15,$16,$17)`,
    [
      id,
      d.name,
      d.category || "General",
      d.purpose ?? "",
      d.login_url ?? "",
      d.login_method || "Password",
      d.username ?? "",
      passwordEnc,
      d.owner ?? "",
      d.admins ?? "",
      d.access ?? "",
      d.two_fa ?? "",
      d.billing ?? "",
      d.notes ?? "",
      user.email,
      d.restricted === true,
      d.shared_with ?? "",
    ]
  );
  await audit(user.email, "create", { id, name: d.name });
  return Response.json({ id }, { status: 201 });
}
