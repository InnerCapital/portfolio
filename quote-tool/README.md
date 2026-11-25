# Quote tool

**Problem:** quotes were built by hand in a document. Delivery was priced by guesswork, peak dates were missed, payment terms varied from quote to quote, and every accepted quote was typed out again in the booking system.

**What I built:** a single-page quote generator that prices the whole job and sends it straight into the booking system as a draft order.

## What it does

- **Prices the job from the rate card.** Delivery by distance band from the nearer of two depots, peak and off-peak hire rates, storage, set-up fees and short-notice premiums. Prices can be left as TBC and the quote is flagged incomplete.
- **Fixes the commercial terms.** Deposit and balance schedule and cancellation bands come from the hire agreement, so every quote states the same terms.
- **Produces a branded PDF** through the browser print dialog (print stylesheet kept separate from the on-screen design), plus an in-tool quote history.
- **Sends to Booqable** as a draft order: matches or creates the customer, books units and add-ons as Booqable products, adds delivery and collection as custom lines, then compares Booqable's subtotal with its own and warns on any difference.
- **Syncs the CRM.** Saving the PDF posts the issued quote to an Attio workflow webhook.

## Controls

- **Staff only.** Save as PDF and Send to Booqable need a Google sign-in on the company domain, verified on the server on every request ([`netlify/functions/lib/requireStaff.js`](netlify/functions/lib/requireStaff.js)).
- **Safe by default.** Test mode is on unless the environment variable is exactly `false`. In test mode the exact requests are logged and saved to quote history, and nothing is sent.
- **Drafts only.** Orders arrive in Booqable as concepts for a human to check and confirm.

## Changes since the first version

The first version exported draft quotes to Xero. Once Booqable became the source of truth for bookings, I moved the export to Booqable (invoices now flow from Booqable to Xero) and aligned the pricing with the published rate card.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The quote tool: pricing, schedule, PDF, history, send buttons |
| `netlify/functions/booqable-export.js` | Builds and sends the draft Booqable order (test mode by default) |
| `netlify/functions/attio-sync.js` | Posts the issued quote to the CRM webhook |
| `netlify/functions/postcode.js` | Distance and delivery-band lookup |
| `netlify/functions/lib/requireStaff.js` | Server-side Google token check |
| [`booqable-export-setup.md`](booqable-export-setup.md), [`SETUP.md`](SETUP.md) | Go-live checklists |

**Stack:** HTML/CSS/JS, Netlify Functions, Google Identity Services, Booqable API, Attio webhooks.

Open `index.html` to try the pricing UI. Use `netlify dev` to run the functions locally.
