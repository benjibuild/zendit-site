/**
 * /api/topup.js  –  Serverless function for Vercel
 *
 * Expects a POST body (JSON) like:
 * {
 *   "phone": "+2348030000000",
 *   "amount": 10          // in the currency Zendit shows for that operator
 * }
 *
 * ENV VARS you must set in Vercel > Settings > Environment Variables:
 *   ZENDIT_ID       ← from Dashboard ▸ API Settings ▸ Client ID   (Test or Live)
 *   ZENDIT_SECRET   ← from Dashboard ▸ API Settings ▸ Client Secret
 */

export default async function handler(req, res) {
  // 1  Allow only POST
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // 2  Read JSON body
  let body;
  try {
    body = typeof req.body === 'object' ? req.body : JSON.parse(req.body);
  } catch (_) {
    return res.status(400).json({ error: 'Body must be JSON' });
  }
  const { phone, amount } = body;
  if (!phone || !amount) return res.status(400).json({ error: 'phone & amount required' });

  // 3  Get an OAuth token  (form-encoded – Zendit’s rule)
  const tokenResp = await fetch('https://auth.zendit.io/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.ZENDIT_ID,
      client_secret: process.env.ZENDIT_SECRET
    })
  });

  if (!tokenResp.ok) {
    return res.status(502).json({ error: 'Could not get Zendit token' });
  }
  const { access_token } = await tokenResp.json();

  // 4  Figure out the carrier from the phone #
  const opResp = await fetch(
    `https://api.zendit.io/v1/airtime/operators?phoneNumber=${encodeURIComponent(phone)}`,
    { headers: { Authorization: `Bearer ${access_token}` } }
  );
  const opJson = await opResp.json();
  const operator = opJson?.data?.[0];          // pick the first match

  if (!operator) {
    return res.status(400).json({ error: 'Could not detect carrier for this number' });
  }

  // 5  Send the actual top-up
  const topupResp = await fetch('https://api.zendit.io/v1/airtime/topups', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      operatorId: operator.operatorId ?? operator.id, // Zendit uses operatorId
      phoneNumber: phone,
      amount: Number(amount),
      customIdentifier: `web-${Date.now()}`
    })
  });

  const topupJson = await topupResp.json();
  return res
    .status(topupResp.ok ? 200 : 502)
    .json(topupJson);              // returns status, transactionId, etc.
}
