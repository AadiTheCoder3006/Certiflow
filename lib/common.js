const crypto = require('crypto');
const db = require('./db');

exports.MAX_BATCH = 500;
exports.clean = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
exports.isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

// IDs look like CFL-7K3M-Q9XA-2WPD (no 0/O/1/I so they are easy to read aloud).
// 12 random characters = about 60 bits, so two batches will never collide in practice.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
exports.newCertId = () => {
  const b = crypto.randomBytes(12); let s = '';
  for (let i = 0; i < 12; i++) s += ALPHABET[b[i] % ALPHABET.length];
  return `CFL-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
};
exports.newToken = () => crypto.randomBytes(20).toString('hex');

/** Vercel parses JSON bodies for us; this also accepts a raw string just in case. */
exports.body = req => {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch (_) { return {}; }
};

exports.leadFromToken = async token =>
  token && typeof token === 'string' && /^[a-f0-9]{40}$/.test(token) ? db.get('token:' + token) : null;

exports.send = (res, status, obj) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
};
