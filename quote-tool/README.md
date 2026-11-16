# Acme Hire Quote Tool

A single-page quote generator for container kitchen and bar hire. Staff build a quote, the tool prices delivery and the payment schedule, and it produces a branded PDF, exports a draft quote to Xero, and syncs the issued quote to the CRM — all behind a Google staff sign-in.

- **Pricing:** delivery by distance band from two depots (Northern / Southern), peak and off-peak rates, deposit and balance schedule, VAT handling. Prices can be left as TBC and the quote is marked incomplete.
- **Output:** a branded quote PDF via the browser print dialog, plus an in-tool quote history.
- **Sign-in:** Save as PDF and Export to Xero require a Google sign-in (`acmehire.example` / `acmecapital.example` accounts only), verified on the server on every request. Reuses the Trader Briefing OAuth client.
- **Xero export:** creates a **draft** Quote in Xero (never sent to the customer automatically), with the tool's reference preserved in the Xero reference field. Ships with a test mode that logs the payload without touching Xero.
- **CRM sync:** Save as PDF posts the issued quote to a CRM webhook, if one is configured. Saving still works when it is not.

See [`SETUP.md`](SETUP.md) for the full Xero, Google sign-in and CRM setup checklist.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The quote tool — pricing, schedule, PDF, history, export buttons |
| `netlify/functions/xero-export.js` | Builds the draft Quote and sends it to Xero |
| `netlify/functions/xero-authorize.js` | One-time OAuth connect to the Xero organisation |
| `netlify/functions/xero-callback.js` | Xero OAuth redirect handler |
| `netlify/functions/attio-sync.js` | Posts the issued quote to the CRM webhook |
| `netlify/functions/postcode.js` | Distance / delivery-band lookup |
| `netlify/functions/lib/requireStaff.js` | Google token check (server-side) |
| `netlify.toml` | Netlify functions directory and headers |

## Netlify environment variables

| Name | Value |
| --- | --- |
| `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` | From the Xero app |
| `XERO_REDIRECT_URI` | The app's redirect URI |
| `XERO_ADMIN_PASSCODE` | Passcode for the one-time Xero connect step |
| `XERO_EXPORT_TEST_MODE` | `true` to log the payload without sending to Xero |
| `ATTIO_WEBHOOK_URL` | CRM webhook for the Save-as-PDF sync (optional) |

With no Xero app registered, the export button fails with a clear error rather than sending anything — nothing can reach Xero until every step in `SETUP.md` is done.

## Go-live steps

1. Create a GitHub repo (Acme Hire org) and push.
2. Create a Netlify site from the repo. `@netlify/blobs` installs from `package.json`.
3. Register a Xero app and set the Xero environment variables (see `SETUP.md`).
4. Google Cloud (project "Acme Hire Handover") → the OAuth client → **Authorized JavaScript origins**: add the Netlify address and any custom domain (e.g. `https://quote.acmehire.example`).
5. Connect the app to Xero once via `xero-authorize`, confirm the correct organisation, verify the account/tax codes, then turn test mode off.

## Local preview

Open `index.html` in a browser for the quote and pricing UI. The Xero export, CRM sync and Google sign-in run through Netlify Functions, so use `netlify dev` to exercise those locally.
