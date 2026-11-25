# Travis Hill: Operations leader, AI-native systems builder

I run operations, and I build the systems they run on.

I was on the founding team of a consumer brand that grew from a kitchen to £13M+ in cumulative revenue, first as Head of Operations and then as COO, and it made the Sunday Times 100 fastest-growing private companies list in 2024. I owned strategy, the P&L, the supply chain and investor relations, and led teams of up to 22 across four countries. I trained in operations at Goldratt (Theory of Constraints, Lean) and hold a BEng in Engineering.

Most recently, as Operations Manager (Systems and Technology) at an events hire business, I designed and built the company's operating system from scratch. This repo holds those tools, white-labelled.

## What this repo shows

- **Operations design.** I map the job end to end (quote, booking, onboarding, handover, collection, invoice), find where work stalls or gets typed twice, and give each stage one owner and one system. See **[SYSTEM.md](SYSTEM.md)** for how the pieces fit together.
- **Controls, not just automation.** Server-verified sign-in on every tool, drafts before anything touches money, test mode by default, audit logs, and a person signing off on every financial and damage decision.
- **AI used where it pays off.** Claude reads insurance certificates and hire agreements, checks photo evidence, compares condition photos and writes summaries. It removes manual checks; it does not make decisions.
- **Shipping discipline.** Each tool started as the smallest useful version, was tested on real jobs and then extended. Business rules are written as code with tests: **88 automated tests** across the apps.
- **AI-native building.** I build with Claude as a working partner, guided by skills I wrote myself, which lets one operator ship production software that would usually need a small team. See **[ai-workflow](ai-workflow)** for those skills and the rules I hold the model to.

## The operations system

Eight tools for a UK company that hires out container kitchens and bars for events, covering the job from first quote to final invoice. The company appears as **"Acme Hire"**. All names, people, domains, IDs, addresses, customer records and brand assets are placeholders. The integrations are real.

| Tool | The problem it solves | Built with |
|---|---|---|
| [`quote-tool`](quote-tool) | Hand-built quotes with inconsistent pricing and terms. Now: rate-card pricing by depot distance and season, a branded PDF, and a draft order sent to the booking system | HTML/JS, Netlify Functions, Booqable, Attio |
| [`trader-briefing`](trader-briefing) | Declarations and insurance chased by email. Now: pre-filled briefing links from the CRM, e-signed declarations, AI insurance checks and automatic chasing | Netlify Functions, Supabase, pdf-lib, Claude, Attio, Booqable |
| [`handover-app`](handover-app) | No defensible record of unit condition. Now: four recorded checkpoints, AI-checked photo evidence, signed certificates, QR scanning and one-off job links | Next.js, TypeScript, Supabase, Google Drive, Claude, WhatsApp API |
| [`asset-register`](asset-register) | A fleet tracked in a spreadsheet. Now: live status, GPS, bookings and inspection badges, with public QR pages that show only what is safe | HTML/JS, Netlify Functions, Supabase, Hapn GPS, Claude |
| [`staff-hub`](staff-hub) | Tools scattered across hosts and chat history. Now: one front door, with the tool list returned only to verified staff | Netlify Functions, Google Identity |
| [`vault`](vault) | Shared logins in chat. Now: encrypted credentials, two-step sign-in, keyholder-only secrets and a full audit log | Next.js, Auth.js, Postgres, AES-256-GCM, TOTP |
| [`xero-automation`](xero-automation) | Deposits, deferred revenue and refunds handled by hand in the accounts. Now: the finance rules written as tested code, running as a dry run that prints every entry before anything posts | Node.js, `node:test` |
| [`ops-briefing`](ops-briefing) | An owner buried in email, Slack and calendar. Now: one daily briefing summarised by Claude, plus an MCP server for follow-up questions | Node.js, Claude API, MCP, Railway |

Zapier automations join the tools together (job numbering, payment matching, release-gate alerts). They are described in [SYSTEM.md](SYSTEM.md).

## How I work with AI

[`ai-workflow`](ai-workflow) holds the Claude skills I wrote and use daily:

- **Operating system:** Analyst → Operator → Engineer modes built on Theory of Constraints, Lean and pre-mortems, with a rule that nothing counts as fixed without proof.
- **Domain skills:** the operations playbook and design system that give Claude the business context (white-labelled and trimmed).
- **Content skills:** a three-stage pipeline from a raw life moment to platform-native posts (story mining, audience psychology and Big Ideas, content waterfall).

## Also in this repo

[`creator-intelligence`](creator-intelligence) is a white-label content-intelligence product for a creator. It benchmarks every post against the creator's own baseline on each platform, breaks videos down into hook, script, pacing and packaging scores, finds which hook types beat their usual results, and suggests what to post next, each suggestion backed by a real figure. Next.js, Prisma/Postgres, Apify, Claude.

## Also built (not in this repo)

- **Brand-deal CRM for creators:** deal pipeline, AI-drafted deliverables, payment terms and chasing, contract review, file delivery with client review rounds, and rate benchmarks. React, Supabase with row-level security.
- **Voice operations assistant:** a spoken daily assistant over email, calendar and tasks. It only drafts; nothing is sent without approval.
- **Decision-making learning game:** scenario-based lessons in strategy and negotiation.

## Stack I use most

TypeScript and JavaScript, Next.js, Node.js, Postgres (Supabase, Neon) and Prisma, Netlify, Vercel and Railway, the Claude API and MCP, Zapier, and the Google Workspace, Xero, Booqable, Attio and Slack APIs.

## Running

Each folder is self-contained, with its own `package.json` and README. For example:

```bash
cd xero-automation && npm test
```

The apps need their own API keys in a local `.env`. No keys are included.

## Contact

- Email: travis@innercapital.co
- LinkedIn: https://www.linkedin.com/in/travis-hill-pm2/

## License

[MIT](LICENSE)
