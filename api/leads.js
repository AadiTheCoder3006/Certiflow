// POST /api/leads - the "Unlock" form: saves the lead, returns an access token
const db = require('../lib/db');
const { clean, isEmail, newToken, body, send, MAX_BATCH } = require('../lib/common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  const b = body(req);
  const lead = {
    name: clean(b.name, 100), email: clean(b.email, 150).toLowerCase(),
    institute: clean(b.institute, 150), designation: clean(b.designation, 100), phone: clean(b.phone, 30)
  };
  if (!lead.name) return send(res, 400, { error: 'Please enter your full name.' });
  if (!isEmail(lead.email)) return send(res, 400, { error: 'Please enter a valid email address.' });
  if (!lead.institute) return send(res, 400, { error: 'Please enter your institute / organisation.' });

  const existing = await db.get('lead:' + lead.email);
  const saved = { ...lead, token: existing ? existing.token : newToken(), createdAt: existing ? existing.createdAt : new Date().toISOString() };
  await db.setMany({ ['lead:' + lead.email]: saved, ['token:' + saved.token]: saved });
  if (!existing) await db.incr('stat:leads');
  send(res, 200, { token: saved.token, name: saved.name, limit: MAX_BATCH });
};
