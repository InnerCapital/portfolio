const test = require('node:test');
const assert = require('node:assert/strict');

const refs = require('../src/refs');
const { splitByPercent, toPence } = require('../src/money');
const { scheduleFor } = require('../src/schedule');
const { buildDraftInvoices, validateInvoicePayload, toXero } = require('../src/invoices');
const { buildReleaseJournals, journalBalances } = require('../src/release');
const { decide } = require('../src/matching');
const { buildDepositRelease } = require('../src/deposit');
const { auditInvoices } = require('../src/audit');
const snapshot = require('../examples/xero-snapshot-2026-11-10.json');

const order = (over = {}) => ({
  ahj: 'AHJ-0041',
  customer: { name: 'Test Events Ltd' },
  confirmedOn: '2026-11-10',
  hireStart: '2027-03-01',
  hireEnd: '2027-03-07',
  units: [
    { type: 'street_food', qty: 2, hireFee: 4000 },
    { type: 'bar', qty: 1, hireFee: 1500 },
  ],
  extras: [
    { category: 'delivery', description: 'Delivery, 3 units', net: 1095 },
    { category: 'collection', description: 'Collection, 3 units', net: 1095 },
    { category: 'insurance', description: 'Unit insurance, 3 units', net: 300 },
  ],
  ...over,
});

// ── refs ───────────────────────────────────────────────
test('builds standard references', () => {
  assert.equal(refs.build.deposit('AHJ-0024', 1), 'DEP-AHJ-0024-01');
  assert.equal(refs.build.final('AHJ-0024'), 'FINAL-AHJ-0024');
  assert.equal(refs.build.creditNote('AHJ-0024'), 'CN-AHJ-0024');
  assert.equal(refs.build.job(7), 'AHJ-0007');
});

test('suggests standard names for the messy references in Xero', () => {
  const s = (r) => refs.suggestStandard(r).suggestion;
  assert.equal(s('DEP - AHJ - 0003 - 02'), 'DEP-AHJ-0003-02');
  assert.equal(s('AHJ-0003-FINAL'), 'FINAL-AHJ-0003');
  assert.equal(s('FIN-AHJ-0030-01'), 'FINAL-AHJ-0030');
  assert.equal(s('BAL - NGM - 0003 - 03'), 'FINAL-AHJ-0003');
  assert.equal(s('DEP - NGM - 0003'), 'DEP-AHJ-0003-01');
  assert.equal(s('DEPOSIT-REFUND-AHJ-0024'), 'CN-AHJ-0024');
});

test('pulls AHJ numbers out of what customers type on transfers', () => {
  assert.deepEqual(refs.extractAhjCandidates('ahj24 deposit'), ['AHJ-0024']);
  assert.deepEqual(refs.extractAhjCandidates('AHJ 0024 / AHJ-0030'), ['AHJ-0024', 'AHJ-0030']);
  assert.deepEqual(refs.extractAhjCandidates('INV-0014'), []);
});

// ── money ──────────────────────────────────────────────
test('splits always add back to the total', () => {
  const parts = splitByPercent(toPence(1333.33), [25, 25, 50]);
  assert.equal(parts.reduce((a, b) => a + b, 0), 133333);
});

// ── schedule ───────────────────────────────────────────
test('standard schedule: DEP-01 now, DEP-02 at D-30, FINAL at D-14', () => {
  const s = scheduleFor(order());
  assert.equal(s.lateBooking, false);
  assert.deepEqual(s.instalments.map((i) => i.issueOn), ['2026-11-10', '2027-01-30', '2027-02-15']);
  assert.deepEqual(s.instalments.map((i) => i.dueOn), ['2026-11-17', '2027-02-06', '2027-02-22']);
});

test('late booking collapses issue dates to confirmation and flags it', () => {
  const s = scheduleFor(order({ confirmedOn: '2027-02-20' }));
  assert.equal(s.lateBooking, true);
  assert.deepEqual(s.instalments.map((i) => i.issueOn), ['2027-02-20', '2027-02-20', '2027-02-20']);
  // due date never later than hire start
  assert.ok(s.instalments.every((i) => i.dueOn <= '2027-03-01'));
});

test('custom split per order (real jobs have used 50/50 and 25/75)', () => {
  const s = scheduleFor(order({ split: [50, 0, 50] }));
  assert.deepEqual(s.instalments.map((i) => i.percent), [50, 0, 50]);
});

test('rejects an order confirmed after hire start', () => {
  assert.throws(() => scheduleFor(order({ confirmedOn: '2027-03-02' })));
});

// ── draft invoices ─────────────────────────────────────
test('builds three valid drafts that add up to the order', () => {
  const r = buildDraftInvoices(order());
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.invoices.map((i) => i.reference), ['DEP-AHJ-0041-01', 'DEP-AHJ-0041-02', 'FINAL-AHJ-0041']);
  assert.ok(r.invoices.every((i) => i.payload.Status === 'DRAFT'));

  const hireNet = r.invoices.flatMap((i) => i.payload.LineItems).filter((l) => l.AccountCode === '810').reduce((a, l) => a + l._netPence, 0);
  assert.equal(hireNet, toPence(5500)); // all hire to 810

  const final = r.invoices[2].payload.LineItems;
  const dep = final.find((l) => l.AccountCode === '845');
  assert.equal(dep.TaxType, 'NONE');
  assert.equal(dep.Quantity, 3);
  assert.equal(dep.UnitAmount, 1000);
  // deposits on DEP-01 are hire only
  assert.ok(r.invoices[0].payload.LineItems.every((l) => l.AccountCode === '810'));
  // DEP-01: 25% of 5500 = 1375 net, 275 VAT
  assert.deepEqual(r.invoices[0].totals, { net: 1375, vat: 275, gross: 1650 });
});

test('a 50/50 job skips DEP-02 and still bills the full hire fee', () => {
  const r = buildDraftInvoices(order({ split: [50, 0, 50] }));
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.deepEqual(r.invoices.map((i) => i.reference), ['DEP-AHJ-0041-01', 'FINAL-AHJ-0041']);
  const hire = r.invoices.flatMap((i) => i.payload.LineItems).filter((l) => l.AccountCode === '810').reduce((a, l) => a + l._netPence, 0);
  assert.equal(hire, toPence(5500));
});

test('bad orders are refused with reasons, nothing built', () => {
  const r = buildDraftInvoices(order({ ahj: 'AHJ24', units: [] }));
  assert.equal(r.ok, false);
  assert.equal(r.invoices.length, 0);
  assert.ok(r.errors.some((e) => /AHJ-####/.test(e)));
});

test('guard blocks the mistakes found in the live ledger', () => {
  const base = { Type: 'ACCREC', Status: 'DRAFT', Contact: { Name: 'X' }, Reference: 'FINAL-AHJ-0003', LineItems: [] };
  // INV-0005: damage deposit coded to 200 with VAT
  const e1 = validateInvoicePayload({ ...base, LineItems: [{ Description: 'Damage Deposit', UnitAmount: 1000, AccountCode: '200', TaxType: 'OUTPUT2' }] });
  assert.ok(e1.some((e) => /must be coded to 845/.test(e)));
  // 845 with VAT
  const e2 = validateInvoicePayload({ ...base, LineItems: [{ Description: 'Damage deposit', UnitAmount: 1000, AccountCode: '845', TaxType: 'OUTPUT2' }] });
  assert.ok(e2.some((e) => /no VAT/.test(e)));
  // authorised invoices never go out from automation
  const e3 = validateInvoicePayload({ ...base, Status: 'AUTHORISED', LineItems: [{ Description: 'x', UnitAmount: 1, AccountCode: '204', TaxType: 'OUTPUT2' }] });
  assert.ok(e3.some((e) => /DRAFT/.test(e)));
  // non-standard reference
  const e4 = validateInvoicePayload({ ...base, Reference: 'AHJ-0003-FINAL', LineItems: [{ Description: 'x', UnitAmount: 1, AccountCode: '204', TaxType: 'OUTPUT2' }] });
  assert.ok(e4.some((e) => /not a standard/.test(e)));
  // account not in this org (e.g. 203)
  const e5 = validateInvoicePayload({ ...base, LineItems: [{ Description: 'x', UnitAmount: 1, AccountCode: '204', TaxType: 'OUTPUT2' }] }, { knownAccountCodes: ['200'] });
  assert.ok(e5.some((e) => /does not exist/.test(e)));
});

test('toXero strips internal fields', () => {
  const p = toXero(buildDraftInvoices(order()).invoices[0].payload);
  assert.ok(p.LineItems.every((l) => !('_netPence' in l) && !('_category' in l)));
});

// ── 810 release ────────────────────────────────────────
test('one-week hire in one month gives one balanced journal', () => {
  const js = buildReleaseJournals(order());
  assert.equal(js.length, 1);
  assert.ok(journalBalances(js[0].payload));
  assert.equal(js[0].payload.Status, 'DRAFT');
  const credits = js[0].payload.JournalLines.filter((l) => l.LineAmount < 0);
  assert.deepEqual(credits.map((l) => [l.AccountCode, l.LineAmount]), [['200', -4000], ['202', -1500]]);
});

test('two-month hire is released pro rata by day across month ends', () => {
  const js = buildReleaseJournals(order({ hireStart: '2026-07-15', hireEnd: '2026-09-15', units: [{ type: 'street_food', qty: 1, hireFee: 6000 }] }));
  assert.deepEqual(js.map((j) => j.date), ['2026-07-31', '2026-08-31', '2026-09-15']);
  const released = js.reduce((a, j) => a + j.payload.JournalLines.filter((l) => l.AccountCode === '810').reduce((b, l) => b + toPence(l.LineAmount), 0), 0);
  assert.equal(released, toPence(6000));
  assert.ok(js.every((j) => journalBalances(j.payload)));
});

// ── matching ───────────────────────────────────────────
const open = [
  { invoiceId: 'a', reference: 'DEP-AHJ-0041-01', amountDue: '1650.00' },
  { invoiceId: 'b', reference: 'DEP-AHJ-0041-02', amountDue: '1650.00' },
  { invoiceId: 'c', reference: 'FINAL-AHJ-0050', amountDue: '9000.00' },
];
const rcpt = (amount, reference) => ({ amount, reference, date: '2026-11-12' });

test('exact single match produces a payment payload', () => {
  const d = decide(rcpt(9000, 'ahj50 final'), open, { bankAccountId: 'rev' });
  assert.equal(d.decision, 'match');
  assert.equal(d.payload.Invoice.InvoiceID, 'c');
  assert.equal(d.payload.Amount, 9000);
  assert.equal(d.payload.Account.AccountID, 'rev');
});

test('two open invoices with the same amount go to review, never guessed', () => {
  assert.equal(decide(rcpt(1650, 'AHJ-0041'), open).decision, 'review');
});

test('overpayment applies amount due and flags the rest', () => {
  const d = decide(rcpt(9100, 'AHJ-0050'), open);
  assert.equal(d.decision, 'overpayment');
  assert.equal(d.payload.Amount, 9000);
  assert.equal(d.overpaidBy, 100);
});

test('part payment, no reference, unknown job, two jobs: all review', () => {
  assert.equal(decide(rcpt(5000, 'AHJ-0050'), open).decision, 'review');
  assert.equal(decide(rcpt(9000, 'thanks!'), open).decision, 'review');
  assert.equal(decide(rcpt(9000, 'AHJ-0099'), open).decision, 'review');
  assert.equal(decide(rcpt(9000, 'AHJ-0050 AHJ-0041'), open).decision, 'review');
});

// ── deposit release ────────────────────────────────────
test('clean return: full credit note to 845, full cash refund', () => {
  const r = buildDepositRelease({ ahj: 'AHJ-0041', customer: { name: 'X' }, depositHeld: 3000, outcomeDate: '2027-03-10' });
  assert.equal(r.creditNote.Reference, 'CN-AHJ-0041');
  assert.equal(r.creditNote.LineItems[0].AccountCode, '845');
  assert.equal(r.creditNote.LineItems[0].TaxType, 'NONE');
  assert.equal(r.deductionInvoice, null);
  assert.equal(r.cashRefund, 3000);
});

test('deductions invoiced to 225 with VAT, set against the credit note, never netted', () => {
  const r = buildDepositRelease({ ahj: 'AHJ-0041', customer: { name: 'X' }, depositHeld: 3000, outcomeDate: '2027-03-10', deductions: [{ description: 'Cracked hob glass', net: 250 }] });
  assert.equal(r.creditNote.LineItems[0].UnitAmount, 3000); // full deposit, not 3000 - 300
  assert.equal(r.deductionInvoice.LineItems[0].AccountCode, '225');
  assert.equal(r.deductionInvoice.LineItems[0].TaxType, 'OUTPUT2');
  assert.equal(r.allocation.amount, 300); // 250 + 50 VAT
  assert.equal(r.cashRefund, 2700);
});

test('deductions above the deposit leave the customer owing', () => {
  const r = buildDepositRelease({ ahj: 'AHJ-0041', customer: { name: 'X' }, depositHeld: 1000, outcomeDate: '2027-03-10', deductions: [{ description: 'Replace fryer', net: 1000 }] });
  assert.equal(r.cashRefund, 0);
  assert.equal(r.customerOwes, 200);
  assert.equal(r.flags.length, 1);
});

// ── audit against the anonymised snapshot ────────────────────
test('audit finds the PRD clean-up items in the snapshot', () => {
  const issues = auditInvoices(snapshot.docs);
  const has = (check, ref) => issues.some((i) => i.check === check && (!ref || i.reference === ref || i.number === ref));
  assert.ok(has('ahj-multiple-contacts', 'AHJ-0024'), 'swapped reference AHJ-0024');
  assert.ok(has('ahj-multiple-contacts', 'AHJ-0013'), 'swapped reference AHJ-0013');
  assert.ok(has('reference-format', 'INV-0007'));
  assert.ok(has('reference-format', 'CN-0020'));
  assert.ok(has('deposit-account', 'INV-0005'), 'deposit coded to 200 with VAT');
  assert.ok(has('delivery-account', 'INV-0017'), 'collection coded to 201');
});
