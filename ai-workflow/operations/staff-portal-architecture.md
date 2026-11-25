---
name: staff-portal-architecture
description: Design, extend or review a small company's internal tool estate: a staff hub (launcher), staff-only web tools, a secrets vault, customer-facing links, custom subdomains, Google sign-in and alerting. Use when adding a tool or tile to a staff portal, setting up staff sign-in, planning subdomains/DNS for internal tools, adding a vault, giving external people (customers, couriers) access, or reviewing the security of internal tools.
---

# Staff portal architecture

The pattern behind Acme Hire's internal tools: several small single-purpose apps on their own subdomains, one hub that links them, one vault for secrets, and Google Workspace as the only identity. It suits a team of 2 to 20 with no IT department.

## Shape

```
                 Google Workspace (identity: @company domains only)
                                   |
  staff.<domain>   hub: tiles only, catalog sent after sign-in is verified
     |-- quote.<domain>      quote tool        (staff sign-in on save/send)
     |-- traders.<domain>    trader briefing   (staff page + customer link)
     |-- handover.<domain>   handover app      (staff + one-off job links)
     |-- assets.<domain>     asset register    (public QR page + staff view)
     |-- vault.<domain>      secrets vault     (Google + second factor, admins)
     `-- Drive, Gmail, Booqable, Xero, Attio...  (links out; each has its own login)

  Shared data: one Postgres (Supabase) for the tools' records.
  Files: one shared drive the tools write to by folder ID; a separate company shared drive for people's documents.
  Alerts: tools -> one webhook relay -> one private Slack channel.
```

## Rules

### Identity
1. **Google sign-in, verified on the server, every time.** The browser never decides who someone is. Check the ID token's signature and audience (google-auth-library or tokeninfo), then `email_verified`, the email domain against an allow-list, and the `hd` (hosted domain) claim, so a personal Gmail with a forwarding alias can't get in.
2. **One OAuth client per trust zone.** The low-risk tools share one client; the vault has its own. Every hostname a tool is served on (custom domain and the host's default URL) must be in the client's Authorised JavaScript origins, or the button shows "origin not allowed". Add the origin before switching a tool to a new domain.
3. **Sessions are HttpOnly signed cookies** (HMAC with a server secret), host-only (no `Domain=` attribute, so one tool's cookie never reaches another), with a fixed lifetime: 1 hour for the hub's token, 8 hours for ops and vault, 12 hours for the field app. Rotating the secret signs everyone out.
4. **No roles you don't need.** Staff vs not-staff covers most tools. Add an admin list (an env var of emails) only where actions differ, as in the vault.

### Hub
5. **The public page has no links.** The tile list comes from a server function only after sign-in passes. Mark the page `noindex`. Set a CSP (allow inline styles only if the Google button needs them).
6. **One catalog file** holds the tiles: name, one-line description, URL, status (`live` clickable; `setup`/`build` greyed out). Group them (our tools, hire and money, Google Workspace, website, admin). Adding a tool is a one-line change and a push.
7. **Icons by keyword**, with a fallback. When renaming a tile, check its icon rule still matches.
8. **The hub holds no keys and reads no data.** It is links only. Each tool still asks for its own login.
9. **Log every sign-in attempt** (email, outcome, reason) to the function log, never the token.

### Secrets
10. **Env vars live only in each tool's host** (Netlify, Vercel, Railway). Nothing on laptops. New or revoked keys are made in the provider's dashboard, then set in the host.
11. **The vault** holds logins and API keys for people: Google sign-in, then an authenticator or email code, recovery codes, encrypted password field, every reveal logged, rate-limited reveals, admin-only edits and audit log. Back up the encryption key separately; losing it loses every password.
12. **Tools never hold each other's keys.** If tool A needs B's data, it calls B's API with its own scoped key, or goes through a webhook.

### External people
13. **Customers and couriers never get accounts.** Give them a one-off link: a random token stored on the record, a cookie scoped to that one record, a 24-hour expiry, single use, and a new link that cancels the old one. They can fill in what the job needs (photos, checklist, signature) and nothing else.
14. **Public pages show the minimum.** A QR code on a unit opens a page with ID, type, inspection badge and a contact address, never location, client, serials or tracker data. Staff go deeper through a sign-in button.

### Domains
15. **One subdomain per tool**, each a CNAME to its host. No wildcard records. The apex stays the marketing site. Keep a DNS change sheet for whoever runs DNS, and add a verification TXT when a host asks for one.
16. **After DNS goes live, check the certificate.** Hosts stop retrying certificates if the domain was added long before DNS existed; trigger "verify DNS" and "provision certificate" again.
17. Update every place the old URL lives: hub catalog, base-URL env vars (emails and alerts embed them), OAuth origins, printed QR codes, guides.

### Writes and alerts
18. **Writes to money and CRM systems start in safe mode.** An env var like `X_TEST_MODE` where only the exact word `false` writes for real; the tool logs what it would send. Switch off only after a person has checked the logged payloads.
19. **One alert path.** Tools post to one webhook relay (Zapier) that posts as a bot into one private channel. Mask phone numbers and never post secrets. Blank webhook = alerts off.
20. **Daily scheduled checks** chase what people forget (unsigned forms, overdue refunds) by posting to the same channel.

## Adding a tool: checklist
1. Pick the subdomain; add the custom domain in the host; give the DNS owner the CNAME (and TXT if asked).
2. Add the hostname(s) to the right OAuth client's JavaScript origins (and redirect URI for server-side flows).
3. Gate every server route with the shared staff check; keep public routes to the minimum.
4. Set env vars in the host only; record key names (not values) in the tool's guide.
5. Add the tile to the hub catalog; check the icon; run the hub tests; push.
6. Verify live: unauthenticated API call returns 401; the page loads on the custom domain with a valid certificate; a real staff sign-in works.
7. Write the staff guide (summary, who uses it, how to use it, what it connects to, settings by name, known gaps, troubleshooting) and link it from the system overview.

## Review checklist
- Any route that trusts the browser about identity or role?
- Any cookie with a parent-domain scope, or no expiry?
- Any secret in the repo, a page, a guide or a chat?
- Any public page leaking location, client, serials, tracker or internal links?
- Any file shared "anyone with the link" that holds customer data?
- Any write path to money or CRM that is live without a person having checked it?
- Any tool whose old URL is still printed, emailed or bookmarked?

## Example: Acme Hire

| Tool | Address | Host | Sign-in |
|---|---|---|---|
| Staff hub | staff.acmehire.example | Netlify | Google ID token verified in function; catalog in `netlify/functions/lib/catalog.js` |
| Quote tool | quote.acmehire.example | Netlify | `requireStaff` on Save PDF and Send to Booqable |
| Trader Briefing | traders.acmehire.example | Netlify | Staff page `/generate`; customer link token |
| Handover app | handover.acmehire.example | Netlify | staff cookie 12h; job links `/job/<token>` 24h |
| Asset register | assets.acmehire.example | Netlify | Public QR page; staff ops cookie 8h |
| Vault | vault.acmehire.example | Vercel | Google + TOTP or email code; `ADMIN_EMAILS` |
| Booking page | booking.acmehire.example | Booqable | Booqable's own |

Allowed domains: acmehire.example, acmefund.example. DNS: the registrar, changed by an external contact. Alerts: Zapier "#bookings Alert Relay" into private Slack #bookings. Files: "Acme Digital Storage" (tools write here) and the company shared drive (hub tile "Company drive"). All accounts reached through the shared admin mailbox; keys in the vault.
