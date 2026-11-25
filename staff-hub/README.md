# Staff hub

**Problem:** the company ran on more than a dozen tools across several hosts. New staff did not know what existed, links lived in chat history, and an internal tool list on a public page shows outsiders what to target.

**What I built:** one sign-in page at `staff.<domain>` that lists every tool, but only after the server has checked who you are.

- **Google sign-in, verified on the server.** The page source holds no tool links. The list comes from a function that checks the Google ID token (audience, expiry, verified email, company domain) and returns nothing otherwise.
- **One catalogue** ([`netlify/functions/lib/catalog.js`](netlify/functions/lib/catalog.js)) of internal apps and SaaS tools, each with a plain-English line on what it is for and whether it is live.
- **No secrets.** The hub stores no keys or passwords. It points to the [vault](../vault), and shows that link only to the people who should have it.
- **Built for daily use:** a container-shaped tile design, a `/` shortcut to filter, skeleton loading, and every sign-in attempt logged with its outcome (never the token).

## Tests

```bash
npm install && npm test   # 11 tests: token rejection cases and vault-link visibility
```

**Stack:** HTML/CSS/JS, Netlify Functions, google-auth-library. Setup: [`SETUP.md`](SETUP.md).
