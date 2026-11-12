// netlify/functions/lookup.js
// Looks up a Booqable order by number and returns pre-fill data for the declaration form.
// Requires environment variable: BOOQABLE_API_KEY
// Usage: /.netlify/functions/lookup?ref=ORDER_NUMBER

const https = require("https");

const BOOQABLE_SLUG = "acme-hire";

function booqableGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: `${BOOQABLE_SLUG}.booqable.com`,
      path: `/api/1${path}`,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${process.env.BOOQABLE_API_KEY}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", chunk => body += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch(e) { reject(new Error("Invalid JSON from Booqable")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

// Map Booqable product names to Acme Hire unit types
function mapUnitType(productName) {
  const name = (productName || "").toLowerCase();
  if (name.includes("bar"))                          return "Bar";
  if (name.includes("dark kitchen") || name.includes("dk")) return "Dark Kitchen";
  if (name.includes("street food") || name.includes("sf") || name.includes("kitchen")) return "Street Food";
  return null;
}

exports.handler = async function(event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const ref = (event.queryStringParameters || {}).ref;
  if (!ref) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No booking reference provided" }) };
  }

  if (!process.env.BOOQABLE_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Booqable API key not configured" }) };
  }

  try {
    // Search orders by number
    const search = await booqableGet(`/orders?filter[number]=${encodeURIComponent(ref)}&include=customer,lines`);

    if (search.status !== 200) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Could not reach Booqable" }) };
    }

    const orders = search.data.orders || [];
    if (!orders.length) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: `No booking found for reference: ${ref}` }) };
    }

    const order    = orders[0];
    const customer = search.data.customer || order.customer || {};
    const lines    = search.data.lines    || order.lines    || [];

    // Format dates
    function fmtDate(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    }

    const startDate = fmtDate(order.starts_at);
    const endDate   = fmtDate(order.stops_at);
    const dates     = startDate && endDate ? `${startDate} to ${endDate}` : startDate || "";

    // Extract unit types from line items
    const unitTypesRaw = lines
      .map(l => mapUnitType(l.product_name || l.title || ""))
      .filter(Boolean);
    const unitTypes = [...new Set(unitTypesRaw)]; // deduplicate
    const unitCount = lines.filter(l => mapUnitType(l.product_name || l.title || "")).length || 1;

    // Build response — only what the form needs
    const result = {
      orderNumber:  order.number    || ref,
      company:      customer.name   || "",
      brand:        customer.name   || "",
      email:        customer.email  || "",
      contactName:  customer.name   || "",
      contactPhone: customer.phone  || "",
      event:        order.tag_list  ? order.tag_list.join(", ") : "",
      dates,
      unitTypes,
      unitCount
    };

    return { statusCode: 200, headers, body: JSON.stringify(result) };

  } catch(err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Lookup failed: " + err.message })
    };
  }
};
