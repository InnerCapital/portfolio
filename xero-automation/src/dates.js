// Date helpers on plain 'YYYY-MM-DD' strings, UTC, no time zones.

const parse = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) throw new Error(`Bad date "${s}", expected YYYY-MM-DD`);
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Bad date "${s}"`);
  return d;
};
const fmt = (d) => d.toISOString().slice(0, 10);
const addDays = (s, n) => {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return fmt(d);
};
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000); // b - a
const max = (a, b) => (a >= b ? a : b);
const min = (a, b) => (a <= b ? a : b);
const endOfMonth = (s) => {
  const d = parse(s);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

module.exports = { parse, fmt, addDays, diffDays, max, min, endOfMonth };
