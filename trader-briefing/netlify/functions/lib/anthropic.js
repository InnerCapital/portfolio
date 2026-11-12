// netlify/functions/lib/anthropic.js
// Shared Anthropic API helper. Same raw-https pattern already used in
// extract.js, factored out so verify-insurance.js doesn't duplicate it.
const https = require("https");

function anthropicPost(body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const options = {
      hostname: "api.anthropic.com",
      path: "/v1/messages",
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error("Invalid JSON from Anthropic"));
        }
      });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

module.exports = { anthropicPost };
