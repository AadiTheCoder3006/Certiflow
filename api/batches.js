// POST /api/batches - (token required) issues unique IDs for up to 500 certificates and stores them
const db = require('../lib/db');
const { clean, newCertId, leadFromToken, body, send, MAX_BATCH } = require('../lib/common');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  const b = body(req);
  const lead = await leadFromToken(b.token);
  if (!lead) return send(res, 401, { error: 'Please unlock the full batch first.' });
  if (!Array.isArray(b.certificates) || b.certificates.length === 0) return send(res, 400, { error: 'No certificates in the request.' });
  if (b.certificates.length > MAX_BATCH) return send(res, 400, { error: `A single run is limited to ${MAX_BATCH} certificates.` });

  const batchId = 'B' + Date.now().toString(36).toUpperCase();
  const issuedAt = new Date().toISOString();
  const entries = {}, out = [];
  for (const c of b.certificates) {
    const rec = {
      id: newCertId(), batchId, issuedAt, issuedBy: lead.email,
      name: clean(c.name, 120), course: clean(c.course, 150), date: clean(c.date, 40),
      institute: clean(b.institute, 150), title: clean(b.title, 120)
    };
    if (!rec.name) continue;
    entries['cert:' + rec.id] = rec;
    out.push({ id: rec.id });
  }
  await db.setMany(entries);           // one round trip for the whole batch
  await db.incr('stat:batches'); await db.incr('stat:certs', out.length);
  send(res, 200, { batchId, certificates: out });
};
