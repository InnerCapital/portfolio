// Who may open the vault, and who may see restricted (API key) entries.
// Pure functions, no Next.js imports, so they can be unit-tested.

export function allowedDomain(): string {
  return (process.env.ALLOWED_DOMAIN ?? "").trim().toLowerCase();
}

function emailList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function adminEmails(): string[] {
  return emailList("ADMIN_EMAILS");
}

// Any verified @ALLOWED_DOMAIN Google account can open the vault and see ordinary passwords.
export function emailAllowed(email: string | null | undefined): boolean {
  const domain = allowedDomain();
  if (!domain || !email) return false;
  return email.toLowerCase().endsWith("@" + domain);
}

// Keyholders are the only people who can reveal, edit or delete restricted entries
// (API keys, tokens, passcodes). VAULT_KEYHOLDERS (comma-separated) overrides the list.
const DEFAULT_KEYHOLDERS = ["hello@acmehire.example", "director@acmehire.example", "opsmanager@acmehire.example"];

export function keyholders(): string[] {
  const fromEnv = emailList("VAULT_KEYHOLDERS");
  return fromEnv.length ? fromEnv : DEFAULT_KEYHOLDERS;
}

export function isKeyholder(email: string | null | undefined): boolean {
  if (!email || !emailAllowed(email)) return false;
  return keyholders().includes(email.toLowerCase());
}

// Restricted entries can also be shared with named staff (e.g. Revolut with the coordinator).
export function parseSharedWith(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function invalidSharedWith(value: string): string | null {
  const bad = parseSharedWith(value).find((e) => !emailAllowed(e) || !/^[^@\s]+@[^@\s]+$/.test(e));
  return bad ?? null;
}

// Can this person reveal this entry's secret?
export function canReveal(
  entry: { restricted?: boolean | null; login_method?: string | null; shared_with?: string | null },
  user: { email: string; keyholder: boolean }
): boolean {
  if (!isRestricted(entry) || user.keyholder) return true;
  return parseSharedWith(entry.shared_with).includes(user.email.toLowerCase());
}

// An entry is restricted if it is flagged, or if its login method is "API key".
export const RESTRICTED_METHOD = "API key";
export function isRestricted(entry: { restricted?: boolean | null; login_method?: string | null }): boolean {
  return entry.restricted === true || entry.login_method === RESTRICTED_METHOD;
}
