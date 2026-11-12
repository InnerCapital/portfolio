// Builds the Xero draft invoices for a confirmed order (scenario 1), and the
// guard that every payload must pass before anything is written to Xero.

const { build, parseStandard } = require('./refs');
const { ruleFor, ACCOUNTS, TAX, REQUIRED_CODES } = require('./accounts');
const { toPence, toPounds, vatOn, splitByPercent } = require('./money');
const { scheduleFor } = require('./schedule');
const { validateOrder, unitCount, UNIT_LABEL } = require('./order');

const DEFAULT_DEPOSIT_PER_UNIT = 1000;

const contactOf = (c) => (c.xeroContactId ? { ContactID: c.xeroContactId } : { Name: c.name });

const line = (description, category, netPence, qty = 1) => {
  const r = ruleFor(category);
  return {
    Description: description,
    Quantity: qty,
    UnitAmount: toPounds(netPence / qty),
    AccountCode: r.account,
    TaxType: r.tax,
    _category: category, // stripped before sending
    _netPence: netPence,
  };
};

// Hire share per unit line for each instalment. Split each unit line by the plan so
// the three instalments always add back to exactly the agreed hire fee.
const hireShares = (order, split) =>
  order.units.map((u) => ({ unit: u, parts: splitByPercent(toPence(u.hireFee), split) }));

const buildDraftInvoices = (order, policy) => {
  const errors = validateOrder(order);
  if (errors.length) return { ok: false, errors, invoices: [] };

  const sched = scheduleFor(order, policy);
  const shares = hireShares(order, sched.split);
  const depositPerUnit = toPence(order.depositPerUnit ?? DEFAULT_DEPOSIT_PER_UNIT);
  const header = `${order.ahj}: hire ${order.hireStart} to ${order.hireEnd}`;

  const invoices = sched.instalments.map((inst, idx) => {
    if (inst.kind === 'deposit' && inst.percent === 0) return null; // e.g. a 50/50 job has no DEP-02
    const isFinal = inst.kind === 'final';
    const reference = isFinal ? build.final(order.ahj) : build.deposit(order.ahj, inst.seq);
    const label = isFinal ? `Final instalment (${inst.percent}% of hire fee)` : `Deposit ${inst.seq} (${inst.percent}% of hire fee)`;

    const lines = shares
      .filter((s) => s.parts[idx] > 0)
      .map((s) => line(`${label}: ${s.unit.qty} x ${UNIT_LABEL[s.unit.type]}. ${header}`, 'hire', s.parts[idx]));

    if (isFinal) {
      for (const x of order.extras || []) lines.push(line(x.description || x.category, x.category, toPence(x.net)));
      const units = unitCount(order);
      if (depositPerUnit > 0) {
        lines.push(
          line(
            `Refundable damage deposit: ${units} unit(s) at £${toPounds(depositPerUnit).toFixed(2)}. Refunded within 14 days of collection, less any documented deductions.`,
            'damage_deposit',
            depositPerUnit * units,
            units,
          ),
        );
      }
    }

    const net = lines.reduce((a, l) => a + l._netPence, 0);
    const vat = lines.reduce((a, l) => a + (l.TaxType === TAX.STANDARD ? vatOn(l._netPence) : 0), 0);
    return {
      reference,
      issueOn: inst.issueOn,
      dueOn: inst.dueOn,
      totals: { net: toPounds(net), vat: toPounds(vat), gross: toPounds(net + vat) },
      payload: {
        Type: 'ACCREC',
        Status: 'DRAFT',
        Contact: contactOf(order.customer),
        Date: inst.issueOn,
        DueDate: inst.dueOn,
        Reference: reference,
        LineAmountTypes: 'Exclusive',
        LineItems: lines,
      },
    };
  }).filter(Boolean);

  const problems = invoices.flatMap((i) => validateInvoicePayload(i.payload).map((e) => `${i.reference}: ${e}`));
  return {
    ok: problems.length === 0,
    errors: problems,
    flags: sched.flags,
    lateBooking: sched.lateBooking,
    invoices,
  };
};

// The guard. Every payload goes through this immediately before a write; a failure
// means the write does not happen and a person is told why.
const validateInvoicePayload = (p, { knownAccountCodes } = {}) => {
  const e = [];
  if (p.Status !== 'DRAFT') e.push(`Status must be DRAFT, got ${p.Status}. Automations never authorise invoices.`);
  if (p.Type !== 'ACCREC') e.push('Only sales invoices (ACCREC) are built here');
  const std = parseStandard(p.Reference);
  if (!std || !['deposit', 'final', 'interim'].includes(std.kind)) e.push(`Reference "${p.Reference}" is not a standard invoice reference`);
  if (!p.Contact || !(p.Contact.ContactID || p.Contact.Name)) e.push('No contact');
  if (!Array.isArray(p.LineItems) || p.LineItems.length === 0) e.push('No line items');
  for (const [i, l] of (p.LineItems || []).entries()) {
    const n = i + 1;
    if (!REQUIRED_CODES.includes(l.AccountCode)) e.push(`Line ${n}: account ${l.AccountCode} is not an approved code`);
    if (knownAccountCodes && !knownAccountCodes.includes(l.AccountCode)) e.push(`Line ${n}: account ${l.AccountCode} does not exist in this Xero org`);
    const looksLikeDeposit = /damage\s*deposit|refundable/i.test(l.Description || '');
    if (l.AccountCode === ACCOUNTS.DAMAGE_DEPOSITS && l.TaxType !== TAX.NONE) e.push(`Line ${n}: damage deposits carry no VAT`);
    if (looksLikeDeposit && l.AccountCode !== ACCOUNTS.DAMAGE_DEPOSITS) e.push(`Line ${n}: deposit line must be coded to 845`);
    if (l.AccountCode === ACCOUNTS.DAMAGE_DEPOSITS && std && std.kind === 'deposit') e.push(`Line ${n}: damage deposit belongs on FINAL, not a hire deposit`);
    if (!(Number(l.UnitAmount) > 0)) e.push(`Line ${n}: amount must be positive (use a credit note for reductions)`);
  }
  return e;
};

// Remove internal fields before sending to Xero.
const toXero = (payload) => ({
  ...payload,
  LineItems: payload.LineItems.map(({ _category, _netPence, ...rest }) => rest),
});

module.exports = { buildDraftInvoices, validateInvoicePayload, toXero, DEFAULT_DEPOSIT_PER_UNIT };
