// netlify/functions/attio-lookup.js
//
// Read-only. Called by generate.html's "Attio Deal" option. Finds the deal by
// Booqable order ID and returns the pre-fill data, including the deal's
// record ID which then travels into create-job-folder.js (stored on the
// Supabase booking row, never in the trader link).
//
// Usage: GET /.netlify/functions/attio-lookup?ref=ORDER_NUMBER
// Headers: Authorization: Bearer <Google ID token from the generate page>
const { getDealByBooqableRef } = require("./lib/attio");
const { requireOpsUser } = require("./lib/opsAuth");

exports.handler = async function (event) {
  const headers = { "Content-Type": "application/json" };

  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    await requireOpsUser(event);
  } catch (err) {
    return { statusCode: err.statusCode || 401, headers, body: JSON.stringify({ error: err.message }) };
  }

  const ref = (event.queryStringParameters || {}).ref;
  if (!ref) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No Booqable order number provided" }) };
  }

  try {
    const deal = await getDealByBooqableRef(ref);
    if (!deal) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: `No Attio deal has Booqable order ID ${ref}. Add it to the deal in Attio, then try again.` }),
      };
    }
    return { statusCode: 200, headers, body: JSON.stringify(deal) };
  } catch (err) {
    console.error("attio-lookup error:", err);
    return { statusCode: 502, headers, body: JSON.stringify({ error: "Attio lookup failed: " + err.message }) };
  }
};
