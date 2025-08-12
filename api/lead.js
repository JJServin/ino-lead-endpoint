// /api/lead.js — Vercel Serverless Function for Zoho Tables
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const {
    ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
    ZOHO_TABLES_BASE_ID, ZOHO_TABLES_TABLE_ID, ZOHO_TABLES_VIEW_ID,
    ZOHO_DC = 'us',
    ZOHO_FIELD_FIRST_NAME, ZOHO_FIELD_LAST_NAME, ZOHO_FIELD_PHONE,
    ZOHO_FIELD_EMAIL, ZOHO_FIELD_ZIP, ZOHO_FIELD_SERVICE,
    ZOHO_FIELD_DETAILS, ZOHO_FIELD_PAGE, ZOHO_FIELD_ROUTE, ZOHO_FIELD_TS,
  } = process.env;

  try {
    // 1) OAuth access token from refresh token
    const authURL = `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token` +
      `?refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}` +
      `&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}` +
      `&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}` +
      `&grant_type=refresh_token`;

    const tokRes = await fetch(authURL, { method: 'POST' });
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error(`Token error: ${tokRes.status} ${JSON.stringify(tok)}`);

    // 2) Map incoming fields -> Zoho Tables field IDs
    const b = req.body || {};
    const map = {
      [ZOHO_FIELD_FIRST_NAME]: b.firstName || '',
      [ZOHO_FIELD_LAST_NAME]:  b.lastName  || '',
      [ZOHO_FIELD_PHONE]:      b.phone     || '',
      [ZOHO_FIELD_EMAIL]:      b.email     || '',
      [ZOHO_FIELD_ZIP]:        b.zip       || '',
      [ZOHO_FIELD_SERVICE]:    b.service   || '',
      [ZOHO_FIELD_DETAILS]:    b.details   || '',
      [ZOHO_FIELD_PAGE]:       b.page      || '',
      [ZOHO_FIELD_ROUTE]:      b.route     || '',
      [ZOHO_FIELD_TS]:         b.ts || new Date().toISOString(),
    };
    const field_ids_with_values = Object.fromEntries(Object.entries(map).filter(([k]) => !!k));

    // 3) Create record in Zoho Tables
    const body = new URLSearchParams({
      base_id: ZOHO_TABLES_BASE_ID,
      table_id: ZOHO_TABLES_TABLE_ID,
      ...(ZOHO_TABLES_VIEW_ID ? { view_id: ZOHO_TABLES_VIEW_ID } : {}),
      field_ids_with_values: JSON.stringify(field_ids_with_values),
    });

    const zRes = await fetch('https://tables.zoho.com/api/v1/records', {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}` },
      body,
    });

    const out = await zRes.json();
    if (!zRes.ok) throw new Error(`Zoho error: ${zRes.status} ${JSON.stringify(out)}`);

    res.status(200).json({ ok: true, out });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: String(err) });
  }
}
