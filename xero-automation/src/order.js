// The internal order model every builder works from, plus validation.
// A Booqable adapter (src/booqable.js) maps Booqable's order into this shape.
//
// {
//   ahj: 'AHJ-0041',
//   customer: { xeroContactId?: uuid, name: 'Acme Events Ltd', email?: '' },
//   confirmedOn: '2026-11-10', hireStart: '2027-03-01', hireEnd: '2027-03-08',
//   units: [ { type: 'street_food' | 'bar' | 'dark_kitchen', qty: 2, hireFee: 4000 } ],   // hireFee = net £ for that line, all qty
//   extras: [ { category: 'delivery' | 'collection' | 'insurance' | ..., description, net: 1095 } ],  // go on FINAL
//   depositPerUnit?: 1000,
//   split?: [25, 25, 50],
// }

const { isValidAhj } = require('./refs');
const { HIRE_REVENUE_BY_UNIT, LINE_RULES } = require('./accounts');
const { toPence } = require('./money');

const validateOrder = (o) => {
  const errors = [];
  if (!o || typeof o !== 'object') return ['Order missing'];
  if (!isValidAhj(o.ahj)) errors.push(`Job reference "${o.ahj}" is not AHJ-####`);
  if (!o.customer || !(o.customer.xeroContactId || o.customer.name)) errors.push('Customer has no Xero contact id or name');
  for (const k of ['confirmedOn', 'hireStart', 'hireEnd']) if (!o[k]) errors.push(`Missing ${k}`);
  if (o.hireStart && o.hireEnd && o.hireEnd < o.hireStart) errors.push('Hire ends before it starts');
  if (!Array.isArray(o.units) || o.units.length === 0) errors.push('No units on the order');
  for (const [i, u] of (o.units || []).entries()) {
    if (!HIRE_REVENUE_BY_UNIT[u.type]) errors.push(`Unit ${i + 1}: unknown type "${u.type}"`);
    if (!(Number(u.qty) > 0)) errors.push(`Unit ${i + 1}: quantity must be above 0`);
    if (!(toPence(u.hireFee) > 0)) errors.push(`Unit ${i + 1}: hire fee must be above 0`);
  }
  for (const [i, x] of (o.extras || []).entries()) {
    if (!LINE_RULES[x.category] || x.category === 'hire' || x.category === 'damage_deposit')
      errors.push(`Extra ${i + 1}: category "${x.category}" not allowed as an extra`);
    if (!(toPence(x.net) > 0)) errors.push(`Extra ${i + 1}: amount must be above 0`);
  }
  return errors;
};

const unitCount = (o) => o.units.reduce((n, u) => n + Number(u.qty), 0);

const UNIT_LABEL = { street_food: 'Street Food Kitchen', bar: 'Bar Unit', dark_kitchen: 'Dark Kitchen' };

module.exports = { validateOrder, unitCount, UNIT_LABEL };
