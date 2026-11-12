// Damage deposit release (PRD v2, scenario 6). Finance approves every one.
//
// Input: the deposit held for a job, and the HandoverApp outcome (a list of documented
// deductions, net of VAT). Output, all as DRAFTS:
//   1. Credit note CN-AHJ-####, full deposit, coded 845, no VAT. This clears 845.
//   2. If there are deductions: a separate invoice to 225 with VAT on top. Deductions
//      are never netted off the refund line (PRD rule, keeps the VAT right).
//   3. The allocation: how much of the credit note is set against the deduction
//      invoice, and the cash refund that remains.
//
// The deduction invoice uses INT-AHJ-####-## as its reference. That is a proposal;
// see docs/v3-changes.md.

const { build } = require('./refs');
const { ACCOUNTS, TAX } = require('./accounts');
const { toPence, toPounds, vatOn } = require('./money');

const buildDepositRelease = ({ ahj, customer, depositHeld, outcomeDate, deductions = [], interimSeq = 1 }) => {
  const held = toPence(depositHeld);
  if (!(held > 0)) throw new Error(`${ahj}: no deposit held`);
  const contact = customer.xeroContactId ? { ContactID: customer.xeroContactId } : { Name: customer.name };

  const creditNote = {
    Type: 'ACCRECCREDIT',
    Status: 'DRAFT',
    Contact: contact,
    Date: outcomeDate,
    Reference: build.creditNote(ahj),
    LineAmountTypes: 'Exclusive',
    LineItems: [
      {
        Description: `Release of refundable damage deposit, ${ahj}`,
        Quantity: 1,
        UnitAmount: toPounds(held),
        AccountCode: ACCOUNTS.DAMAGE_DEPOSITS,
        TaxType: TAX.NONE,
      },
    ],
  };

  const dedNet = deductions.reduce((a, d) => a + toPence(d.net), 0);
  const dedVat = deductions.reduce((a, d) => a + vatOn(toPence(d.net)), 0);
  const dedGross = dedNet + dedVat;

  const deductionInvoice = deductions.length
    ? {
        Type: 'ACCREC',
        Status: 'DRAFT',
        Contact: contact,
        Date: outcomeDate,
        DueDate: outcomeDate,
        Reference: build.interim(ahj, interimSeq),
        LineAmountTypes: 'Exclusive',
        LineItems: deductions.map((d) => ({
          Description: `Damage recovery, ${ahj}: ${d.description}`,
          Quantity: 1,
          UnitAmount: toPounds(toPence(d.net)),
          AccountCode: ACCOUNTS.DAMAGE_RECOVERY,
          TaxType: TAX.STANDARD,
        })),
      }
    : null;

  const allocate = Math.min(held, dedGross);
  const flags = [];
  if (dedGross > held) flags.push(`Deductions £${toPounds(dedGross).toFixed(2)} exceed the deposit; £${toPounds(dedGross - held).toFixed(2)} stays owing on the deduction invoice`);

  return {
    ahj,
    creditNote,
    deductionInvoice,
    allocation: allocate ? { amount: toPounds(allocate), from: creditNote.Reference, to: deductionInvoice && deductionInvoice.Reference } : null,
    cashRefund: toPounds(held - allocate),
    customerOwes: toPounds(Math.max(0, dedGross - held)),
    flags,
  };
};

// 845 must net to nil per job before the job is closed. Pass every 845 movement
// for the job (positive = deposit taken, negative = released/applied).
const deposit845Balance = (movements) => toPounds(movements.reduce((a, m) => a + toPence(m.amount), 0));

module.exports = { buildDepositRelease, deposit845Balance };
