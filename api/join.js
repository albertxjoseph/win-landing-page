/**
 * POST /api/join — writes an interest-list signup into Supabase.
 *
 * Runs on Vercel's Node runtime. The Supabase service-role key stays here on the
 * server and is never shipped to the browser.
 *
 * Required Vercel environment variables:
 *   SUPABASE_URL               https://<project-ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  service_role key (Project settings → API keys)
 */

const TABLE = 'interest_signups';

const FIELDS = [
  'Tech & Engineering', 'Design & Creative', 'Business & Operations',
  'Finance & Investing', 'Marketing & Media', 'Health & Science',
  'Law & Policy', 'Real Estate & Trades', 'Arts & Entertainment',
  'Education', 'Student', 'Other'
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Very small in-memory throttle. Serverless instances are short-lived, so this
 *  only blunts a burst from one warm instance — the real guard is the honeypot
 *  plus the unique index on email. */
const hits = new Map();
function throttled(key) {
  const now = Date.now();
  const win = 60_000;
  const rec = hits.get(key);
  if (!rec || now - rec.start > win) {
    hits.set(key, { start: now, n: 1 });
    return false;
  }
  rec.n += 1;
  return rec.n > 8;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[join] Supabase env vars missing');
    return res.status(503).json({ error: 'The form is not connected yet.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'We could not read that submission.' });
  }

  // Honeypot: real people never see this field, so anything in it is a bot.
  // Answer 200 so the bot believes it worked and does not retry.
  if (str(body.company, 100)) {
    return res.status(200).json({ ok: true });
  }

  const ip =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown';
  if (throttled(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
  }

  // ── validate (mirrors the client, because the client can be bypassed) ──
  const role = body.role === 'mentor' ? 'mentor' : body.role === 'builder' ? 'builder' : '';
  const fullName = str(body.fullName, 80);
  const email = str(body.email, 120).toLowerCase();
  const phone = str(body.phone, 24);
  const city = str(body.city, 60);
  const field = FIELDS.includes(body.field) ? body.field : '';
  const focus = str(body.focus, 300);
  const link = str(body.link, 200);
  const notes = str(body.notes, 400);
  const referral = str(body.referral, 60);
  const goals = Array.isArray(body.goals)
    ? body.goals.filter(g => typeof g === 'string').slice(0, 12).map(g => g.slice(0, 60))
    : [];

  const bad = [];
  if (!role) bad.push('role');
  if (fullName.length < 2) bad.push('name');
  if (!EMAIL_RE.test(email)) bad.push('email');
  if (phone.replace(/\D/g, '').length < 7) bad.push('phone');
  if (!city) bad.push('city');
  if (!field) bad.push('field');
  if (focus.length < 12) bad.push('what you are working on');
  if (!goals.length) bad.push('goals');
  if (body.consent !== true) bad.push('consent');

  if (bad.length) {
    return res.status(400).json({ error: `Please check: ${bad.join(', ')}.` });
  }

  const row = {
    role,
    full_name: fullName,
    email,
    phone,
    city,
    field,
    focus,
    link: link || null,
    goals,
    referral: referral || null,
    notes: notes || null,
    consent: true,
    source: str(req.headers.referer, 200) || null,
    user_agent: str(req.headers['user-agent'], 300) || null
  };

  try {
    // on_conflict + merge-duplicates: a repeat email updates the existing row
    // instead of erroring, so someone can fix a typo by resubmitting.
    const r = await fetch(
      `${url}/rest/v1/${TABLE}?on_conflict=email`,
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=representation'
        },
        body: JSON.stringify(row)
      }
    );

    const text = await r.text();

    if (!r.ok) {
      console.error('[join] supabase %s: %s', r.status, text);
      if (r.status === 401 || r.status === 403) {
        return res.status(503).json({ error: 'The form is not connected yet.' });
      }
      return res.status(500).json({ error: 'We could not save that. Please try again.' });
    }

    let saved = [];
    try { saved = JSON.parse(text); } catch { /* representation not returned */ }
    const record = Array.isArray(saved) ? saved[0] : null;
    const duplicate = !!(record && record.created_at && record.updated_at &&
                         record.updated_at !== record.created_at);

    return res.status(200).json({ ok: true, duplicate });
  } catch (err) {
    console.error('[join] request failed', err);
    return res.status(500).json({ error: 'We could not save that. Please try again.' });
  }
};
