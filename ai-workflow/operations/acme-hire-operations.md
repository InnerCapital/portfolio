---
name: acme-hire-operations
description: Acme Hire operations reference. Rental lifecycle, gates, asset management, cleaning standard, automation and tech stack. Load before advising on any operational decision.
---

# Acme Hire Operations Reference

> White-labelled and trimmed for this portfolio. The real skill also holds pricing, fleet size, depot locations and expansion plans. Those are the client's commercial information and are left out here. The structure is unchanged.

Operational playbook for a company that hires out container kitchens and bars for events. Read this fully before advising on operational decisions. If something here conflicts with what the user says, ask which is current.

---

## 1. Positioning

Acme Hire supplies, maintains and manages plug-and-play units for events, hospitality, retail and temporary activations. It does not operate sites. It handles the units and the trader relationship; the event organiser runs the wider site (infrastructure, utilities, communal areas, marketing).

---

## 2. Rental lifecycle (D-minus process)

| Stage | Gate | Owner | System | Key rules |
|---|---|---|---|---|
| **D-90** | Quote → booking confirmed | Sales | Quote tool → Booqable | Job folder created in Google Drive |
| **D-30** | Insurance request + trader briefing sent | Operations | Trader briefing | Screen artwork requested (reminders D-7 and D-2) |
| **D-14** | Insurance certificates uploaded | Operations | Trader briefing | Minimum Public and Products Liability cover is mandatory |
| **D-14 (mandatory)** | Trader briefing signed | Customer | Trader briefing | Signed two weeks in advance, never on the day |
| **D-2** | Transport booked | Operations | Booqable | No transport until the trader briefing is complete |
| **D-0** | Depot check out, delivery, site handover | Operations / haulier | Handover app | Unit levelled, photos in and out, like a hire car check |
| **Collection** | Collection, depot check in | Operations | Handover app | Photos and condition record; clean and assess within the 14-day deposit window |

### Critical rules

- **The trader briefing is a binding gate.** Signed two weeks in advance. Non-negotiable.
- **The asset register blocks allocation.** A unit with a fail status cannot be allocated in Booqable.
- **The haulier owns the delivery inspection.** Levels the unit and takes the photos, which protects both sides on damage claims.
- **Default remit is deliver and collect.** Site conditions, access, cabling and levelling are the customer's unless set-up is bought as an add-on.

---

## 3. Set-up add-ons

Levelling, signage installation and set-up crew are priced separately per unit. One person cannot realistically set up more than three units, so larger jobs are priced per job (travel, overnight stay, 8+ hours on site).

---

## 4. Cleaning standard

**On return to depot:** full exterior jet wash (hand-wash on branding), full commercial kitchen chemical clean inside, no steam, wipe-only on tech (GPS, alarm, CCTV, sockets, POS, card reader).

**Before deployment:** exterior sparkle clean; interior only after long-term storage.

**Every visit:** signed visual inspection report and photos within 24 hours.

**Training:** a short video on the correct products (no abrasive pads on stainless steel), embedded in the trader briefing and booking confirmation.

---

## 5. Asset management

### Asset ID schema

**Format:** `AH[Country][Category][YY][Sequence]`. Example: `AHUKB260001` = first UK bar unit built in 2026.

**Child assets:** `[ParentID]-[CategoryCode][3-digit seq]`. Codes: K kitchen tech, N connectivity, S security, P POS, T trackers, D display screens, X other.

### Asset register: a lifetime record per unit, like an MOT

Tracks inspection dates, defects found and fixed, and pass/fail status over the unit's life. Fed by the handover app, the cleaning contractor and the maintenance call-out sheet (synced by Zapier). A completed call-out moves a defect to "pending re-inspection", never straight to "pass".

### Serial plates

Each unit carries a plate with the legal entity, asset ID, build date and a QR code to the unit's public asset page.

---

## 6. Contracts and known process gaps

The master rental agreement binds all schedules under one signature (delivery and collection terms, photo documentation, maintenance and call-outs).

Open gaps to check before advising:

- Trader briefing sign-off and artwork are not yet in the agreement checklist.
- Insurance certificates are mandatory in the agreement but only partly enforced in the process.
- The post-collection clean deadline must sit inside the 14-day refund window.
- Inspection location (site vs depot) must match the agreement wording.

---

## 7. Tech stack

| System | Purpose |
|---|---|
| Booqable | Rental management, source of truth for bookings |
| Xero | Accounting |
| Attio | CRM (migrated from HubSpot) |
| Zapier | Integration layer |
| Slack, Gmail, WhatsApp | Communication and alerts |
| Netlify, Vercel, Railway, GitHub | Hosting and code |
| GPS trackers, CCTV, satellite wifi | Unit tracking and connectivity |
| Internal tools | Quote tool, trader briefing, handover app, asset register, staff hub, vault |

---

## Quick reference

```
Trader briefing:        MANDATORY two weeks before the event
Transport:              Not booked until the briefing is complete
Delivery remit:         Deliver and collect only, set-up is an add-on
Inspections:            Depot out, site handover, collection, depot in
Asset register:         Fail status blocks allocation in Booqable
Deposit window:         14 days after collection
```
