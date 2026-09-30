// GET /api/verify/:id - public lookup used by the QR code page
const db = require('../../lib/db');
const { send } = require('../../lib/common');

module.exports = async (req, res) => {
  const raw = String(req.query.id || '');
  if (!/^[A-Za-z0-9-]{4,40}$/.test(raw)) return send(res, 200, { valid: false });
  const id = raw.toUpperCase();
  if (id.startsWith('SMP-')) return send(res, 200, { valid: false, sample: true });
  const c = await db.get('cert:' + id);
  if (!c) return send(res, 200, { valid: false });      // 200 so the page can show a friendly "not found"
  send(res, 200, { valid: true, certificate: { id: c.id, name: c.name, course: c.course, date: c.date, institute: c.institute, title: c.title, issuedAt: c.issuedAt } });
};
