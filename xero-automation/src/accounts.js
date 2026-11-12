// Chart-of-accounts rules, taken from the live Acme Hire Limited chart on 10 Nov 2026.
// Every automated line is coded from here, never typed by hand.

const ACCOUNTS = {
  DEFERRED_HIRE: '810', // liability, hire invoiced before it is earned
  DAMAGE_DEPOSITS: '845', // liability, refundable deposits, never revenue
  DELIVERY_COLLECTION: '204',
  TECH_PACKAGE: '205',
  INSURANCE: '206',
  BRANDING: '207',
  STORAGE: '208',
  CANCELLATION: '211',
  SITE_SURVEY: '223',
  CLEANING: '224',
  DAMAGE_RECOVERY: '225',
  DEPLOYMENT_SETUP: '226',
};

// Where hire revenue lands when 810 is released, by unit type.
const HIRE_REVENUE_BY_UNIT = {
  street_food: '200',
  dark_kitchen: '201',
  bar: '202',
};

// Xero UK tax types.
const TAX = {
  STANDARD: 'OUTPUT2', // 20% on sales
  NONE: 'NONE', // No VAT
};

// Line categories the order model uses → account + tax.
const LINE_RULES = {
  hire: { account: ACCOUNTS.DEFERRED_HIRE, tax: TAX.STANDARD },
  delivery: { account: ACCOUNTS.DELIVERY_COLLECTION, tax: TAX.STANDARD },
  collection: { account: ACCOUNTS.DELIVERY_COLLECTION, tax: TAX.STANDARD },
  insurance: { account: ACCOUNTS.INSURANCE, tax: TAX.STANDARD },
  tech: { account: ACCOUNTS.TECH_PACKAGE, tax: TAX.STANDARD },
  branding: { account: ACCOUNTS.BRANDING, tax: TAX.STANDARD },
  storage: { account: ACCOUNTS.STORAGE, tax: TAX.STANDARD },
  site_survey: { account: ACCOUNTS.SITE_SURVEY, tax: TAX.STANDARD },
  cleaning: { account: ACCOUNTS.CLEANING, tax: TAX.STANDARD },
  setup: { account: ACCOUNTS.DEPLOYMENT_SETUP, tax: TAX.STANDARD },
  damage_deposit: { account: ACCOUNTS.DAMAGE_DEPOSITS, tax: TAX.NONE },
};

const ruleFor = (category) => {
  const r = LINE_RULES[category];
  if (!r) throw new Error(`No account rule for line category "${category}"`);
  return r;
};

// Accounts that must exist in Xero before anything is written. Checked by preflight.
const REQUIRED_CODES = [...new Set([...Object.values(ACCOUNTS), ...Object.values(HIRE_REVENUE_BY_UNIT)])];

module.exports = { ACCOUNTS, HIRE_REVENUE_BY_UNIT, TAX, LINE_RULES, ruleFor, REQUIRED_CODES };
