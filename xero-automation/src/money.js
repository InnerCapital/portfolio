// All money is handled in integer pence to avoid float drift.
// Convert at the edges only (input from Booqable/Revolut, output to Xero).

const toPence = (pounds) => {
  if (pounds === null || pounds === undefined || pounds === '') return 0;
  const n = typeof pounds === 'string' ? Number(pounds.replace(/[£,\s]/g, '')) : Number(pounds);
  if (!Number.isFinite(n)) throw new Error(`Not a money amount: ${pounds}`);
  return Math.round(n * 100);
};

const toPounds = (pence) => Math.round(pence) / 100;

// UK standard rate. Kept as a constant so the accountant can see the one place it lives.
const VAT_RATE = 0.2;
const vatOn = (netPence) => Math.round(netPence * VAT_RATE);

// Split a total into parts by percentage, putting any rounding remainder on the last part,
// so the parts always sum exactly to the total.
const splitByPercent = (totalPence, percents) => {
  const sum = percents.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 100) > 1e-9) throw new Error(`Split must total 100%, got ${sum}%`);
  const parts = percents.map((p) => Math.floor((totalPence * p) / 100));
  const used = parts.reduce((a, b) => a + b, 0);
  parts[parts.length - 1] += totalPence - used;
  return parts;
};

module.exports = { toPence, toPounds, VAT_RATE, vatOn, splitByPercent };
