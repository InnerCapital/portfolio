exports.handler = async function(event) {
  const pc = event.queryStringParameters && event.queryStringParameters.pc;
  if (!pc) return { statusCode: 400, body: JSON.stringify({ error: 'No postcode' }) };

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Fetch failed' }) };
  }
};
