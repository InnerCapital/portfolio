# Booqable export: setup

The quote tool's **Send to Booqable** button creates a draft (concept) order in Booqable. It replaces the old Xero export: Booqable is the source of truth for bookings, and invoices go to Xero from Booqable.

## What it creates

- **Customer:** matched by company name (not case-sensitive), or created if new.
- **Order:** a concept order, delivery 09:00 on the start date, collection 17:00 on the end date (UK time).
- **Reference line:** a section line at the top with the quote ref, issuer, FAO and VAT number.
- **Booked as Booqable products** (Booqable prices these from its own rate setup): units, insurance, Standard Clean, Set-Up Fee, Site Survey and graphics.
- **Custom lines** with the quote tool's prices: delivery, return collection, storage and any short-notice premium.

After sending, the tool compares Booqable's subtotal with its own. If Booqable prices the hire differently, for example on a booking that spans peak and off-peak, it says so. Check the hire lines before confirming the order.

## Netlify environment variables

| Variable | Value |
|---|---|
| `BOOQABLE_EXPORT_TEST_MODE` | Leave unset or `true` at first. Only the exact value `false` sends for real. |
| `BOOQABLE_API_KEY` | A Booqable access token: Booqable > Settings > API keys. Needed for live mode only. |
| `BOOQABLE_COMPANY_SLUG` | Optional, defaults to `acme-hire`. |
| `BOOQABLE_ADMIN_URL` | Optional, the back-office address used for the "open order" link. |

The old Xero variables (`XERO_*`) are no longer used and can be deleted.

## Going live

1. Leave test mode on. Deploy. Sending needs a acmehire.example / acmecapital.example Google sign-in (same as Save as PDF).
2. Click **Send to Booqable** on a real quote. Nothing is sent: the exact requests are logged to the browser console and saved to Quote History.
3. Check the plan: products, quantities, custom line prices and dates.
4. Add `BOOQABLE_API_KEY`, set `BOOQABLE_EXPORT_TEST_MODE=false`, and redeploy.
5. Send one quote and check the draft order in Booqable before relying on it.

## Product IDs

Product IDs are in `netlify/functions/booqable-export.js` under `PRODUCTS`. If a product is recreated in Booqable, update its ID there.
