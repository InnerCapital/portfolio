import { Pool } from "pg";

const globalForPool = globalThis as unknown as { __vaultPool?: Pool };

export function db(): Pool {
  if (!globalForPool.__vaultPool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    globalForPool.__vaultPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    });
  }
  return globalForPool.__vaultPool;
}

export async function audit(
  actor: string,
  action: string,
  entry?: { id: string; name: string } | null,
  detail = ""
) {
  await db().query(
    "insert into audit_log (actor, action, entry_id, entry_name, detail) values ($1, $2, $3, $4, $5)",
    [actor, action, entry?.id ?? null, entry?.name ?? null, detail]
  );
}

// Adds the "restricted" flag to entries on first use. Safe to run repeatedly.
let entriesSchema: Promise<void> | undefined;
export function ensureEntriesSchema(): Promise<void> {
  entriesSchema ??= db()
    .query(
      `alter table entries add column if not exists restricted boolean not null default false;
       alter table entries add column if not exists shared_with text not null default ''`
    )
    .then(() => undefined)
    .catch((err) => {
      entriesSchema = undefined;
      throw err;
    });
  return entriesSchema;
}
