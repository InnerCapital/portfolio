// Ledger audit: runs the PRD clean-up checks over a list of Xero invoices and credit
// notes, so the clean-up list is produced from data rather than by eye, and can be
// re-run after Finance fixes things.
//
// Input shape (what get_invoices returns, trimmed): see examples/xero-snapshot-2026-11-10.json

const { parseStandard, suggestStandard, extractAhjCandidates } = require('./refs');
const { ACCOUNTS, TAX } = require('./accounts');

const DEPOSIT_TEXT = /damage\s*deposit|refundable\s*(damage\s*)?deposit/i;

const auditInvoices = (docs) => {
  const issues = [];
  const add = (severity, doc, check, detail, fix) =>
    issues.push({ severity, number: doc.number, reference: doc.reference, contact: doc.contact, check, detail, fix });

  // Which contacts each AHJ appears against.
  const contactsByAhj = new Map();

  for (const d of docs) {
    if (d.status === 'VOIDED' || d.status === 'DELETED') continue;
    const std = parseStandard(d.reference);
    const isCredit = d.type === 'ACCRECCREDIT';

    if (!std) {
      const s = suggestStandard(d.reference);
      add('medium', d, 'reference-format', `"${d.reference}" is not a standard reference`, s.suggestion ? `Rename to ${s.suggestion}${s.notes.length ? ` (${s.notes.join('; ')})` : ''}` : 'Set a AHJ reference');
    } else if (isCredit && std.kind !== 'creditNote') {
      add('medium', d, 'reference-format', 'Credit note without a CN- reference', `Rename to CN-${std.ahj}`);
    }

    const ahj = std ? std.ahj : suggestStandard(d.reference).ahj;
    if (ahj) {
      if (!contactsByAhj.has(ahj)) contactsByAhj.set(ahj, new Map());
      const m = contactsByAhj.get(ahj);
      m.set(d.contact, [...(m.get(d.contact) || []), d.number]);
    }

    // AHJ named in the line text but different from the reference.
    const textAhj = new Set((d.lines || []).flatMap((l) => extractAhjCandidates(l.description)));
    if (ahj && textAhj.size && !textAhj.has(ahj)) add('high', d, 'reference-vs-lines', `Reference says ${ahj}, line text says ${[...textAhj].join(', ')}`, 'Confirm which job this belongs to');

    for (const [i, l] of (d.lines || []).entries()) {
      if (l.accountCode == null) continue; // heading line
      const n = i + 1;
      const isDeposit = DEPOSIT_TEXT.test(l.description || '');
      if (isDeposit && l.accountCode !== ACCOUNTS.DAMAGE_DEPOSITS)
        add('high', d, 'deposit-account', `Line ${n} is a damage deposit coded to ${l.accountCode}${Number(l.tax) ? ` with £${l.tax} VAT` : ''}`, 'Damage deposits go to 845 with No VAT. Ask the accountant whether to correct by credit note and reissue.');
      if (l.accountCode === ACCOUNTS.DAMAGE_DEPOSITS && Number(l.tax) !== 0)
        add('high', d, 'deposit-vat', `Line ${n} on 845 carries VAT`, '845 lines must be No VAT');
      if (/delivery|collection/i.test(l.description || '') && !isDeposit && l.accountCode !== ACCOUNTS.DELIVERY_COLLECTION)
        add('low', d, 'delivery-account', `Line ${n} "${firstLine(l.description)}" coded to ${l.accountCode}`, 'Delivery and collection belong in 204');
      if (/insurance/i.test(l.description || '') && l.accountCode !== ACCOUNTS.INSURANCE)
        add('low', d, 'insurance-account', `Line ${n} insurance coded to ${l.accountCode}`, 'Insurance recharges belong in 206');
      if (l.accountCode === ACCOUNTS.DAMAGE_DEPOSITS && Number(l.net) < 0)
        add('info', d, 'deposit-applied', `Line ${n} applies £${-Number(l.net)} of a held deposit against this invoice`, 'Include in the 845 reconciliation for the job it came from');
    }
  }

  for (const [ahj, byContact] of contactsByAhj) {
    if (byContact.size > 1) {
      const parts = [...byContact].map(([c, nums]) => `${c} (${nums.join(', ')})`);
      issues.push({ severity: 'high', number: null, reference: ahj, contact: null, check: 'ahj-multiple-contacts', detail: `${ahj} used for more than one customer: ${parts.join('; ')}`, fix: 'One job, one customer. Correct the wrong reference before payment matching goes live.' });
    }
  }

  const order = { high: 0, medium: 1, low: 2, info: 3 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
};

const firstLine = (s) => String(s || '').split('\n')[0].slice(0, 60);

// Shape a get_invoices (Xero MCP) response into the audit input.
const fromXeroMcp = (resp, type = 'ACCREC') =>
  (resp.invoices || []).map((i) => ({
    type,
    number: i.invoice_number,
    reference: i.reference,
    status: i.status,
    contact: i.contact && i.contact.name,
    total: Number(i.amount_total),
    lines: (i.line_items || []).map((l) => ({
      description: l.description,
      accountCode: l.account_code,
      net: l.line_amount_net,
      tax: l.line_tax_amount,
    })),
  }));

module.exports = { auditInvoices, fromXeroMcp };
