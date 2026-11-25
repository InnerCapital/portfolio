# Handover app

**Problem:** when a unit came back damaged there was no reliable record of its condition when it left. An external review found the existing process could not support a charge against a customer: photos were scattered, nobody signed anything, and depot checks were not recorded.

**What I built:** an inspection app that creates a defensible record at every point the unit changes hands (leaving the depot, handed to the customer, collected, back at the depot) and turns it into a signed certificate.

## What it does

- **Four recorded events:** pre-dispatch and post-return depot checks, plus site handover and collection inspections. Each runs a fixed checklist with required photo slots.
- **Photo evidence with an AI quality gate.** Claude Haiku checks each photo is usable (in focus, the right subject) before it is accepted. Photos are stored in the job's Google Drive folder.
- **Before-and-after comparison.** Claude Sonnet compares handover and collection photos slot by slot and drafts a dispute summary from the two checklists. Charge amounts stay a manual decision.
- **Signed certificates.** A PDF certificate goes to the customer with a signing link. A daily scheduled job chases unsigned certificates on day 3 and day 7 of the 7-day response window, and tracks the 14-day deposit refund deadline.
- **QR scanning.** Staff scan the unit's serial-plate QR code to fill in the asset ID, with a fallback decoder for browsers without native barcode support.
- **One-off job links.** For a site check done by a driver or the customer, staff send a link (by WhatsApp from the company number, or as a QR code). The link is valid for 24 hours, opens one inspection only, and closes when the checklist is submitted.
- **Fleet status kept current.** Inspection results and maintenance call-outs update the asset register. A completed call-out can only move a defect to "pending re-inspection"; only a new inspection can mark it fixed.
- **Team alerts.** Sign-offs, depot checks and overdue items post to the private bookings channel in Slack.

## Controls

- **Staff Google sign-in** on the company domain, with an HMAC-signed session cookie. A proxy guards every route.
- **Job links are scoped on the server.** The proxy strips any client-sent job header and sets the one inspection the link is for, so a link cannot reach other jobs.
- **Human override is logged.** If the AI gate rejects a genuine photo, signed-in staff can accept it after one failed check, and the app records who did.
- **Exact booking matches only** when pulling an order from Booqable.

## Tests

```bash
npm install && npm test   # 12 tests: asset ID parsing, phone normalisation, daily check schedule
```

**Stack:** Next.js 16, TypeScript, Supabase (Postgres), Google Drive API, Booqable API, Claude (Haiku and Sonnet), Resend, TimelinesAI WhatsApp API, Netlify scheduled functions.

Copy `.env.example` to `.env.local` and run the SQL in `supabase/migrations` in order to run it locally.
