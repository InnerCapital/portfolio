# Acme Hire Trader Briefing Pack

Internal operations system for managing trader onboarding, declaration sign-off, and booking pre-fill for Acme Hire container kitchen and bar rentals.

---

## What This Is

A web-based trader briefing and declaration system. Traders read through operational requirements, complete a pre-event checklist, and sign a legal declaration before trading begins.

The system has two parts:

- **Trader-facing** (`index.html`) — the briefing pack and declaration form, accessible via a shareable link
- **Ops-facing** (`generate.html`) — an internal tool for Acme Hire staff to generate pre-filled trader links by pulling data from Booqable and extracting fields from hire agreement and invoice PDFs

Submissions are logged to Google Sheets and trigger branded confirmation emails to both Acme Hire ops and the trader.

---

## File Structure

```
/
├── index.html                        Trader briefing pack and declaration form
├── generate.html                     Internal link generator (Google OAuth protected)
│
├── netlify/functions/
│   ├── submit.js                     Receives form submission, forwards to Google Apps Script
│   ├── lookup.js                     Looks up a Booqable order by number, returns pre-fill data
│   ├── extract.js                    Sends PDF to Claude Haiku, returns extracted fields as JSON
│   ├── send-email.js                 Sends the trader briefing link via Resend (used by generate.html's "Send to Trader")
│   └── upload-signature.js           Uploads the full-res signature to Drive (fire-and-forget, independent of submit.js — see below)
│
├── Code.gs                           Google Apps Script — sheet logging and email sending
├── netlify.toml                      Netlify config (add /generate redirect if needed)
└── README.md                         This file
```

---

## Environment Variables

Set these in Netlify under **Site Configuration > Environment Variables**. Never put them in code.

| Variable | What It Is | Where to Get It |
|---|---|---|
| `BOOQABLE_API_KEY` | Booqable API key | Booqable > Settings > Account > Authentication Methods |
| `ANTHROPIC_API_KEY` | Claude API key for Haiku PDF extraction | console.anthropic.com |
| `RESEND_API_KEY` | Resend API key — used by `send-email.js` to send the trader briefing link | resend.com. Requires `acmehire.example` verified as a sending domain (SPF/DKIM), or sends will fail/land in spam. |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account credentials for Drive uploads — used by `upload-signature.js` | Same credential already used by the Handover app (`handover-app`). Reuse it, don't create a second one. |
| `GOOGLE_DRIVE_TRADER_SIGNATURES_FOLDER_ID` | Drive folder ID the signatures get uploaded into | Grab from the folder's URL — recommend using the existing "Acme Hire Trader Sign-Offs" Drive folder (see Google Apps Script section below) rather than creating a new one. **The folder must be shared with the service account's `client_email` (found inside the JSON) or uploads will fail with a permissions error** — same manual step the Handover app's own setup required. |
| `GOOGLE_DRIVE_JOB_FOLDERS_PARENT_ID` | Drive folder ID under which a fresh subfolder is created per booking (`{ref} — {company}`), containing the Hire Agreement, the trader's insurance certificate(s), and the generated signed-declaration PDF | Grab from the parent folder's URL. **Must be shared with the service account's `client_email`, same manual step as above.** Used by `create-job-folder.js`, `upload-insurance.js`, and `submit.js`'s PDF-filing step. |
| `SUPABASE_URL` | Same Supabase project already used by `handover-app` — reused, not a new project | Netlify → `handover-app` site → Environment Variables → copy the value across |
| `SUPABASE_SERVICE_KEY` | Same as above | Same place, copy across |

The Google OAuth Client ID (`YOUR_GOOGLE_CLIENT_ID`) is safe to be public and is hardcoded in `generate.html`. It is not a secret.

---

## Netlify Setup

1. Connect your GitHub repo to Netlify as normal
2. Build settings — no build command needed, publish directory is `/` (root)
3. Functions directory — set to `netlify/functions` in your Netlify site settings or `netlify.toml`
4. Add the two environment variables above
5. Redeploy

### netlify.toml (add if not already present)

```toml
[build]
  functions = "netlify/functions"
  publish = "."

[[redirects]]
  from = "/generate"
  to = "/generate.html"
  status = 200

[[redirects]]
  from = "/briefing"
  to = "/index.html"
  status = 200
```

This makes `yourdomain.co/generate` and `yourdomain.co/briefing` work as clean URLs.

---

## Google OAuth Setup

The generate page is restricted to `@acmehire.example` and `@acmecapital.example` Google accounts. No invite needed — anyone with a valid company email can sign in.

Setup was completed in Google Cloud Console under project **Acme Hire Handover** in the `acmecapital.example` organisation.

**If you need to add another authorised domain:**
1. Go to console.cloud.google.com > Acme Hire Handover project
2. Google Auth Platform > Audience
3. Add the domain under Authorised domains
4. Update the domain check in `generate.html` in the `ALLOWED_DOMAINS` array

**If you need to add another OAuth origin (e.g. a new Netlify domain or custom domain):**
1. Google Auth Platform > Clients
2. Edit the Acme Hire Generate Page client
3. Add the new URL to Authorised JavaScript origins

---

## Google Apps Script Deployment

`Code.gs` handles sheet logging and email sending. It runs as a Google Apps Script Web App.

**To update after editing Code.gs:**
1. Go to script.google.com and open the Acme Hire Sign-Off project
2. Paste in the new `Code.gs` content
3. Click **Deploy > Manage Deployments**
4. Click the pencil icon on the existing deployment
5. Change version to **New version**
6. Click Deploy

Do not create a new deployment — update the existing one or the URL in `submit.js` will break.

**Sheet location:**
Google Sheet ID `1HSV9dd_qRkMV5n4WqTj4fB-pkHDWHRzXmTZ4ABTtD68` — Acme Hire Trader Sign-Offs folder in Google Drive.

**Columns written per submission:**
Timestamp, Booqable Ref, Company, Brand, Contact Name, Contact Phone, Email, Unit Types, Unit Count, Event, Dates, Trading Partner, TP Company, Signed Date, Checklist

---

## How to Use the Generate Page

The generate page lives at `yourdomain.co/generate`. It is only accessible to signed-in Acme Hire or Acme Capital staff.

**Step by step:**

1. Sign in with your `@acmehire.example` or `@acmecapital.example` Google account
2. Enter the Booqable order number and click **Pull from Booqable** — this fetches company name, contact details, dates, and unit types from the booking
3. Optionally upload the hire agreement PDF and/or invoice PDF and click **Extract with Haiku** — this pulls site address, damage deposit, hire reference, and trading partner details that Booqable does not hold
4. Review all pre-filled fields in Step 3. Yellow fields came from Booqable, purple fields from the document. All fields are editable
5. Click **Generate Link** — this builds a pre-filled URL containing all the booking data as query parameters
6. Click **Copy Link** to copy it, or **Send to Trader** to open your email client with a covering message already written

The generated link looks like:
```
yourdomain.co/briefing?company=Acme+Foods&event=Lakeside+Festival&dates=24+to+26+April+2026&...
```

---

## How Pre-Fill Works

The briefing pack (`index.html`) supports two pre-fill modes:

**Mode A — Full params (used when link is generated via generate page)**
The URL contains all booking data as query parameters. The form reads them directly on load — no API call needed. This is the preferred mode as it works even if Booqable is unreachable.

**Mode B — Ref only (used when link is `?ref=ORDER_NUMBER`)**
The page calls `/.netlify/functions/lookup` which hits the Booqable API server-side and returns the booking data. Slower and dependent on Booqable being available, but useful for quick sharing before using the generate page.

In both modes the form auto-navigates to the declaration page and pre-filled fields are highlighted in green.

---

## Submission Flow

When a trader submits their declaration:

```
Browser
  → POST /.netlify/functions/submit
    → GET https://script.google.com/macros/.../exec?payload=...
      → Writes row to Google Sheet
      → Sends branded HTML email to hello@acmehire.example
      → Sends confirmation email to trader
```

The signature is captured twice: a small JPEG thumbnail goes into the Sheet-logging payload above (`Code.gs` still doesn't persist it there — that part of the original gap is unchanged), and separately the full-resolution PNG is uploaded straight to Google Drive via `upload-signature.js`, fired in parallel with the Sheet submission. The two are independent — a Drive upload failure doesn't block or roll back the Sheet log, and vice versa. This was a deliberate transport split: Apps Script is called via GET with the payload in the URL, which can't safely carry a full-size image (thumbnail only, ~KB-scale); Drive upload goes over a normal POST body instead, so it isn't subject to that limit.

---

## Next Steps

These are the logical next build priorities in order.

**1. Confirm Booqable product name mapping**
The `lookup.js` function maps Booqable line item product names to unit types (Street Food, Bar, Dark Kitchen) by looking for those keywords. Before the first live booking, check that your actual product names in Booqable contain those words — otherwise unit types will not pre-fill. Update the `mapUnitType` function in `lookup.js` if needed.

**2. Add `netlify.toml`**
The `/generate` and `/briefing` clean URLs will not work without redirect rules. Add the `netlify.toml` config shown above to the repo root and redeploy.

**3. Verify Google Apps Script is receiving submissions**
`submit.js` sends data to the Apps Script via a GET request with a `?payload=` parameter. The Apps Script `doGet` function handles this. Confirm a test submission is reaching the sheet before the first live booking by checking the sheet and the Apps Script execution log.

**4. Collection and Return Certificate**
The Handover and Commissioning Certificate is in the app. The Collection and Return Certificate (from the same PDF) is not yet built. This should be a separate flow — triggered at the end of the hire period, comparing condition against the original handover record.

**5. Signed-declaration PDF — done**
`submit.js` generates a PDF of the signed declaration (checklist state, timestamp, signature) via `pdf-lib` — the sibling app's proven library, not Puppeteer — and files it into the per-booking Job Folder alongside the Hire Agreement and insurance certificate(s) (see Job Folder section below), rather than as an email attachment. Fire-and-forget, same pattern as the confirmation email.

**5a. Job Folder + insurance hard gate — done**
Every booking now gets a Drive folder (`{ref} — {company}`) created at link-generation time in `generate.html` (files the Hire Agreement in immediately), threaded through the trader link as `folderId`. The trader can't submit their declaration without attaching at least one insurance certificate (`upload-insurance.js` — awaited, not fire-and-forget, since this is the actual compliance gate). Requires `GOOGLE_DRIVE_JOB_FOLDERS_PARENT_ID` — see Environment Variables.

**5b. Screen Artwork step — done, ported from the standalone prototype**
New page 12 in `index.html` (after Declaration, before Log — Log moved from page 12 to page 13). Trader sets up Split/Mirror screen layouts per unit, previews against a real unit photo (canvas composite; the "photorealistic render" pass is still simulated — a real Higgsfield integration needs its own backend to hold the API key, out of scope), and either submits (`submit-artwork.js` uploads originals + previews into the same Job Folder, emails `hello@acmehire.example`) or skips. Booking details (name/email/trading name/unit count) are read from the Declaration page's own fields — never re-asked.

Skip/complete status, plus two reminder triggers (D-7 and D-2/48hr before delivery), are tracked in a new Supabase table, `trader_briefing_bookings` (`handover-app/supabase/migrations/009_trader_briefing_bookings.sql` — apply via Supabase Studio like every other migration). A row is created at link-generation time in `generate.html`, which now also has a **Delivery Date** field (a real date picker — the existing "Hire Dates" field is free text, not reliable enough for reminder math, so this is a separate, deliberate addition). `send-briefing-reminders.js` runs daily (`netlify.toml`'s scheduled-function block — confirm your Netlify plan includes Scheduled Functions) and emails the trader a link straight back to their booking's artwork step (`?step=artwork` — `index.html` reads this and jumps to page 12 directly) if it's still outstanding. Completing or skipping the step is what stops further reminders — no separate cancel logic, the reminder query just excludes those statuses.

**6. Signature storage — done**
The full-resolution signature now uploads to Drive via `upload-signature.js` (see Submission Flow above), independent of `Code.gs`/the Sheet. Requires `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_DRIVE_TRADER_SIGNATURES_FOLDER_ID` to be set in Netlify and the target Drive folder shared with the service account before it'll work — see Environment Variables.

**7. Mobile testing on generate page**
`generate.html` has not been tested on mobile. The two-column grid layout may need to collapse on small screens. Not critical as the generate page is ops-only, but worth checking.

**8. Hire agreement fields in declaration**
Fields extracted from documents (site address, damage deposit, hire reference) are pre-filled into the generate page review step but are not currently passed into the trader-facing declaration form. These could be added as read-only confirmation fields so the trader is signing against the specific deposit amount and address.

---

## Contacts

| Role | Contact |
|---|---|
| Operations | hello@acmehire.example |
| Screen artwork | jordan@acmehire.example |
| Equipment queries | FSW directly |

---

*Acme Hire Limited trading as Acme Hire — acmehire.example*
