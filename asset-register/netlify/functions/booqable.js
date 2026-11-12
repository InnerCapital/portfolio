// Acme Hire Asset Portal — Booqable API Proxy
// Netlify Function: /api/booqable
//
// Environment variables required:
//   BOOQABLE_API_KEY  — API key from Booqable account settings
//   BOOQABLE_SUBDOMAIN — e.g. acme-hire (without .booqable.com)
//
// Endpoints served:
//   GET /api/booqable?action=fleet   — all units with active order data mapped by SKU
//   GET /api/booqable?action=orders  — all active/upcoming orders raw

const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
};

async function booqableGet(subdomain, apiKey, path) {
    const url = `https://${subdomain}.booqable.com/api/1${path}`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type':  'application/json',
        },
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Booqable API error (${res.status}) on ${path}: ${text}`);
    }
    return res.json();
}

// Map Booqable order status to portal display status
function mapStatus(order) {
    if (!order) return null;
    const s = order.status;
    if (s === 'started')   return 'On Hire';
    if (s === 'reserved')  return 'Reserved';
    if (s === 'concept')   return 'Quote';
    if (s === 'stopped')   return 'Returned';
    if (s === 'cancelled') return 'Cancelled';
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : null;
}

exports.handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    const apiKey    = process.env.BOOQABLE_API_KEY;
    const subdomain = process.env.BOOQABLE_SUBDOMAIN || 'acme-hire';

    if (!apiKey) {
        console.error('Missing BOOQABLE_API_KEY env var');
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Booqable not configured' }) };
    }

    const action = (event.queryStringParameters || {}).action || 'fleet';

    try {
        // ── SHARED: fetch order list then each order fully to get stock item data ─
        // The list endpoint strips nested plannings — must fetch each order individually
        async function getOrdersWithAssets(statusFilter) {
            const qs = statusFilter
                ? statusFilter.map(s => `status[]=${s}`).join('&')
                : '';

            // Step 1: get order list with customer
            const listData = await booqableGet(subdomain, apiKey,
                `/orders?${qs}&per_page=200&include=customer`);
            const orders = listData.orders || [];
            if (!orders.length) return [];

            // Step 2: fetch each order fully to get nested plannings data
            const fullOrders = await Promise.all(
                orders.map(order =>
                    booqableGet(subdomain, apiKey,
                        `/orders/${order.id}?include=plannings,stock_item_plannings,stock_items`
                    ).then(d => ({ ...order, plannings: (d.order && d.order.plannings) || [] }))
                     .catch(() => ({ ...order, plannings: [] }))
                )
            );

            return fullOrders.map(order => {
                const customerName = order.customer
                    ? (order.customer.name || order.customer.full_name || null)
                    : null;

                const assetIds = [];
                for (const planning of (order.plannings || [])) {
                    for (const sip of (planning.stock_item_plannings || [])) {
                        const id = sip.stock_item && sip.stock_item.identifier;
                        if (id) assetIds.push(id.trim().toUpperCase());
                    }
                }

                return { order, customerName, assetIds: [...new Set(assetIds)] };
            });
        }

        // ── FLEET VIEW ────────────────────────────────────────────────────────
        if (action === 'fleet') {
            const ordersWithAssets = await getOrdersWithAssets(['started', 'reserved']);
            const fleet = {};

            for (const { order, customerName, assetIds } of ordersWithAssets) {
                const orderInfo = {
                    status:      mapStatus(order),
                    rawStatus:   order.status,
                    client:      customerName,
                    orderNumber: order.number,
                    orderId:     order.id,
                    startsAt:    order.starts_at,
                    stopsAt:     order.stops_at,
                    grandTotal:  order.grand_total_with_tax_as_decimal,
                };

                for (const assetId of assetIds) {
                    if (!fleet[assetId] || order.status === 'started') {
                        fleet[assetId] = { ...orderInfo };
                    }
                }

                // If still no asset IDs matched, store under order number as fallback
                if (!assetIds.length) {
                    console.log(`[Booqable] Order #${order.number} has no asset ID tags`);
                }
            }

            const onHire     = Object.values(fleet).filter(f => f.rawStatus === 'started').length;
            const reserved   = Object.values(fleet).filter(f => f.rawStatus === 'reserved').length;
            const totalOrders = ordersWithAssets.length;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    fleet,
                    stats: { onHire, reserved, totalOrders },
                    fetchedAt: new Date().toISOString(),
                }),
            };
        }

        // ── CALENDAR ─────────────────────────────────────────────────────────
        if (action === 'calendar') {
            const ordersWithAssets = await getOrdersWithAssets(null); // all statuses
            const events = [];

            for (const { order, customerName, assetIds } of ordersWithAssets) {
                if (!order.starts_at || !order.stops_at) continue;

                for (const assetId of assetIds) {
                    events.push({
                        id:          order.id,
                        orderNumber: order.number,
                        assetId,
                        client:      customerName,
                        status:      mapStatus(order),
                        rawStatus:   order.status,
                        startsAt:    order.starts_at,
                        stopsAt:     order.stops_at,
                        grandTotal:  order.grand_total_with_tax_as_decimal,
                        location:    order.properties_attributes
                                     ? (order.properties_attributes.delivery_address || null)
                                     : null,
                    });
                }

                // If no asset IDs, still show as unassigned event
                if (!assetIds.length) {
                    events.push({
                        id:          order.id,
                        orderNumber: order.number,
                        assetId:     'UNASSIGNED',
                        client:      customerName,
                        status:      mapStatus(order),
                        rawStatus:   order.status,
                        startsAt:    order.starts_at,
                        stopsAt:     order.stops_at,
                        grandTotal:  order.grand_total_with_tax_as_decimal,
                    });
                }
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    events,
                    fetchedAt: new Date().toISOString(),
                }),
            };
        }

        // ── RAW ORDERS ────────────────────────────────────────────────────────
        if (action === 'orders') {
            const data = await booqableGet(subdomain, apiKey, '/orders?per_page=100');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({ ok: true, orders: data.orders || [] }),
            };
        }

        // ── DEBUG ─────────────────────────────────────────────────────────────
        if (action === 'debug') {
            const orderId = '8e83597a-b3b5-41a8-8f04-18782027b0e0';
            const stockItemIds = [
                'd53efaca-2f7c-4cfe-bb00-cf4e1e2f854a',
                'c331b28e-8a85-4e34-aedd-4c3b7a4f6da2',
                'f26edaa0-dbcd-4f3f-88b1-5cfa87833a32',
                '0c06bc10-ad54-4e0d-b817-eaa2420cda5b'
            ];

            // Test 1: fetch stock_items with filter[id][]
            const qs1 = stockItemIds.map(id => `filter[id][]=${id}`).join('&');
            const t1 = await booqableGet(subdomain, apiKey,
                `/stock_items?${qs1}&per_page=20`
            ).catch(e => ({ error: e.message }));

            // Test 2: fetch single stock item by ID
            const t2 = await booqableGet(subdomain, apiKey,
                `/stock_items/${stockItemIds[0]}`
            ).catch(e => ({ error: e.message }));

            // Test 3: list all stock items
            const t3 = await booqableGet(subdomain, apiKey,
                `/stock_items?per_page=10`
            ).catch(e => ({ error: e.message }));

            // Test 4: fetch order with include=stock_items
            const t4 = await booqableGet(subdomain, apiKey,
                `/orders/${orderId}?include=stock_items`
            ).catch(e => ({ error: e.message }));

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    filter_by_ids: t1,
                    single_stock_item: t2,
                    all_stock_items: t3,
                    order_with_stock_items: t4 && t4.order && t4.order.stock_items
                        ? t4.order.stock_items.map(s => ({ id: s.id, identifier: s.identifier }))
                        : { raw: t4 },
                }),
            };
        }

        // ── CALENDAR — all orders with dates mapped by asset ID tag ───────────
        if (action === 'calendar') {
            const ASSET_ID_RE = /AH[A-Z]{2}[A-Z]\d{6}/gi;

            // Fetch all orders across all statuses for calendar view
            const data = await booqableGet(subdomain, apiKey,
                '/orders?per_page=200&include=tags,customer');

            const orders = data.orders || [];
            const events = [];

            for (const order of orders) {
                if (!order.starts_at || !order.stops_at) continue;

                const customerName = order.customer
                    ? (order.customer.name || order.customer.full_name || null)
                    : null;

                // Find asset IDs from tags
                const tags = order.tags || order.tag_list || [];
                const tagArray = Array.isArray(tags) ? tags
                    : (typeof tags === 'string' ? tags.split(',').map(t => t.trim()) : []);

                const assetIds = tagArray
                    .map(t => t.trim().toUpperCase())
                    .filter(t => /^AH[A-Z]{2}[A-Z]\d{6}$/.test(t));

                // Fallback: scan text fields
                if (!assetIds.length) {
                    const text = [order.note, order.description, order.title].join(' ');
                    const found = text.match(ASSET_ID_RE) || [];
                    assetIds.push(...found.map(f => f.toUpperCase()));
                }

                // Create one event per asset ID on this order
                for (const assetId of assetIds) {
                    events.push({
                        id:          order.id,
                        orderNumber: order.number,
                        assetId,
                        client:      customerName,
                        status:      mapStatus(order),
                        rawStatus:   order.status,
                        startsAt:    order.starts_at,
                        stopsAt:     order.stops_at,
                        grandTotal:  order.grand_total_with_tax_as_decimal,
                        location:    order.properties && order.properties.delivery_address
                                     ? order.properties.delivery_address : null,
                    });
                }
            }

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ok: true,
                    events,
                    fetchedAt: new Date().toISOString(),
                }),
            };
        }

        // ── SINGLE ORDER ──────────────────────────────────────────────────────
        if (action === 'order') {
            const id = (event.queryStringParameters || {}).id;
            if (!id) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing order id' }) };
            const data = await booqableGet(subdomain, apiKey, `/orders/${id}`);
            return { statusCode: 200, headers, body: JSON.stringify({ ok: true, order: data.order }) };
        }

        return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown action: ${action}` }) };

    } catch (err) {
        console.error('Booqable function error:', err.message);
        return {
            statusCode: 502,
            headers,
            body: JSON.stringify({ error: 'Booqable API unavailable', detail: err.message }),
        };
    }
};
