// netlify/functions/extract.js
// Sends a PDF to Claude Haiku and extracts structured fields for the briefing link generator.
// Requires environment variable: ANTHROPIC_API_KEY

const https = require("https");
const { requireStaff } = require("./lib/requireStaff");

function anthropicPost(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com",
      path:     "/v1/messages",
      method:   "POST",
      headers: {
        "x-api-key":         process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
        "content-length":    Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { reject(new Error("Invalid JSON from Anthropic")); }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

const HIRE_AGREEMENT_PROMPT = `You are extracting data from an Acme Hire Hire Agreement.

Extract the following fields and return ONLY a valid JSON object — no preamble, no markdown, no explanation.

Fields to extract:
- company: the customer/hirer company name
- contactName: primary contact full name
- contactPhone: primary contact phone number
- email: primary contact email address
- hireRef: the hire reference or document reference number
- siteAddress: the full delivery or site address
- damageDeposit: the damage deposit amount (include £ symbol)
- dates: the hire period dates as a human-readable string
- event: the event name or venue name if mentioned
- tradingPartnerName: trading partner or sub-operator name if present
- tradingPartnerCompany: trading partner company name if present
- agreedHireRate: the agreed hire rate if stated

Return null for any field not found. Example:
{
  "company": "Acme Foods Ltd",
  "contactName": "Jane Smith",
  "contactPhone": "07700 900000",
  "email": "jane@acme.co.uk",
  "hireRef": "AH-2026-0042",
  "siteAddress": "Lakeside Showground, Exampletown, EX1 1AA",
  "damageDeposit": "£1,000",
  "dates": "24 to 26 April 2026",
  "event": "Lakeside Festival",
  "tradingPartnerName": null,
  "tradingPartnerCompany": null,
  "agreedHireRate": "£1,200 per week"
}`;

const INVOICE_PROMPT = `You are extracting data from an Acme Hire invoice.

Extract the following fields and return ONLY a valid JSON object — no preamble, no markdown, no explanation.

Fields to extract:
- company: the customer company name on the invoice
- contactName: contact name if shown
- contactPhone: contact phone if shown
- email: contact email if shown
- hireRef: invoice number or hire reference
- siteAddress: delivery address if shown
- dates: hire or service period dates
- event: event name or venue if mentioned
- unitTypes: array of unit types mentioned e.g. ["Street Food", "Bar"]
- unitCount: number of units as an integer

Return null for any field not found. Return only the JSON object.`;

exports.handler = async function(event) {
  const headers = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  // Ops-only — verify the caller is signed-in staff (see lib/requireStaff.js).
  const staff = await requireStaff(event);
  if (!staff.ok) return staff.response;

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "ANTHROPIC_API_KEY not configured" }) };
  }

  let docType, pdfBase64;
  try {
    const body = JSON.parse(event.body);
    docType    = body.docType;  // "hire_agreement" or "invoice"
    pdfBase64  = body.pdf;
  } catch(e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body" }) };
  }

  if (!pdfBase64) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "No PDF data provided" }) };
  }

  const prompt = docType === "invoice" ? INVOICE_PROMPT : HIRE_AGREEMENT_PROMPT;

  try {
    const response = await anthropicPost({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type:       "base64",
              media_type: "application/pdf",
              data:       pdfBase64
            }
          },
          {
            type: "text",
            text: prompt
          }
        ]
      }]
    });

    if (response.status !== 200) {
      console.error("Anthropic error:", response.body);
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Haiku extraction failed" }) };
    }

    const rawText = (response.body.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("");

    // Strip markdown fences if present
    const clean = rawText.replace(/```json|```/g, "").trim();

    let extracted;
    try {
      extracted = JSON.parse(clean);
    } catch(e) {
      console.error("JSON parse failed:", clean);
      return { statusCode: 200, headers, body: JSON.stringify({ error: "Could not parse extraction", raw: clean }) };
    }

    // Remove null values to keep payload clean
    Object.keys(extracted).forEach(k => {
      if (extracted[k] === null || extracted[k] === "") delete extracted[k];
    });

    return { statusCode: 200, headers, body: JSON.stringify(extracted) };

  } catch(e) {
    console.error("Extract error:", e);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
