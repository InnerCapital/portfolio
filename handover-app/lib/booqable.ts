const BOOQABLE_BASE = `https://${process.env.BOOQABLE_SUBDOMAIN}.booqable.com/api/4`;

const AUTH_HEADERS = {
  'Authorization': `Bearer ${process.env.BOOQABLE_API_KEY}`,
  'Content-Type': 'application/json',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getOrder(orderId: string) {
  const cleaned = orderId.replace(/^#/, '').trim();
  const include = 'customer';

  if (UUID_RE.test(cleaned)) {
    const res = await fetch(`${BOOQABLE_BASE}/orders/${cleaned}?include=${include}`, {
      headers: AUTH_HEADERS,
    });
    if (!res.ok) throw new Error(`Booqable error: ${res.status}`);
    return res.json();
  }

  // Numeric order number — resolve via filter
  const params = new URLSearchParams({ 'filter[number]': cleaned, include });
  const res = await fetch(`${BOOQABLE_BASE}/orders?${params}`, {
    headers: AUTH_HEADERS,
  });
  if (!res.ok) throw new Error(`Booqable error: ${res.status}`);
  const json = await res.json();
  // Never fall back to "first order returned": only accept an exact number match.
  const match = (json.data ?? []).find(
    (o: { attributes?: { number?: unknown } }) => String(o.attributes?.number) === cleaned,
  );
  if (!match) throw new Error(`Order #${cleaned} not found`);
  // Normalise to single-order shape
  return { data: match, included: json.included ?? [] };
}

export async function addOrderNote(orderId: string, body: string) {
  const res = await fetch(`${BOOQABLE_BASE}/notes`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.BOOQABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        type: 'notes',
        attributes: {
          body,
          notable_id: orderId,
          notable_type: 'Order',
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Booqable error: ${res.status}`);
  return res.json();
}

interface IncludedItem {
  id?: string;
  type?: string;
  attributes?: Record<string, unknown>;
  relationships?: Record<string, unknown>;
}

export function extractOrderDetails(orderData: Record<string, unknown>) {
  const order = (orderData as { data?: { attributes?: Record<string, unknown> } })?.data?.attributes ?? {};
  const included: IncludedItem[] = (orderData as { included?: IncludedItem[] })?.included ?? [];

  const customer = included.find((i) => i.type === 'customers')?.attributes ?? {};

  // Delivery address: order.delivery_address is a flat string in v4
  const properties = order.properties as Record<string, string> | null ?? {};
  const siteAddress =
    (order.delivery_address as string) ||
    properties['delivery_address'] ||
    properties['site_address'] ||
    (order.address as string) ||
    '';

  // Customer name: v4 uses a single `name` field, not first/last
  const customerName =
    (customer.name as string) ||
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    '';

  return {
    customer_name: customerName,
    company_name: (customer.company_name as string) || '',
    customer_email: (customer.email as string) || '',
    // Booqable keeps the phone in a custom customer field ("phone"); the on-site person,
    // when set, is in "delivery_contact" on the customer or the order.
    customer_phone: pickPhone(customer.phone, customProps(customer).phone),
    delivery_contact_phone: pickPhone(properties['delivery_contact'], customProps(customer).delivery_contact),
    rental_start: (order.starts_at as string)?.split('T')[0] || '',
    rental_end: (order.stops_at as string)?.split('T')[0] || '',
    site_address: siteAddress,
    // Units booked on the order (Booqable item_count), so the form can check the scan count.
    booked_unit_count: typeof order.item_count === 'number' ? order.item_count : null,
    units: [],
  };
}

// Custom field values on a v4 record: `properties` (object), with v1-style
// `properties_attributes` as a fallback.
function customProps(record: Record<string, unknown>): Record<string, string> {
  const p = (record.properties ?? record.properties_attributes) as unknown;
  if (p && typeof p === 'object' && !Array.isArray(p)) return p as Record<string, string>;
  return {};
}

// First value that contains something phone-like (a delivery contact may be "Name 07...").
function pickPhone(...values: unknown[]): string {
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const m = v.match(/(\+|00)?[\d][\d\s\-().]{7,}\d/);
    if (m) return m[0].trim();
  }
  return '';
}
