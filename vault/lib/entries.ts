export const TEXT_FIELDS = [
  "name",
  "category",
  "purpose",
  "login_url",
  "login_method",
  "username",
  "owner",
  "admins",
  "access",
  "two_fa",
  "billing",
  "notes",
  "shared_with",
] as const;

export type TextField = (typeof TEXT_FIELDS)[number];

const MAX_LEN: Record<TextField, number> = {
  name: 120,
  category: 60,
  purpose: 500,
  login_url: 300,
  login_method: 60,
  username: 200,
  owner: 200,
  admins: 300,
  access: 1000,
  two_fa: 300,
  billing: 300,
  notes: 3000,
  shared_with: 500,
};

export type EntryInput = Partial<Record<TextField, string>> & { password?: string; restricted?: boolean };

export function parseInput(body: unknown): { ok: true; data: EntryInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid body" };
  const src = body as Record<string, unknown>;
  const data: EntryInput = {};
  for (const field of TEXT_FIELDS) {
    const v = src[field];
    if (v === undefined) continue;
    if (typeof v !== "string") return { ok: false, error: `${field} must be text` };
    if (v.length > MAX_LEN[field]) return { ok: false, error: `${field} is too long` };
    data[field] = v.trim();
  }
  if (src.password !== undefined) {
    if (typeof src.password !== "string") return { ok: false, error: "password must be text" };
    if (src.password.length > 1000) return { ok: false, error: "password is too long" };
    data.password = src.password;
  }
  if (src.restricted !== undefined) {
    if (typeof src.restricted !== "boolean") return { ok: false, error: "restricted must be true or false" };
    data.restricted = src.restricted;
  }
  return { ok: true, data };
}

export type EntryRow = {
  id: string;
  name: string;
  category: string;
  purpose: string;
  login_url: string;
  login_method: string;
  username: string;
  has_password: boolean;
  restricted: boolean;
  owner: string;
  admins: string;
  access: string;
  two_fa: string;
  billing: string;
  notes: string;
  shared_with: string;
  updated_by: string;
  updated_at: string;
};

// Never select password_enc into anything that leaves the server.
export const PUBLIC_COLUMNS = `id, name, category, purpose, login_url, login_method, username,
  (password_enc is not null) as has_password,
  (restricted or login_method = 'API key') as restricted, shared_with, owner, admins, access, two_fa, billing, notes,
  updated_by, updated_at`;
