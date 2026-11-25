// netlify/functions/lib/booqableOrders.js
//
// Lists confirmed (reserved) Booqable bookings starting soon, so the daily job
// can spot bookings that never had a Trader Briefing link created. Uses the
// same BOOQABLE_API_KEY and API v1 as lookup.js.
const BOOQABLE_BASE = "https://acme-hire.booqable.com/api/1";
const PER_PAGE = 100;
const MAX_PAGES = 10;

async function booqableGet(path) {
  const res = await fetch(`${BOOQABLE_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${process.env.BOOQABLE_API_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Booqable ${path} failed: ${res.status}`);
  return res.json();
}

function isoDay(value) {
  return value ? String(value).slice(0, 10) : null;
}

// Reserved bookings whose start date falls within the next `days` days
// (including today). Returns [{ id, number, customerName, startsOn }].
async function upcomingReservedOrders(days, today = new Date()) {
  if (!process.env.BOOQABLE_API_KEY) return [];
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  const from = isoDay(start.toISOString());
  const to = isoDay(end.toISOString());

  const found = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await booqableGet(`/orders?filter[status]=reserved&per=${PER_PAGE}&page=${page}`);
    const orders = data.orders || [];
    for (const o of orders) {
      const startsOn = isoDay(o.starts_at);
      if (o.status !== "reserved" || !startsOn || startsOn < from || startsOn > to) continue;
      found.push({
        id: o.id,
        number: o.number != null ? String(o.number) : null,
        customerName: (o.customer && o.customer.name) || o.customer_name || null,
        startsOn,
      });
    }
    if (orders.length < PER_PAGE) break;
  }
  return found;
}

module.exports = { upcomingReservedOrders };
