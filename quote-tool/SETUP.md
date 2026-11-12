# Xero export — setup checklist

The code is built and safe to deploy as-is: with no Xero app registered yet, the button will fail with a clear error rather than silently doing nothing or breaking anything else in the tool. Nobody can accidentally send a real quote to Xero until every step below is done.

## What you need to do yourself (I can't do these, they need your Xero login)

**1. Register a Xero app**
Go to https://developer.xero.com/app/manage, create a new app (type: "Web app"). Set the redirect URI to:
`https://quote-tool-demo.netlify.app/.netlify/functions/xero-callback`
(swap in your actual Netlify domain if different). Copy the Client ID and Client Secret it gives you.

**2. Set environment variables in Netlify**
Site settings → Environment variables → add:

| Variable | Value |
|---|---|
| `XERO_CLIENT_ID` | from step 1 |
| `XERO_CLIENT_SECRET` | from step 1 |
| `XERO_REDIRECT_URI` | the same redirect URI you set in step 1 |
| `XERO_ADMIN_PASSCODE` | a separate passcode only you use for the one-time connect step below |
| `XERO_EXPORT_TEST_MODE` | set to `true` at first — this makes the button build the payload and log it, without touching Xero |

**3. Deploy**
Push these files (updated `index.html`, `netlify/functions/xero-export.js`, `xero-authorize.js`, `xero-callback.js`, `package.json`) and let Netlify build. It'll install `@netlify/blobs` automatically from `package.json`.

**4. Connect the app to Xero (one-time, do this yourself)**
Visit, in your browser, logged into the Acme Hire Xero account:
`https://quote-tool-demo.netlify.app/.netlify/functions/xero-authorize?passcode=YOUR_ADMIN_PASSCODE`
Approve the connection, make sure you select the Acme Hire/AcmeCo organisation if asked. You'll land on a confirmation page showing which organisation got connected — check it's the right one.

**5. Test with test mode on**
With `XERO_EXPORT_TEST_MODE=true`, click "Export to Xero" on a real quote. Nothing goes to Xero — the payload gets logged to the browser console and saved into the tool's Quote History so you can check the line items, amounts, and tax types look right before anything is live.

**6. Confirm the accounting config before going live**
Two things in `xero-export.js` are UK-default guesses, not confirmed against your actual chart of accounts:
- `XERO_ACCOUNT_CODE = '200'` (assumed Sales)
- `XERO_TAX_STANDARD = 'OUTPUT2'` (assumed 20% VAT on Income)

Check these against Xero's actual codes for AcmeCo (Accounting → Advanced → Chart of accounts, and Tax rates). If they're wrong, quotes will still send successfully, they'll just land against the wrong account or tax rate in Xero, which won't throw an error, it'll just look wrong on the books. Worth Sam confirming these specifically since he owns the chart of accounts.

**7. Go live**
Once test mode payloads look correct and the account codes are confirmed, set `XERO_EXPORT_TEST_MODE=false` (or remove it).

## What happens day to day once this is live

Sam builds a quote as normal, clicks "Export to Xero," signs in with his acmehire.example Google account if asked, and a draft Quote appears in Xero with the real customer, line items, and the tool's reference number in the Xero reference field. It's created as a **Draft**, not sent to the customer automatically, so there's still a manual review step in Xero before anything goes out. The tool's own quote number and the Xero quote number won't be the same string (Xero assigns its own), but the tool's reference is preserved inside the Xero quote so the two are always traceable to each other.

---

# Staff sign-in (Google) — required for Save as PDF and Export to Xero

Both actions ask for a acmehire.example / acmecapital.example Google sign-in, verified server-side on every request (`netlify/functions/lib/requireStaff.js`). It reuses the Trader Briefing's OAuth client (Google Cloud project "Acme Hire Handover").

**One-time setup:** in Google Cloud Console → APIs & Services → Credentials → the OAuth client `YOUR_GOOGLE_CLIENT_ID` → **Authorized JavaScript origins**, add `https://quote-tool-demo.netlify.app` (and any future custom domain, e.g. `https://quote.acmehire.example`). Until this is done the Google button shows an "origin not allowed" error.

`XERO_EXPORT_PASSCODE` is no longer used and can be deleted from Netlify. `XERO_ADMIN_PASSCODE` is still used for the one-time Xero connect step.

# Attio sync — fired by Save as PDF

`netlify/functions/attio-sync.js` posts the issued quote to an Attio workflow.

1. In Attio, create a workflow with the **Webhook received** trigger. Copy its URL.
2. Netlify → Environment variables → add `ATTIO_WEBHOOK_URL` = that URL. Until it's set, saving still works and staff see "Attio sync is not set up yet".
3. Build the workflow steps from the payload below. Match the deal on `quoteRef`, because saving the same quote twice sends it twice.

Payload fields: `event` ("quote.issued"), `quoteRef`, `quoteDate`, `expiryDate`, `quoteType` (hire/sale), `issuedByName`, `issuedByEmail` (from the verified sign-in), `contact` {name, attention, address, vatNumber}, `units` [{type, quantity}], `unitCount`, `term`, `hireStart`, `hireEnd`, `depot` ("Northern Depot"/"Southern Depot"), `deliveryPostcode`, `specialistDelivery`, `lineItems` [{description, quantity, unitAmount, amount}], `subtotalExVat`, `depositExVat`, `totalExVat`, `complete` (false if any price is still TBC), `pdfFileName`, `sentAt`.

The PDF file itself is not sent. It's saved through the browser's print dialog, which the page can't read back.
