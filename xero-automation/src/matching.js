// Payment matching (PRD v2, scenarios 2 and 3).
//
// Input: one incoming receipt, from the Revolut Business side (not the Xero feed: the
// Xero API does not expose unreconciled feed lines), plus the open sales invoices from
// Xero. Output: a decision, and for a clean match a Xero Payment payload.
//
// Rules, in order. Anything other than one clean answer goes to a person; nothing is
// ever retried silently or guessed.
//   1. Pull AHJ candidates from the transfer reference. Not exactly one → review.
//   2. Open invoices for that AHJ. None → review.
//   3. Exactly one invoice whose amount due equals the receipt → match.
//   4. Several open invoices for the job: the one whose amount due equals the receipt,
//      if exactly one does → match. Otherwise → review.
//   5. Receipt > amount due on a single open invoice → overpayment: apply amount due,
//      flag the rest for Finance (they raise the credit).
//   6. Receipt < amount due → part payment: never auto-applied, review.

const { extractAhjCandidates, parseStandard } = require('./refs');
const { toPence, toPounds } = require('./money');

const decide = (receipt, openInvoices, { bankAccountId } = {}) => {
  const amount = toPence(receipt.amount);
  if (!(amount > 0)) return review('Not an incoming payment', receipt);

  const candidates = extractAhjCandidates(`${receipt.reference || ''} ${receipt.description || ''}`);
  if (candidates.length === 0) return review('No AHJ reference on the transfer', receipt);
  if (candidates.length > 1) return review(`Several job references on one transfer: ${candidates.join(', ')}`, receipt, { candidates });
  const ahj = candidates[0];

  const forJob = openInvoices.filter((inv) => {
    const p = parseStandard(inv.reference);
    return p && p.ahj === ahj && toPence(inv.amountDue) > 0;
  });
  if (forJob.length === 0) return review(`No open invoice for ${ahj}`, receipt, { ahj });

  const exact = forJob.filter((inv) => toPence(inv.amountDue) === amount);
  if (exact.length === 1) return match(exact[0], amount, receipt, bankAccountId, ahj);
  if (exact.length > 1) return review(`${exact.length} open invoices for ${ahj} with the same amount due`, receipt, { ahj });

  if (forJob.length === 1) {
    const inv = forJob[0];
    const due = toPence(inv.amountDue);
    if (amount > due) {
      return {
        ...match(inv, due, receipt, bankAccountId, ahj),
        decision: 'overpayment',
        overpaidBy: toPounds(amount - due),
        note: `Applied £${toPounds(due).toFixed(2)}; £${toPounds(amount - due).toFixed(2)} over. Finance raises the credit.`,
      };
    }
    return review(`Part payment: £${toPounds(amount).toFixed(2)} against £${toPounds(due).toFixed(2)} due on ${inv.reference}`, receipt, { ahj });
  }
  return review(`${forJob.length} open invoices for ${ahj} and none match £${toPounds(amount).toFixed(2)}`, receipt, { ahj });
};

const match = (inv, pence, receipt, bankAccountId, ahj) => ({
  decision: 'match',
  ahj,
  invoiceReference: inv.reference,
  payload: {
    Invoice: { InvoiceID: inv.invoiceId },
    Account: { AccountID: bankAccountId },
    Date: receipt.date,
    Amount: toPounds(pence),
    Reference: `${inv.reference} ${receipt.reference || ''}`.trim().slice(0, 255),
  },
});

const review = (reason, receipt, extra = {}) => ({ decision: 'review', reason, receipt, ...extra });

module.exports = { decide };
