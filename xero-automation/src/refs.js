// AHJ reference handling. AHJ-#### is the match key for every automation (PRD v2).
//
// Standard formats:
//   AHJ-0024            job
//   AHQ-0024            quote
//   AHSO-0024           sales order
//   DEP-AHJ-0024-01/02  deposit invoices
//   FINAL-AHJ-0024      final invoice
//   INT-AHJ-0024-01     non-standard interim billing
//   CN-AHJ-0024         credit note (incl. deposit refunds)

const pad = (n) => String(n).padStart(4, '0');

const jobNumber = (ahj) => {
  const m = /^AHJ-(\d{4,})$/.exec(String(ahj || '').trim());
  if (!m) throw new Error(`Invalid job reference "${ahj}". Expected AHJ-####.`);
  return m[1];
};

const isValidAhj = (s) => /^AHJ-\d{4,}$/.test(String(s || '').trim());

const build = {
  job: (n) => `AHJ-${pad(n)}`,
  quote: (ahj) => `AHQ-${jobNumber(ahj)}`,
  salesOrder: (ahj) => `AHSO-${jobNumber(ahj)}`,
  deposit: (ahj, seq) => {
    if (![1, 2].includes(seq)) throw new Error('Deposit sequence must be 1 or 2');
    return `DEP-${ahj}-0${seq}`;
  },
  final: (ahj) => `FINAL-${ahj}`,
  interim: (ahj, seq) => `INT-${ahj}-${String(seq).padStart(2, '0')}`,
  creditNote: (ahj) => `CN-${ahj}`,
};

// Strict parse of a *standard* document reference.
const STANDARD = [
  { kind: 'job', re: /^AHJ-(\d{4,})$/ },
  { kind: 'quote', re: /^AHQ-(\d{4,})$/ },
  { kind: 'salesOrder', re: /^AHSO-(\d{4,})$/ },
  { kind: 'deposit', re: /^DEP-AHJ-(\d{4,})-(0[12])$/ },
  { kind: 'final', re: /^FINAL-AHJ-(\d{4,})$/ },
  { kind: 'interim', re: /^INT-AHJ-(\d{4,})-(\d{2})$/ },
  { kind: 'creditNote', re: /^CN-AHJ-(\d{4,})$/ },
];

const parseStandard = (ref) => {
  const s = String(ref || '').trim();
  for (const { kind, re } of STANDARD) {
    const m = re.exec(s);
    if (m) return { kind, ahj: `AHJ-${m[1]}`, seq: m[2] ? Number(m[2]) : null, ref: s };
  }
  return null;
};

// Lenient read of the messy references already in Xero, so the audit can say
// "this is probably DEP-AHJ-0003-02" rather than just "invalid".
// Never used to *apply money* — only to suggest a rename.
const suggestStandard = (ref) => {
  const raw = String(ref || '');
  const s = raw.toUpperCase().replace(/\s+/g, '').replace(/[–—_]/g, '-');
  const notes = [];
  // NGM is a known typo for AHJ in this ledger.
  let t = s.replace(/NGM/g, () => {
    notes.push('NGM treated as typo for AHJ');
    return 'AHJ';
  });
  const num = /AHJ-?(\d{1,6})/.exec(t);
  if (!num) return { suggestion: null, notes: ['No AHJ number found'] };
  const ahj = `AHJ-${pad(num[1])}`;
  const seqMatch = /AHJ-?\d{1,6}-(\d{1,2})\b/.exec(t);
  const seq = seqMatch ? Number(seqMatch[1]) : null;

  let suggestion = null;
  if (/^(CN|DEPOSIT-REFUND)/.test(t)) suggestion = build.creditNote(ahj);
  else if (/^(FIN|FINAL|BAL)/.test(t) || /FINAL$/.test(t)) suggestion = build.final(ahj);
  else if (/^DEP/.test(t)) suggestion = seq === 1 || seq === 2 ? build.deposit(ahj, seq) : build.deposit(ahj, 1);
  else if (/^INT/.test(t)) suggestion = build.interim(ahj, seq || 1);
  else if (/^EQP/.test(t)) {
    suggestion = build.interim(ahj, seq || 1);
    notes.push('Equipment add-on billed separately: INT- is the closest standard type');
  } else if (t === ahj) suggestion = ahj;

  if (/^DEP/.test(t) && !/^DEPOSIT-REFUND/.test(t) && !(seq === 1 || seq === 2)) notes.push('Deposit sequence missing; assumed -01, check');
  if (/^BAL/.test(t)) notes.push('Balance invoice mapped to FINAL');
  return { suggestion, ahj, notes };
};

// Pull AHJ candidates out of free text a customer typed on a bank transfer.
// Customers write things like "ahj24", "AHJ 0024", "Inv AHJ-0024 dep", "job 24".
// Returns every distinct candidate; the matcher decides, and anything not exactly one
// candidate goes to a person.
const extractAhjCandidates = (text) => {
  const s = String(text || '').toUpperCase();
  const found = new Set();
  const re = /A\s*H\s*J\s*[-\s#:]*0*(\d{1,6})/g;
  let m;
  while ((m = re.exec(s))) found.add(`AHJ-${pad(m[1])}`);
  return [...found];
};

module.exports = { build, jobNumber, isValidAhj, parseStandard, suggestStandard, extractAhjCandidates };
