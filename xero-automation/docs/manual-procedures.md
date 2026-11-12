# Manual procedures (PRD v2, step 7)

These stay manual by design. Each one says who does it, what to check, and what the books should look like afterwards. Every reference uses the AHJ number of the job.

Draft. Finance and the accountant should confirm before go-live.

---

## 1. Approving a draft invoice (Reviewer)

The automation creates DEP-01, DEP-02 and FINAL as **drafts**. Nothing reaches a customer until the Reviewer approves it.

1. In Xero, open **Invoices → Draft**. Filter by reference `AHJ-`.
2. Check against the Booqable order:
   - customer and job reference match
   - hire lines are on **810**, delivery and collection on **204**, insurance on **206**
   - the damage deposit is **only on FINAL**, coded **845, No VAT**, £1,000 per unit
   - the dates make sense; an order flagged **late booking** may have all three invoices dated today
3. Approve and email the invoice.
4. If anything is wrong, don't edit the coding to make it fit. Fix the order in Booqable and ask Ops to rebuild the drafts.

## 2. Payment that didn't match (Finance)

The matcher sends anything it can't place to the review queue: no AHJ on the transfer, two jobs on one transfer, a part payment, an unknown job, or two open invoices with the same amount.

1. Find the job: payer name, amount, date, or by asking the customer.
2. In Xero, record the payment on the right invoice (**Invoice → Add payment**, account **Revolut GBP Main**). Put the AHJ reference in the payment reference.
3. Reconcile the Revolut feed line against it.
4. Mark the queue item done, with a note saying which invoice.

Never apply a payment to an invoice for a different AHJ "to clear it".

## 3. Overpayment (Finance)

The matcher applies the amount due and flags the extra.

1. Confirm with the customer: refund it, or hold it against the next instalment.
2. **Refund:** record an overpayment in Xero (Receive money → Overpayment) for the extra, then refund it from Revolut and reconcile.
3. **Hold:** record the overpayment and allocate it to the next invoice for the same AHJ once that invoice is approved.

## 4. Refund paid out (Finance)

1. Refunds only go out against an approved credit note (`CN-AHJ-####`) or a recorded overpayment.
2. Pay from Revolut with the CN reference in the payment reference.
3. In Xero, record the refund on the credit note (**Credit note → Add refund**) and reconcile.
4. If the amount differs from the credit note, stop and check before paying.

## 5. Cancellation (Reviewer approves, Finance issues)

1. Work out the cancellation charge under the Hire Agreement (>30 days, 30–7 days, <7 days).
2. Raise credit note **CN-AHJ-####** against the invoice(s) being cancelled. Put the reason in the credit note.
3. Raise the cancellation fee as a separate line or invoice on **211 Cancellation Fee Revenue**, with VAT.
4. Allocate the credit note against the cancellation fee, then refund the rest (procedure 4).
5. Void any drafts for the job that hadn't been sent.

## 6. Damage deposit release (Finance approves)

Start only once the HandoverApp outcome for the job is recorded. Refund within **14 days of collection**.

1. Run the release builder for the job (`node bin/dry-run.js deposit <file>`). It produces:
   - a credit note **CN-AHJ-####** for the **full** deposit, coded **845, No VAT**
   - if there are deductions, an invoice coded **225** with VAT, one line per documented deduction (reference the HandoverApp photo or report)
   - the amount to set against that invoice, and the cash refund
2. Check every deduction has evidence in HandoverApp. No evidence, no deduction.
3. Approve the credit note and any deduction invoice, allocate as shown, refund the rest (procedure 4).
4. Check that **845 for this job is now nil**. If not, find out why before closing the job.

Never reduce the refund line itself to account for damage. Deductions are always a separate VAT invoice.

## 7. Charge revision, Clauses 6.4 to 6.11 (Finance confirms)

For delivery or collection recalculated after the event (waiting time, extra vehicle, access).

1. Ops records the reason and evidence (driver notes, times, photos) against the AHJ.
2. Finance confirms the amount under the clause.
3. **Increase:** a new invoice **INT-AHJ-####-##**, coded **204**, with VAT.
4. **Decrease:** credit note **CN-AHJ-####** against FINAL, coded **204**, with VAT.
5. Never edit an invoice that has already been sent.

## 8. Releasing deferred hire revenue (Finance, month end)

1. Run the release builder for each job whose hire falls in the month (`node bin/dry-run.js release <order>`).
2. Post the draft journals: **Dr 810**, **Cr 200/201/202** by unit type.
3. At month end, 810 should equal only the hire invoiced for hires that haven't happened yet.
