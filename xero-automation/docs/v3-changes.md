# PRD v2 → v3: what changes

From a read-only check of Xero (Acme Hire Limited) on 10 Nov 2026 and building the logic in this repo. Nothing was written to Xero.

## 1. Status changes since 4 Nov

| PRD v2 said | Now |
|---|---|
| Void three test invoices (3, AH-2026-2, AH-2026-15-1, £7,260) | None of them is in aged receivables any more, so they look voided already. **Finance: confirm.** |
| Settle CN-0019 (£1,000) and CN-0020 (£2,000) | Still open, both dated 11 Sep. About 45 days past the 14-day refund window. |
| Quote tool export is a second route into the ledger | It creates **draft Xero Quotes**, not invoices (`xero-export.js`, `PUT /Quotes`, Status DRAFT). Quotes never post to the ledger, so the duplicate-invoice risk is lower than v2 assumes. Decision 2 can be made on tidiness, not risk. |

## 2. New clean-up items (found by `npm run audit`)

| Severity | Item | Suggested fix |
|---|---|---|
| High | **INV-0005** (Northgate Markets, paid): £5,000 damage deposit coded to **200 with £1,000 VAT**. Delivery, collection and insurance on the same invoice also sit in 200. | Accountant to decide: credit note and reissue, or a journal plus VAT adjustment. Real VAT exposure: £1,000 charged on a non-supply. |
| Low | **INV-0017** collection fee (£2,450) coded to 201 Dark Kitchen | Recode to 204 |
| Info | **INV-0006** applies £1,825 of an Lakeside deposit as a negative 845 line | Include in the 845 reconciliation (its source job has no AHJ) |
| Info | Refund **"CN-AHJ-0003 Refund"** £3,400 to Northgate Markets, 21 Jul, still unreconciled in Revolut GBP Main | Reconcile |
| Info | A bill payment (5 Nov) uses tax type ECACQUISITIONS on a UK supplier | Accountant to check, outside this PRD |
| Info | Invoice numbers INV-0009 to INV-0011 and INV-0015 don't appear in this year's invoices | Confirm drafts or voids, not missing |

The two swapped references and the rename list from v2 are confirmed exactly by the audit. One caveat on the renames: the March "NGM-0003" invoices (INV-0003 to INV-0005) may be a separate, earlier Northgate Markets job (INV-0006 mentions an Lakeside deposit) rather than a typo for the June Northfield job AHJ-0003. If so, they need their own AHJ number.

## 3. Changes to the build plan

1. **Payment matching is triggered from Revolut, not from the Xero feed.** The Xero API doesn't expose unreconciled feed lines. Instead, a Revolut Business webhook or a poll of its transactions feeds `decide()`, which creates the Xero Payment. The feed line then shows a suggested match and Finance clicks OK. This is how payments are already recorded today: the unreconciled list shows payments created in Xero, waiting for the feed.
2. **Scheduled drafts run as a daily job, not a Zapier delay.** Zapier's Delay Until tops out at about a month, so it can't hold a D-90 or D-30 step. A daily run finds confirmed orders with an instalment due today and drafts it.
3. **Run the logic as one small hosted function, and let Zapier only trigger it.** The rules (splits, late bookings, guards, matching) are about 600 lines with 23 tests. Code by Zapier steps can't import modules or be tested. Proposed: a Netlify function (same host as the quote tool), with Zapier or a schedule calling it. **Decision for Sam and Jordan.**
4. **Late bookings.** When D-30 or D-14 has already passed at confirmation, all invoices are issued that day as separate drafts, and the order is flagged to the reviewer. Alternative: one combined invoice. **Accountant to choose.** The code supports the first.
5. **Non-standard splits are allowed.** Real jobs have billed 50/50 (AHJ-0024) and 25/75 (AHJ-0013). Each order can carry its own split; a 0% DEP-02 is skipped.
6. **810 release added.** A draft manual journal for each month the hire touches, pro rata by day: Dr 810, Cr 200/201/202 by unit type. Finance posts it. **Accountant to confirm** the method (straight-line by hire day).
7. **Deposit release method fixed.** Credit note CN-AHJ-#### for the full deposit (845, No VAT). Any deductions go on a separate 225 invoice with VAT, the credit note is set against that invoice, and the rest is refunded in cash. Never netted. The deduction invoice reference is proposed as **INT-AHJ-####-##**.

## 4. Wording to fix in the PRD

- **"First deposit at order or D-90, whichever is earlier."** Read literally, that always means "at order". The code issues DEP-01 at confirmation. If the intent was "at order, but not before D-90", say so.
- **Due dates aren't stated.** The code assumes 7 days after issue, and never later than hire start. Confirm against the Hire Agreement.
- **"Hire posted net to 810"** is done here as hire lines coded to 810 with 20% output VAT, so VAT is still accounted for at the invoice tax point. Accountant to confirm.

## 5. Still blocked (not buildable yet)

| Item | Blocked on |
|---|---|
| Booqable → order adapter | Booqable API token and a sample order. The internal order model is defined in `src/order.js`; the adapter maps onto it. |
| Live Xero writes | Decisions 1 and 2, the clean-up, and a Xero demo company to test against. |
| Revolut trigger | Revolut Business API access (Sam, as account owner). |
| Review queue in Slack | Which channel. |
