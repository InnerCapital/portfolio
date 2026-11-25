# Vault

**Problem:** logins for the whole tech stack (bank, accounting, booking system, DNS, CRM, API keys) were shared in chat and spreadsheets. Nobody could say who had access to what, or who had last looked at a password.

**What I built:** an internal credential vault. For each tool it records the purpose, owner, login method, 2FA and recovery set-up, billing, and who has access, with the password encrypted.

## How it protects the data

- **Two-step sign-in.** Google sign-in on the company domain (enforced on the server), then a second step: an authenticator app (TOTP, with 10 single-use recovery codes) or a 6-digit code emailed to your work address. Codes cannot be replayed, and five failures lock sign-in for 15 minutes.
- **Encrypted at rest.** Passwords are encrypted with AES-256-GCM before they reach the database. The list view never receives a password; it is decrypted only when someone clicks reveal or copy.
- **Least privilege.** All staff can open the vault. Restricted entries (API keys, banking) can be revealed only by named keyholders, or by a specific person an entry is shared with.
- **Audit log.** Every create, edit, delete, reveal and blocked attempt is logged. Passwords never are. Admins can reset a lost second factor from the audit page.
- **Limits on exposure.** Revealed passwords hide after 15 seconds, copied ones are cleared from the clipboard after 30, and reveals are rate-limited per person.

## Tests

```bash
npm install && npm run typecheck
node --test test/*.test.mts   # 13 tests: RFC 6238 TOTP vectors, domain and keyholder rules, sharing
```

**Stack:** Next.js, TypeScript, Auth.js (Google), Postgres (Neon), Node crypto, Resend, Vercel. Setup: [`SETUP.md`](SETUP.md).
