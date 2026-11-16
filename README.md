# Travis Hill — Portfolio

I build the software small businesses actually run on. I take a manual process (quotes in spreadsheets, paper handover forms, invoices typed into Xero by hand) and turn it into a working tool, usually in days, not months.

Most of my work sits where operations meets AI: internal tools that connect the systems a company already uses (Xero, Booqable, Google Workspace, Slack, Supabase) and use Claude where it saves someone real time, such as reading documents, summarising a day's inbox or scoring content. I care about the details that make a tool trustworthy: server-side auth, dry runs before anything writes to the accounts, tests on the money logic, and honest numbers rather than guesses.

**Stack I use most:** TypeScript and JavaScript, Next.js, Node.js, Supabase/Postgres, Prisma, Netlify, Railway, Vercel, the Claude API and MCP, and Google, Xero and Booqable APIs.

## Operations apps (this repo)

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

## Also built (not in this repo)

- **Creator content intelligence:** pulls a creator's real Instagram, TikTok and LinkedIn metrics, benchmarks each post against the creator's own baseline per platform, breaks videos down into hook, script, pacing and packaging scores, and finds which hook types over-perform. Next.js, Prisma, Postgres, Apify, Claude.
- **Brand-deal CRM for creators:** deal pipeline, per-deliverable drafts, payment terms and chasing, contract review, file delivery with client review rounds, and rate benchmarks across deals. React, Supabase with row-level security, edge functions.
- **Voice operations assistant:** a spoken daily assistant over email, calendar and tasks, with drafts only and nothing sent without approval. Next.js, Supabase, Claude, speech-to-text and text-to-speech.
- **Decision-making learning game:** short scenario-based lessons that teach strategy and negotiation through consequences rather than right answers. Web app plus API.

## Running

Each folder is self-contained, with its own `package.json` and README. For example:

```bash
cd xero-automation && npm test
```

The other apps need their own API keys (Google, Supabase, Booqable, Anthropic) in a local `.env`. No keys are included.

## Contact

- Email: _add your email_
- LinkedIn: _add your LinkedIn URL_
- Website: _add your site_
