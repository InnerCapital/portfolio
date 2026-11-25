# Acme Hire Vault: setup

Internal vault for the Acme Hire tech stack. Each entry records the tool, its purpose, login method, username, an encrypted password, owner, admins, who has access, 2FA and recovery, billing, and notes.

- Sign in is Google only, and only accounts on your Workspace domain get in. The domain is enforced on the server, not just in the Google screen.
- Passwords are encrypted with AES-256-GCM before they reach the database. The list view never receives passwords. A password is only decrypted when someone clicks reveal or copy.
- Every create, edit, delete, reveal and blocked attempt goes in an audit log (admins can read it). Passwords are never logged.
- Everyone on the domain can view and reveal. Only emails in `ADMIN_EMAILS` can add, edit, delete and see the audit log.
- Revealed passwords hide after 15 seconds. Copied passwords are cleared from the clipboard after 30 seconds, best effort.
- Reveals are limited to 15 a minute per person.

## Setup

### 1. Google sign-in
1. In Google Cloud Console, create a project, then go to APIs & Services > OAuth consent screen.
2. Choose **Internal**. This restricts the app to your Workspace organisation at Google's end too.
3. Go to Credentials > Create credentials > OAuth client ID > Web application.
4. Add authorised redirect URIs:
   - `https://YOUR-APP.vercel.app/api/auth/callback/google`
   - `http://localhost:3000/api/auth/callback/google` (only if you will run it locally)
5. Copy the client ID and secret into `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.

### 2. Database
1. In Vercel, open Storage and create a Postgres database (Neon). Copy its connection string into `DATABASE_URL`.
2. Put your values in a local `.env.local` (copy `.env.example`), then run:

```
npm install
npm run db:init
```

### 3. Keys
```
npm run gen:key        # prints a value for VAULT_KEY
npx auth secret        # or: openssl rand -base64 32, for AUTH_SECRET
```

**Back up `VAULT_KEY` somewhere safe and separate (a second admin's password manager, a printed copy in a safe).** If it is lost, every stored password is unrecoverable. If it leaks together with the database, every password is exposed.

### 4. Deploy to Vercel
1. Put this folder in a **private** repository and import it in Vercel, or run `npx vercel` from this folder.
2. Add all variables from `.env.example` under Project Settings > Environment Variables.
3. Set them for **Production only**. Do not give Preview deployments the real `DATABASE_URL` or `VAULT_KEY`.
4. In Project Settings > Deployment Protection, turn on protection for previews.
5. Deploy, open the URL, and sign in with an admin account.

## Things to know

- A removed or suspended Google user cannot sign in again, but an existing session can last up to 8 hours. For an urgent offboarding, rotate the passwords that person could see.
- There is no per-entry permission. Anyone on the domain can reveal any password. If some logins should be restricted to a few people (banking, payroll), keep those out of this app.
- There is no key rotation tool yet. Changing `VAULT_KEY` would need a one-off script that decrypts with the old key and re-encrypts with the new one.
- Turn on 2-step verification enforcement in Google Workspace admin. This vault is only as strong as the Google accounts that open it.
- A purpose-built manager (1Password, Bitwarden) has had far more security review than this app. Treat this as a team directory with a secured password field, and prefer SSO over stored passwords wherever a tool supports it.

## Two-step sign-in

After Google, everyone must enter a 6-digit code. At setup each person picks one method:

- **Authenticator app** (recommended): Google Authenticator, Microsoft Authenticator, 1Password, Authy.
- **Email code:** a code sent to their own @acmehire.example address, valid 10 minutes, single use, newest code only. Needs `RESEND_API_KEY` on the Vercel project (optional `MFA_EMAIL_FROM`, default `AH Vault <noreply@acmehire.example>`). Without the key the email option is hidden. Max 1 email a minute and 5 an hour per person. Note this protects less than the app, because the code goes to the same Google account used in step 1.

- **First visit:** the vault shows a QR code. Scan it, enter the code, and save the 10 recovery codes shown (each works once if the phone is lost).
- **After that:** Google, then the 6-digit code. The second step lasts as long as the Google session (8 hours) and is cleared on sign out.
- **Lost phone:** use a recovery code, or an admin resets that person's two-step sign-in from the Audit log page. They then set it up again.
- **Security:** codes are checked server-side on every page and API call, a used code can't be reused, and 5 wrong codes in 15 minutes locks that person out for 15 minutes. Setup, sign-ins, failures, lockouts and resets are all in the audit log. The authenticator secret is encrypted with `VAULT_KEY`, like stored passwords.
- **Tables:** `mfa_factors` and `mfa_recovery_codes` are created automatically on first use (also in `schema.sql`).
- **First-time setup is trust-on-first-use:** whoever completes setup for an account first owns its second factor. Set it up for every account straight after deploying, and reset any account whose setup you didn't expect (check the audit log for `mfa-enrolled`).
