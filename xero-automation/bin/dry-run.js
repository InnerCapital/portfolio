#!/usr/bin/env node
// Dry run: builds and prints the exact payloads each automation would send to Xero.
// It never calls Xero or any other service. This is the PRD's "test mode".
//
//   node bin/dry-run.js invoices examples/order.json
//   node bin/dry-run.js release  examples/order.json
//   node bin/dry-run.js match    examples/receipt.json examples/open-invoices.json
//   node bin/dry-run.js deposit  examples/deposit-release.json
//   node bin/dry-run.js audit    examples/xero-snapshot-2026-11-10.json
//   node bin/dry-run.js preflight examples/chart-codes-2026-11-10.json
//
// Add --json for raw output.

const fs = require('node:fs');
const path = require('node:path');
const { buildDraftInvoices, toXero } = require('../src/invoices');
const { buildReleaseJournals, journalBalances } = require('../src/release');
const { decide } = require('../src/matching');
const { buildDepositRelease } = require('../src/deposit');
const { auditInvoices } = require('../src/audit');
const { REQUIRED_CODES } = require('../src/accounts');
const config = require('../config');

const [cmd, ...rest] = process.argv.slice(2);
const json = rest.includes('--json');
const files = rest.filter((a) => !a.startsWith('--'));
const load = (f) => JSON.parse(fs.readFileSync(path.resolve(f), 'utf8'));
const out = (o) => console.log(JSON.stringify(o, null, 2));
const gbp = (n) => `£${Number(n).toFixed(2)}`;

const commands = {
  invoices([f]) {
    const r = buildDraftInvoices(load(f));
    if (json) return out({ ...r, invoices: r.invoices.map((i) => ({ ...i, payload: toXero(i.payload) })) });
    if (!r.ok) console.log(`BLOCKED, nothing would be written:\n  - ${r.errors.join('\n  - ')}`);
    for (const fl of r.flags || []) console.log(`FLAG: ${fl}`);
    for (const i of r.invoices) {
      console.log(`\n${i.reference}  issue ${i.issueOn}  due ${i.dueOn}  net ${gbp(i.totals.net)}  VAT ${gbp(i.totals.vat)}  gross ${gbp(i.totals.gross)}  [DRAFT]`);
      for (const l of i.payload.LineItems) console.log(`   ${l.AccountCode} ${l.TaxType.padEnd(7)} ${String(l.Quantity).padStart(2)} x ${gbp(l.UnitAmount).padStart(10)}  ${l.Description.slice(0, 80)}`);
    }
  },
  release([f]) {
    const js = buildReleaseJournals(load(f));
    if (json) return out(js);
    for (const j of js) {
      console.log(`\nJournal ${j.date} [DRAFT] balanced=${journalBalances(j.payload)}  ${j.payload.Narration}`);
      for (const l of j.payload.JournalLines) console.log(`   ${l.AccountCode}  ${(l.LineAmount > 0 ? 'Dr ' : 'Cr ') + gbp(Math.abs(l.LineAmount))}`);
    }
  },
  match([r, inv]) {
    const d = decide(load(r), load(inv), { bankAccountId: config.xero.revolutMainAccountId });
    out(d);
  },
  deposit([f]) {
    out(buildDepositRelease(load(f)));
  },
  audit([f]) {
    const issues = auditInvoices(load(f).docs);
    if (json) return out(issues);
    for (const i of issues) console.log(`[${i.severity.toUpperCase()}] ${i.number || ''} ${i.reference || ''} ${i.contact ? `(${i.contact})` : ''}\n   ${i.detail}\n   Fix: ${i.fix}`);
    console.log(`\n${issues.length} issue(s)`);
  },
  preflight([f]) {
    const codes = load(f).codes;
    const missing = REQUIRED_CODES.filter((c) => !codes.includes(c));
    console.log(missing.length ? `MISSING account codes: ${missing.join(', ')}` : `All ${REQUIRED_CODES.length} required account codes exist.`);
    process.exitCode = missing.length ? 1 : 0;
  },
};

if (!commands[cmd]) {
  console.log('Usage: node bin/dry-run.js <invoices|release|match|deposit|audit|preflight> <file...> [--json]');
  process.exit(1);
}
commands[cmd](files);
