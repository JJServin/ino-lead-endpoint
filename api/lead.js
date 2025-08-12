// /api/lead.js — Zoho Tables auto-map (CommonJS, CORS, robust parsing)
module.exports = async (req, res) => {
  try {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method not allowed' });

    // Env
    const {
      ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN,
      ZOHO_TABLES_BASE_ID, ZOHO_TABLES_TABLE_ID, ZOHO_TABLES_VIEW_ID,
      ZOHO_DC = 'us', DEFAULT_LEAD_SOURCE = 'Website',
    } = process.env;

    // Parse JSON body safely
    const bodyText = await new Promise((resolve, reject) => {
      try {
        if (typeof req.body === 'string') return resolve(req.body);
        if (req.body && typeof req.body === 'object') return resolve(JSON.stringify(req.body));
        let data = ''; req.on('data', c => data += c); req.on('end', () => resolve(data)); req.on('error', reject);
      } catch (e) { reject(e); }
    });
    let b = {}; try { b = bodyText ? JSON.parse(bodyText) : {}; } catch { b = {}; }

    // OAuth: refresh -> access token
    const tokenURL = `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token` +
      `?refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}` +
      `&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}` +
      `&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}` +
      `&grant_type=refresh_token`;
    const tokRes = await fetch(tokenURL, { method:'POST' });
    const tok = await tokRes.json();
    if (!tok.access_token) {
      return res.status(401).json({ ok:false, step:'token', detail: tok });
    }
    const authHeader = { Authorization: `Zoho-oauthtoken ${tok.access_token}` };

    // Fetch fields (for auto-map)
    const fieldsURL = `https://tables.zoho.com/api/v1/fields?base_id=${encodeURIComponent(ZOHO_TABLES_BASE_ID)}&table_id=${encodeURIComponent(ZOHO_TABLES_TABLE_ID)}${ZOHO_TABLES_VIEW_ID ? `&view_id=${encodeURIComponent(ZOHO_TABLES_VIEW_ID)}` : ''}`;
    const fRes = await fetch(fieldsURL, { headers: authHeader });
    const fJson = await fRes.json();
    if (!fRes.ok) {
      return res.status(400).json({ ok:false, step:'fields', status:fRes.status, detail:fJson });
    }
    const fields = Array.isArray(fJson.fields) ? fJson.fields : (Array.isArray(fJson) ? fJson : []);
    const norm = s => String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const idByNorm = {};
    for (const f of fields) {
      const choices = [f.display_name, f.column_name, f.name, f.field_name, f.label].filter(Boolean);
      for (const n of choices) idByNorm[norm(n)] = f.fieldID || f.field_id || f.id;
    }
    const pick = (...aliases) => {
      for (const a of aliases) { const id = idByNorm[norm(a)]; if (id) return id; }
      for (const key of Object.keys(idByNorm)) { if (aliases.some(a => key.includes(norm(a)))) return idByNorm[key]; }
      return null;
    };

    // Map fields
    const fullName = [b.firstName, b.lastName].filter(Boolean).join(' ').trim() || b.name || '';
    const fidLeadName   = pick('Lead Name','Name','Full Name');
    const fidLeadPhone  = pick('Lead Number','Phone','Phone Number','Mobile');
    const fidLeadEmail  = pick('Lead Email ID','Email','Email Address');
    const fidLeadSource = pick('Lead Source','Source');
    const fidZip        = pick('ZIP','Zip Code','Postal Code');
    const fidService    = pick('Service','Requested Service');
    const fidDetails    = pick('Details','Notes','Message');
    const fidPage       = pick('Page','Page URL','URL');
    const fidRoute      = pick('Route','Hash','Path');
    const fidTs         = pick('Created Date','Created','Timestamp');

    const field_ids_with_values = {};
    if (fidLeadName)   field_ids_with_values[fidLeadName]   = fullName;
    if (fidLeadPhone)  field_ids_with_values[fidLeadPhone]  = b.phone || '';
    if (fidLeadEmail)  field_ids_with_values[fidLeadEmail]  = b.email || '';
    if (fidLeadSource) field_ids_with_values[fidLeadSource] = DEFAULT_LEAD_SOURCE;
    if (fidZip)        field_ids_with_values[fidZip]        = b.zip || '';
    if (fidService)    field_ids_with_values[fidService]    = b.service || '';
    if (fidDetails)    field_ids_with_values[fidDetails]    = b.details || '';
    if (fidPage)       field_ids_with_values[fidPage]       = b.page || '';
    if (fidRoute)      field_ids_with_values[fidRoute]      = b.route || '';
    if (fidTs)         field_ids_with_values[fidTs]         = b.ts || new Date().toISOString();

    if (!Object.keys(field_ids_with_values).length || (!fullName && !b.phone)) {
      return res.status(400).json({ ok:false, error:'Missing minimum fields (name or phone).' });
    }

    // Create record
    const createURL = 'https://tables.zoho.com/api/v1/records';
    const body = new URLSearchParams({
      base_id: ZOHO_TABLES_BASE_ID,
      table_id: ZOHO_TABLES_TABLE_ID,
      ...(ZOHO_TABLES_VIEW_ID ? { view_id: ZOHO_TABLES_VIEW_ID } : {}),
      field_ids_with_values: JSON.stringify(field_ids_with_values),
    });
    const zRes = await fetch(createURL, { method:'POST', headers: authHeader, body });
    const out = await zRes.json();
    if (!zRes.ok) return res.status(400).json({ ok:false, step:'create', status:zRes.status, detail: out });

    return res.status(200).json({ ok:true, out });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ ok:false, error:String(err) });
  }
};
