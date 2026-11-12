# Acme Hire: Booqable to Xero automation

The rules from the *Booqable to Xero Automation PRD v2* as tested code. **It never writes to Xero or any other service.** Every command is a dry run that prints the exact payload it would send.

```bash
npm test               # 23 tests
npm run dry:invoices   # DEP-01 / DEP-02 / FINAL drafts for examples/order.json
npm run dry:release    # 810 release journal(s) for the same order
npm run dry:match      # payment-matching decision for examples/receipt.json
npm run dry:deposit    # deposit release: CN + 225 deduction invoice + refund
npm run audit          # clean-up report on the 10 Nov Xero snapshot
npm run preflight      # required account codes exist in Xero?
```

No dependencies. Node 20 or later.

## What's in it

| File | PRD | Does |
|---|---|---|
| `src/refs.js` | Reference architecture | Builds and validates AHJ references, suggests fixes for messy ones, reads AHJ out of bank transfer text |
| `src/schedule.js` | Scenario 1 | DEP-01 at confirmation, DEP-02 at D-30, FINAL at D-14; late-booking flag; custom splits |
| `src/invoices.js` | Scenario 1 | Builds the draft invoices (hire 810, extras 204/206/…, deposit 845 No VAT) and the **guard** every payload must pass |
| `src/release.js` | Gap: 810 release | Draft journals moving 810 into 200/201/202, pro rata by day per month |
| `src/matching.js` | Scenarios 2 and 3 | Match a receipt on AHJ, overpayment handling, everything else to review |
| `src/deposit.js` | Scenario 6 | CN for the full deposit, separate 225 VAT invoice for deductions, allocation, refund |
| `src/audit.js` | Clean-up | Checks references, AHJ ↔ customer, deposit coding and VAT, delivery/insurance coding |
| `docs/v3-changes.md` | | What the 10 Nov check and the build changed in the PRD |
| `docs/manual-procedures.md` | Step 7 | The procedures that stay manual |

## The guard

`validateInvoicePayload()` refuses any payload that is not a DRAFT, or that has a non-standard reference, an account outside the approved list (or missing from the org), a damage deposit not on 845, VAT on 845, a damage deposit on a hire deposit invoice, or a negative line. It would have stopped the INV-0005 coding error.

## Not built yet

See `docs/v3-changes.md` §5: the Booqable adapter (needs an API token and a sample order), live Xero writes (needs the decisions, the clean-up and a demo company), and the Revolut trigger (needs API access).

`examples/xero-snapshot-2026-11-10.json` is an anonymised ledger snapshot: customer names, venues and references are fictional.
