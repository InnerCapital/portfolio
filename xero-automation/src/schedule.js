// Invoice schedule for one confirmed order (PRD v2, scenario 1).
//
// Standard plan: DEP-01 25% at confirmation, DEP-02 25% at D-30, FINAL 50% + extras
// + damage deposit at D-14, where D = hire start.
//
// Late bookings: if D-30 or D-14 has already passed at confirmation, that invoice is
// issued on the confirmation date. We keep three separate invoices (stable references,
// simpler matching) and flag the order so the reviewer sees all three land together.
// Whether to combine them instead is an open policy question in docs/v3-changes.md.

const { addDays, max, min, diffDays } = require('./dates');

const DEFAULT_POLICY = {
  split: [25, 25, 50], // DEP-01, DEP-02, FINAL share of the hire fee
  dep2DaysBefore: 30,
  finalDaysBefore: 14,
  paymentTermsDays: 7, // ASSUMPTION: due 7 days after issue, never later than hire start
};

const scheduleFor = (order, policy = {}) => {
  const p = { ...DEFAULT_POLICY, ...policy, ...(order.split ? { split: order.split } : {}) };
  const { confirmedOn, hireStart } = order;
  if (!confirmedOn || !hireStart) throw new Error('Order needs confirmedOn and hireStart');
  const lead = diffDays(confirmedOn, hireStart);
  if (lead < 0) throw new Error(`Order ${order.ahj} confirmed after hire start`);

  const due = (issue) => min(addDays(issue, p.paymentTermsDays), max(issue, hireStart));

  const dep1Issue = confirmedOn;
  const dep2Issue = max(confirmedOn, addDays(hireStart, -p.dep2DaysBefore));
  const finalIssue = max(confirmedOn, addDays(hireStart, -p.finalDaysBefore));

  const flags = [];
  if (dep2Issue === confirmedOn) flags.push(`Late booking: DEP-02 issued at confirmation (${lead} days' notice)`);
  if (finalIssue === confirmedOn) flags.push(`Late booking: FINAL issued at confirmation (${lead} days' notice)`);
  if (p.split.length !== 3) throw new Error('Split must have three parts: DEP-01, DEP-02, FINAL');

  return {
    leadDays: lead,
    lateBooking: flags.length > 0,
    flags,
    split: p.split,
    instalments: [
      { kind: 'deposit', seq: 1, percent: p.split[0], issueOn: dep1Issue, dueOn: due(dep1Issue) },
      { kind: 'deposit', seq: 2, percent: p.split[1], issueOn: dep2Issue, dueOn: due(dep2Issue) },
      { kind: 'final', seq: null, percent: p.split[2], issueOn: finalIssue, dueOn: due(finalIssue) },
    ],
  };
};

module.exports = { scheduleFor, DEFAULT_POLICY };
