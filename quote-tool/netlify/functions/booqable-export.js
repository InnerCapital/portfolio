// netlify/functions/booqable-export.js
//
// Called from the quote tool's "Send to Booqable" button. Creates a draft
// (concept) order in Booqable for the quoted hire.
//
// Protected two ways:
//   1. Staff Google sign-in, verified server-side (lib/requireStaff.js)
//   2. Test mode (BOOQABLE_EXPORT_TEST_MODE, on unless set to "false"): builds the
//      exact Booqable requests and returns them, without calling Booqable
//
// Environment variables:
//   BOOQABLE_EXPORT_TEST_MODE  "false" to send for real; anything else is test mode
//   BOOQABLE_API_KEY           Booqable access token (Settings > API keys), live mode only
//   BOOQABLE_COMPANY_SLUG      optional, defaults to "acme-hire"
//   BOOQABLE_ADMIN_URL         optional, the back-office URL used for the "open order" link
//
// What gets created:
//   - the customer is matched by name (case-insensitive), or created if new
//   - a concept order with the hire dates (09:00 delivery, 17:00 collection, UK time)
//   - units, insurance, standard clean, set-up fee, site survey and graphics are
//     booked as Booqable products, so Booqable prices them from its own setup
//   - delivery, collection, storage and any short-notice premium go on as custom
//     lines with the prices from the quote tool
// The response compares Booqable's subtotal with the quote tool's, so a pricing
// mismatch between the two shows up straight away.

const { requireStaff } = require('./lib/requireStaff');

// Booqable product IDs (products, not product groups), checked 11 Nov 2026.
const PRODUCTS = {
  units: {
    street: { id: 'ed298607-a02a-43c1-b5ca-281b351516fc', name: 'Street Food Kitchen' },
    dark: { id: 'e7475c61-0f4d-4cfd-8bd2-9705c5e7bf94', name: 'Dark Kitchen' },
    bar: { id: '30eb0bf6-a349-4870-9762-8cc3fb3bcfa1', name: 'Acme Hire Bar' },
  },
  insurance: { id: 'ad9e9c9f-6f3d-4094-9bcb-b0bb7a2bb345', name: 'Insurance' },
  clean: { id: '0b38f893-ddeb-4301-89c5-42138aad64ec', name: 'Standard Clean (per unit)' },
  setup: { id: '6e5adc29-2299-4255-8cb9-58e52068a2aa', name: 'Set-Up Fee (per deployment)' },
  survey: { id: 'cff15573-0d0f-4c8f-a775-3e7bc268dff6', name: 'Site Survey' },
  graphics: {
    450: { id: '5630b582-ff95-4aed-8021-ad2e07f871f9', name: 'Graphics - Standard (per unit)' },
    950: { id: 'abc7aebf-54d3-4876-865d-9e25be2816c0', name: 'Graphics - Custom (per unit)' },
    1950: { id: 'f23d01e9-57d0-41c3-ab85-c4e962582eb2', name: 'Graphics - Premium Full Wrap (per unit)' },
  },
};
const TAX_CATEGORY_ID = '067c0d96-23ad-4a0b-9ead-2f1c03b19fab'; // Standard Sales Tax, VAT 20%
const DEFAULT_ADMIN_URL = 'https://0cfb1039-143f-42f2-8c15-f6b9e5f349b0.booqable.com';
const TERMS = ['3days', '4days', 'weekly', 'monthly', '3months', '12months'];
const MAX_UNITS = 10;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

class InputError extends Error {}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  // ── Staff gate ─────────────────────────────────────────
  const staff = await requireStaff(event);
  if (!staff.ok) return staff.response;

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (e) {
    return json(400, { error: 'Invalid request body' });
  }

  // ── Validate and build the plan ────────────────────────
  let plan;
  try {
    plan = buildPlan(body);
  } catch (e) {
    if (e instanceof InputError) return json(400, { error: e.message });
    throw e;
  }

  // ── Test mode: return the exact requests, never call Booqable ──
  if (String(process.env.BOOQABLE_EXPORT_TEST_MODE).toLowerCase() !== 'false') {
    return json(200, { testMode: true, plan });
  }

  // ── Real send ───────────────────────────────────────────
  const apiKey = process.env.BOOQABLE_API_KEY;
  if (!apiKey) return json(500, { error: 'BOOQABLE_API_KEY is not configured on the server. Nothing was sent.' });
  const api = makeClient(apiKey, process.env.BOOQABLE_COMPANY_SLUG || 'acme-hire');

  let orderId = null;
  let orderNumber = null;
  try {
    const { customerId, customerName, customerCreated } = await findOrCreateCustomer(api, plan.customer);

    const order = await api('POST', '/orders', {
      data: { type: 'orders', attributes: { customer_id: customerId, starts_at: plan.order.starts_at, stops_at: plan.order.stops_at } },
    });
    orderId = order.data.id;
    orderNumber = attr(order.data).number ?? null;

    // Reference line first, so the quote ref is visible at the top of the order
    await api('POST', '/lines', lineBody(orderId, { line_type: 'section', title: plan.reference }));

    if (plan.bookings.length) {
      await api('POST', '/order_fulfillments', {
        data: {
          type: 'order_fulfillments',
          attributes: {
            order_id: orderId,
            confirm_shortage: null,
            actions: plan.bookings.map(b => ({ action: 'book_product', mode: 'create_new', product_id: b.product_id, quantity: b.quantity })),
          },
        },
      });
    }

    for (const l of plan.customLines) {
      await api('POST', '/lines', lineBody(orderId, {
        line_type: 'charge',
        title: l.title,
        quantity: l.quantity,
        price_each_in_cents: l.price_each_in_cents,
        tax_category_id: TAX_CATEGORY_ID,
      }));
    }

    const saved = attr((await api('GET', `/orders/${orderId}`)).data);
    orderNumber = saved.number ?? orderNumber;
    const booqableSubtotal = round2((saved.price_in_cents ?? 0) / 100);

    return json(200, {
      orderId,
      orderNumber,
      orderUrl: `${process.env.BOOQABLE_ADMIN_URL || DEFAULT_ADMIN_URL}/orders/${orderId}`,
      customerName,
      customerCreated,
      booqableSubtotal,
      toolSubtotal: plan.toolSubtotal,
      difference: round2(booqableSubtotal - plan.toolSubtotal),
    });
  } catch (e) {
    return json(502, { error: e.message, orderId, orderNumber });
  }
};

// ── Plan ──────────────────────────────────────────────────

function buildPlan(body) {
  const name = cleanText(body.customer && body.customer.name, 200);
  if (!name) throw new InputError('Missing customer company name.');

  const startDate = isoDate(body.startDate, 'start date');
  const endDate = isoDate(body.endDate, 'end date');
  if (endDate <= startDate) throw new InputError('End date must be after the start date.');
  if (!TERMS.includes(body.term)) throw new InputError('Unknown rental term.');

  const units = body.units || {};
  const bookings = [];
  let unitTotal = 0;
  for (const type of Object.keys(PRODUCTS.units)) {
    const qty = count(units[type], `${type} units`, MAX_UNITS);
    if (qty) bookings.push({ product_id: PRODUCTS.units[type].id, quantity: qty, label: PRODUCTS.units[type].name });
    unitTotal += qty;
  }
  if (!unitTotal) throw new InputError('No units on the quote.');
  if (unitTotal > MAX_UNITS) throw new InputError(`More than ${MAX_UNITS} units; send this one manually.`);

  const sv = body.services || {};
  const add = (product, qty) => { if (qty) bookings.push({ product_id: product.id, quantity: qty, label: product.name }); };
  add(PRODUCTS.insurance, count(sv.insurance, 'insurance', MAX_UNITS));
  add(PRODUCTS.clean, count(sv.clean, 'standard clean', MAX_UNITS));
  add(PRODUCTS.setup, count(sv.setup, 'set-up fee', 1));
  add(PRODUCTS.survey, count(sv.survey, 'site survey', 1));
  const tier = Number(sv.graphicsTier || 0);
  if (tier) {
    if (!PRODUCTS.graphics[tier]) throw new InputError('Unknown graphics package.');
    add(PRODUCTS.graphics[tier], count(sv.graphicsQty, 'graphics', MAX_UNITS));
  }

  const lines = Array.isArray(body.customLines) ? body.customLines : [];
  if (lines.length > 10) throw new InputError('Too many custom lines.');
  const customLines = lines.map(l => {
    const title = cleanText(l && l.title, 200);
    const quantity = count(l && l.quantity, 'custom line quantity', 24);
    const each = Number(l && l.priceEach);
    if (!title || !quantity) throw new InputError('A custom line is missing its title or quantity.');
    if (!Number.isFinite(each) || each < 0 || each > 100000) throw new InputError(`Price for "${title}" is out of range.`);
    return { title, quantity, price_each_in_cents: Math.round(each * 100) };
  });

  const c = body.customer || {};
  const reference = [
    `Quote tool ref ${cleanText(body.quoteRef, 40) || 'n/a'}`,
    cleanText(body.issuer, 60) ? `issued by ${cleanText(body.issuer, 60)}` : '',
    cleanText(c.attention, 80) ? `FAO ${cleanText(c.attention, 80)}` : '',
    cleanText(c.vatNumber, 30) ? `VAT ${cleanText(c.vatNumber, 30)}` : '',
  ].filter(Boolean).join(' · ');

  const toolSubtotal = Number(body.toolSubtotal);
  return {
    customer: { name },
    order: { starts_at: londonToUtcIso(startDate, 9), stops_at: londonToUtcIso(endDate, 17), status: 'concept (draft)' },
    reference,
    bookings,
    customLines,
    toolSubtotal: Number.isFinite(toolSubtotal) ? round2(toolSubtotal) : null,
  };
}

// ── Booqable API ──────────────────────────────────────────

function makeClient(apiKey, slug) {
  const base = `https://${slug}.booqable.com/api/4`;
  return async function api(method, path, payload) {
    const res = await fetch(base + path, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* non-JSON error body */ }
    if (!res.ok) {
      const detail = data && data.errors ? data.errors.map(e => e.detail || e.title).join('; ') : text.slice(0, 300);
      throw new Error(`Booqable ${method} ${path.split('?')[0]} returned ${res.status}: ${detail}`);
    }
    return data || {};
  };
}

async function findOrCreateCustomer(api, customer) {
  const found = await api('GET', `/customers?filter[name]=${encodeURIComponent(customer.name)}&page[size]=10`);
  const want = customer.name.trim().toLowerCase();
  const match = (found.data || []).find(c => String(attr(c).name || '').trim().toLowerCase() === want && !attr(c).archived);
  if (match) return { customerId: match.id, customerName: attr(match).name, customerCreated: false };

  const created = await api('POST', '/customers', { data: { type: 'customers', attributes: { name: customer.name } } });
  return { customerId: created.data.id, customerName: customer.name, customerCreated: true };
}

const lineBody = (orderId, attributes) => ({ data: { type: 'lines', attributes: { owner_id: orderId, owner_type: 'orders', ...attributes } } });

// ── Helpers ───────────────────────────────────────────────

function attr(resource) {
  return (resource && (resource.attributes || resource)) || {};
}

function cleanText(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u001f]+/g, ' ').trim().slice(0, max);
}

function count(v, label, max) {
  if (v === undefined || v === null || v === '' || v === 0 || v === false) return 0;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0 || n > max) throw new InputError(`Invalid quantity for ${label}.`);
  return n;
}

function isoDate(v, label) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(new Date(v + 'T00:00:00Z'))) {
    throw new InputError(`Invalid ${label}.`);
  }
  return v;
}

// A UK wall-clock time on a date (e.g. 09:00) as a UTC ISO timestamp, BST-aware.
function londonToUtcIso(date, hour) {
  const guess = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`);
  const londonHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(guess));
  return new Date(guess.getTime() - (londonHour - hour) * 3600000).toISOString();
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

exports._test = { buildPlan, londonToUtcIso, PRODUCTS };
