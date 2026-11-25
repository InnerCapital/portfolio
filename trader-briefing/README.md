# Trader briefing

**Problem:** every trader hiring a unit needed the same briefing (power, gas, equipment, screens, site rules) and had to sign a declaration and send insurance before delivery. This happened over email threads and PDFs. Unsigned declarations were found the day before an event, if at all.

**What I built:** a two-sided tool. Ops generates a pre-filled link from the deal; the trader works through the briefing, uploads documents and signs; the team is chased automatically until it is done.

## Trader side (`index.html`)

- **Briefing pack** for the exact unit type booked: power and socket layout, equipment, screens and content specs, site and safety rules.
- **Declaration sign-off** with a drawn signature, turned into a PDF ([`lib/generateDeclarationPdf.js`](netlify/functions/lib/generateDeclarationPdf.js)) and filed in the job's Drive folder.
- **Insurance upload with an AI check.** Claude Haiku reads the certificate and compares it with the hire agreement's minimum cover. It is a soft check by design: it flags concerns and lets the trader continue, and ops still reviews the file before delivery ([`verify-insurance.js`](netlify/functions/verify-insurance.js)).
- **Screen artwork** submission with D-7 and D-2 reminders.

## Ops side (`generate.html`)

- **Three ways to pre-fill:** pull the deal from Attio (the default), look up the booking in Booqable by order number, or extract the fields from the hire agreement and invoice PDFs with Claude ([`extract.js`](netlify/functions/extract.js)).
- **One send step** that emails the link, creates the job folder and records the booking.
- **Tracking and chasing.** Every booking with a link is stored in Supabase. A scheduled function posts unsigned declarations to the team's private Slack channel on fixed days before the event, and flags confirmed bookings that never got a link.
- **CRM kept in step.** Status changes move the Attio deal forward and add a note only when the status actually changes. Sync errors are logged and never block the trader.

## Controls

- Ops pages and functions need a Google staff sign-in, verified on the server.
- Trader calls never trust the browser for which deal to update: the deal is looked up server-side from the stored booking.
- Every trader email is copied to the bookings channel, so the team sees what went out.
- Booking lookups only accept an exact order-number match (a fix for a real bug where a fuzzy search returned the wrong booking).

## Tests

```bash
npm install && npm test   # 17 tests: Attio sync rules and the chasing schedule
```

**Stack:** HTML/JS, Netlify Functions (including scheduled functions), Supabase, Google Drive and Apps Script, pdf-lib, Attio and Booqable APIs, Claude Haiku, Resend, Slack via a Zapier relay.

Full setup and environment variables: [`SETUP.md`](SETUP.md).
