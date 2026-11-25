See `booqable-export-setup.md` for the Send to Booqable button. The old Xero export has been removed; the `XERO_*` variables on Netlify can be deleted.

# Staff sign-in (Google) — required for Save as PDF and Send to Booqable

Both actions ask for a acmehire.example / acmecapital.example Google sign-in, verified server-side on every request (`netlify/functions/lib/requireStaff.js`). It reuses the Trader Briefing's OAuth client (Google Cloud project "Acme Hire Handover").

**One-time setup:** in Google Cloud Console → APIs & Services → Credentials → the OAuth client `YOUR_GOOGLE_CLIENT_ID` → **Authorized JavaScript origins**, add `https://quote-tool-demo.netlify.app` (and any future custom domain, e.g. `https://quote.acmehire.example`). Until this is done the Google button shows an "origin not allowed" error.


# Attio sync — fired by Save as PDF

`netlify/functions/attio-sync.js` posts the issued quote to an Attio workflow.

1. In Attio, create a workflow with the **Webhook received** trigger. Copy its URL.
2. Netlify → Environment variables → add `ATTIO_WEBHOOK_URL` = that URL. Until it's set, saving still works and staff see "Attio sync is not set up yet".
3. Build the workflow steps from the payload below. Match the deal on `quoteRef`, because saving the same quote twice sends it twice.

Payload fields: `event` ("quote.issued"), `quoteRef`, `quoteDate`, `expiryDate`, `quoteType` (hire/sale), `issuedByName`, `issuedByEmail` (from the verified sign-in), `contact` {name, attention, address, vatNumber}, `units` [{type, quantity}], `unitCount`, `term`, `hireStart`, `hireEnd`, `depot` ("Northern Depot"/"Southern Depot"), `deliveryPostcode`, `specialistDelivery`, `lineItems` [{description, quantity, unitAmount, amount}], `subtotalExVat`, `depositExVat`, `totalExVat`, `complete` (false if any price is still TBC), `pdfFileName`, `sentAt`.

The PDF file itself is not sent. It's saved through the browser's print dialog, which the page can't read back.
