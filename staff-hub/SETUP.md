# Acme Hire Staff Hub

One page linking every Acme Hire tool, for staff only. Planned address: `staff.acmehire.example`.

- **Sign-in:** Google, `acmehire.example` and `acmecapital.example` accounts only. Same OAuth client and rules as the quote tool.
- **What is gated:** the tool list comes from `/.netlify/functions/tools`, which verifies the Google ID token on the server. The public page source holds no tool links.
- **Secrets:** none. The hub stores no API keys. Keys and passwords live in the vault, which only the director and hello@acmehire.example can open. The hub shows those two accounts a link to it; everyone else sees who to ask.

## Files

| Path | What it is |
| --- | --- |
| `public/` | The page (`index.html`, `app.js`, `styles.css`, logo) |
| `netlify/functions/tools.js` | Returns the tool list to signed-in staff |
| `netlify/functions/lib/catalog.js` | **The tool list. Edit this to add, remove or re-point a tool.** |
| `netlify/functions/lib/requireStaff.js` | Google token check |
| `scripts/dev.js` | Local preview with a fake signed-in user. Never deployed |
| `test/` | `npm test` |

## Netlify environment variables

| Name | Value |
| --- | --- |
| `VAULT_URL` | The vault's https address |
| `VAULT_ADMINS` | `hello@acmehire.example,<the director's address>` (comma-separated) |

Both must be set or nobody sees the Vault link. Nothing else is needed.

## Go-live steps

1. Create a GitHub repo (Acme Hire org) and push.
2. Create a Netlify site from the repo. Publish directory `public` is set in `netlify.toml`.
3. Set the two environment variables above.
4. Google Cloud (project "Acme Hire Handover") → the OAuth client `YOUR_GOOGLE_CLIENT_ID` → **Authorized JavaScript origins**: add the Netlify address and `https://staff.acmehire.example`. Until this is done the sign-in button shows "origin not allowed".
5. Netlify → Domain management → add `staff.acmehire.example`. Ask the DNS admin to add `staff` CNAME → `<site>.netlify.app` in the DNS provider.

## Local preview

```bash
npm install
npm run dev                                   # staff view, http://localhost:3021
DEV_EMAIL=hello@acmehire.example npm run dev     # admin view (shows a placeholder vault link)
```

Google sign-in itself does not run locally; the preview fakes the signed-in user.
