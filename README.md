# Operations Apps Portfolio

Seven internal tools built for a UK company that hires out container kitchens and bars for events. Together they cover the job from quote to final invoice: pricing, trader onboarding, handover inspections, asset tracking, staff access, accounting automation and a daily briefing for the owner.

All client names, people, domains, IDs, customer records and brand assets have been replaced with placeholders. The company appears as **"Acme Hire"**. Integrations are real and kept so the builds make sense.

| App | What it does | Stack |
|---|---|---|
| [`quote-tool`](quote-tool) | Quote generator: delivery pricing by distance band from two depots, peak and off-peak rates, payment schedule, branded PDF, export to Xero behind Google staff sign-in | HTML/JS, Netlify Functions, Netlify Blobs, Google Identity |
| [`trader-briefing`](trader-briefing) | Trader briefing pack plus generator: per-unit power and equipment specs, declaration sign-off with a generated PDF, booking pre-fill from Booqable | HTML/JS, Netlify Functions, pdf-lib, Google APIs, Claude |
| [`handover-app`](handover-app) | Handover and collection inspections: depot checks, photo evidence to Google Drive, staff sign-in, one-off customer job links by QR code | Next.js, TypeScript, Supabase, Google Drive, Claude |
| [`asset-register`](asset-register) | Fleet portal: unit status, live GPS trackers, rental history, QR asset landing pages | HTML/JS, Netlify Functions, Supabase, Google Sheets |
| [`staff-hub`](staff-hub) | Staff launchpad: Google sign-in verified on the server, tool list returned only to verified staff | HTML/JS, Netlify Functions, google-auth-library |
| [`xero-automation`](xero-automation) | Booqable to Xero rules as tested code: payment schedules, draft invoices, deferred-revenue journals, bank payment matching, deposit release. Dry run only | Node.js, `node:test` (23 tests) |
| [`ops-briefing`](ops-briefing) | Owner's daily briefing: collects email, calendar, Slack, Zoom, LinkedIn and Xero, summarises with Claude, delivers by Slack and email, plus an MCP server | Node.js, Claude API, Railway, MCP |

## Running

Each folder is self-contained, with its own `package.json` and README. For example:

```bash
cd xero-automation && npm test
```

The other apps need their own API keys (Google, Supabase, Booqable, Anthropic) in a local `.env`. No keys are included.
