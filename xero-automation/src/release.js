// Releasing Deferred Hire Revenue (810) to the hire revenue accounts (200/201/202).
// The PRD posts all hire to 810 but had no step that moves it out again (gap 4).
//
// Method: straight-line by hire day, one draft manual journal per calendar month the
// hire touches, dated the month end (or hire end, if earlier). A one-week hire inside
// one month gives one journal. Journals are DRAFT: Finance posts them.
//
// Xero manual journals: positive LineAmount = debit, negative = credit. No VAT on
// either side, because VAT was accounted for on the invoice.

const { HIRE_REVENUE_BY_UNIT, ACCOUNTS, TAX } = require('./accounts');
const { toPence, toPounds } = require('./money');
const { diffDays, endOfMonth, addDays, min } = require('./dates');
const { UNIT_LABEL } = require('./order');

// Split total pence across periods in proportion to days, remainder on the last period.
const prorate = (total, dayCounts) => {
  const days = dayCounts.reduce((a, b) => a + b, 0);
  const parts = dayCounts.map((d) => Math.floor((total * d) / days));
  parts[parts.length - 1] += total - parts.reduce((a, b) => a + b, 0);
  return parts;
};

const periodsFor = (hireStart, hireEnd) => {
  const out = [];
  let from = hireStart;
  while (from <= hireEnd) {
    const to = min(endOfMonth(from), hireEnd);
    out.push({ from, to, days: diffDays(from, to) + 1 });
    from = addDays(to, 1);
  }
  return out;
};

const buildReleaseJournals = (order) => {
  const periods = periodsFor(order.hireStart, order.hireEnd);
  const perUnit = order.units.map((u) => ({ u, parts: prorate(toPence(u.hireFee), periods.map((p) => p.days)) }));

  return periods.map((p, i) => {
    const lines = [];
    for (const { u, parts } of perUnit) {
      const amt = parts[i];
      if (!amt) continue;
      const desc = `${order.ahj} hire earned ${p.from} to ${p.to}: ${u.qty} x ${UNIT_LABEL[u.type]}`;
      lines.push({ AccountCode: ACCOUNTS.DEFERRED_HIRE, LineAmount: toPounds(amt), TaxType: TAX.NONE, Description: desc });
      lines.push({ AccountCode: HIRE_REVENUE_BY_UNIT[u.type], LineAmount: -toPounds(amt), TaxType: TAX.NONE, Description: desc });
    }
    return {
      date: p.to,
      payload: {
        Narration: `Release deferred hire revenue ${order.ahj} (${p.from} to ${p.to})`,
        Date: p.to,
        Status: 'DRAFT',
        LineAmountTypes: 'NoTax',
        JournalLines: lines,
      },
    };
  });
};

const journalBalances = (payload) =>
  Math.round(payload.JournalLines.reduce((a, l) => a + toPence(l.LineAmount), 0)) === 0;

module.exports = { buildReleaseJournals, periodsFor, journalBalances };
