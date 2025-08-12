// /api/lead.js — Auto-map Zoho Tables fields by column name (with CORS)
export default async function handler(req, res) {
  // CORS (relax now; we can restrict to your domain later)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const {
    ZOHO_CLIENT_ID,
    ZOHO_CLIENT_SECRET,
    ZOHO_REFRESH_TOKEN,
    ZOHO_TABLES_BASE_ID,
    ZOHO_TABLES_TABLE_ID,
    ZOHO_TABLES_VIEW_ID,
    ZOHO_DC = "us",
    DEFAULT_LEAD_SOURCE = "Website",
  } = process.env;

  try {
    // 1) Access token from refresh token
    const authURL =
      `https://accounts.zoho.${ZOHO_DC}/oauth/v2/token` +
      `?refresh_token=${encodeURIComponent(ZOHO_REFRESH_TOKEN)}` +
      `&client_id=${encodeURIComponent(ZOHO_CLIENT_ID)}` +
      `&client_secret=${encodeURIComponent(ZOHO_CLIENT_SECRET)}` +
      `&grant_type=refresh_token`;
    const tokRes = await fetch(authURL, { method: "POST" });
    const tok = await tokRes.json();
    if (!tok.access_token) throw new Error(`Token error: ${tokRes.status} ${JSON.stringify(tok)}`);
    const authHeader = { Authorization: `Zoho-oauthtoken ${tok.access_token}` };

    // 2) Fetch field list for this table
    const fieldsURL =
      `https://tables.zoho.com/api/v1/fields?base_id=${encodeURIComponent(ZOHO_TABLES_BASE_ID)}` +
      `&table_id=${encodeURIComponent(ZOHO_TABLES_TABLE_ID)}` +
      (ZOHO_TABLES_VIEW_ID ? `&view_id=${encodeURIComponent(ZOHO_TABLES_VIEW_ID)}` : "");
    const fRes = await fetch(fieldsURL, { headers: authHeader });
    const fJson = await fRes.json();
    if (!fRes.ok) throw new Error(`Fields error: ${fRes.status} ${JSON.stringify(fJson)}`);

    const fields = Array.isArray(fJson.fields) ? fJson.fields : fJson; // be tolerant of shapes
    const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    // Build a map { normalizedColumnName -> fieldID }
    const idByNormName = {};
    for (const f of fields) {
      const namesToTry = [
        f.display_name,
        f.column_name,
        f.name,
        f.field_name,
        f.label,
      ].filter(Boolean);
      for (const n of namesToTry) idByNormName[norm(n)] = f.fieldID || f.field_id || f.id;
    }

    // Helper to find a field by any of several aliases
    const pick = (...aliases) => {
      for (const a of aliases) {
        const fid = idByNormName[norm(a)];
        if (fid) return fid;
      }
      // also try contains search
      for (const key of Object.keys(idByNormName)) {
        if (aliases.some((a) => key.includes(norm(a)))) return idByNormName[key];
      }
      return null;
    };

    // 3) Build payload from request body
    const b = (await parseJSON(req)) || {};
    const fullName = [b.firstName, b.lastName].filter(Boolean).join(" ").trim() || b.name || "";

    // Known columns in your screenshot
    const fidLeadName   = pick("Lead Name", "Name", "Full Name");
    const fidLeadPhone  = pick("Lead Number", "Phone", "Phone Number", "Mobile");
    const fidLeadEmail  = pick("Lead Email ID", "Email", "Email Address");
    const fidLeadSource = pick("Lead Source", "Source");

    // Optional columns if you add them later
    const fidZip     = pick("ZIP", "Zip Code", "Postal Code");
    const fidService = pick("Service", "Requested Service");
    const fidDetails = pick("Details", "Notes", "Message");
    const fidPage    = pick("Page", "Page URL", "URL");
    const fidRoute   = pick("Route", "

