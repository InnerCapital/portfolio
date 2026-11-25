# Asset register

**Problem:** the fleet (container kitchens and bars) was tracked in a spreadsheet. Nobody could see at a glance where a unit was, whether it was on hire, or whether it had passed its last inspection. The spreadsheet's published link was also readable by anyone who had it.

**What I built:** a fleet portal for staff, plus a public page behind the QR code on every unit's serial plate.

## What it does

- **Fleet view:** every unit with its status, location, current booking (Booqable), live GPS (Hapn trackers), rental history and defects.
- **Inspection status** comes from the handover app's record in Supabase, so the portal shows pass, fail or pending re-inspection without anyone updating it by hand.
- **AI fleet summary.** Claude Haiku writes a short plain-English summary of the fleet: what is out, what is due back, what needs attention.
- **QR asset pages.** Each serial plate carries a QR code for `assets.<domain>/<ASSET ID>`. Members of the public see only the asset ID, the unit type and the latest inspection badge, plus a contact address.

## Controls

The first version signed staff in on the client only, and every data endpoint was open. I rebuilt the access model:

- **Server-verified Google sign-in** sets an HttpOnly, signed session cookie. Every data function (GPS, bookings, register, AI summary) returns 401 without it.
- **The public endpoint returns three fields** and nothing else: no location, client, serials, GPS or hire status. A test checks that hidden fields never leak.
- **Asset IDs are validated** before any lookup, so path tricks get a 400.
- **The spreadsheet is read on the server.** Its address no longer appears in the page source.

## Tests

```bash
node --test test/   # 12 tests: token checks, cookie tamper/expiry, 401 on every data route, public-field whitelist
```

**Stack:** HTML/CSS/JS (no framework), Netlify Functions, Google Sheets, Supabase, Booqable and Hapn APIs, Claude Haiku.
