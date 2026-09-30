/**
 * db.js - tiny key-value store used by the API functions.
 *  - On Vercel, connect a free Upstash Redis database (Storage tab) and its REST env vars are
 *    picked up automatically -> data is saved permanently.
 *  - Without those env vars it falls back to memory: fine for a quick demo, but the data is lost
 *    when the serverless function restarts.
 */
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const mem = globalThis.__cfmem || (globalThis.__cfmem = new Map());

async function call(path, body) {
  const r = await fetch(URL_ + path, { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Database error');
  return j;
}

exports.persistent = !!URL_;

exports.get = async key => {
  if (!URL_) return mem.has(key) ? mem.get(key) : null;
  const { result } = await call('', ['GET', key]);
  return result == null ? null : JSON.parse(result);
};

/** entries: { key: value, ... } saved in one round trip */
exports.setMany = async entries => {
  if (!URL_) { for (const k in entries) mem.set(k, entries[k]); return; }
  await call('/pipeline', Object.entries(entries).map(([k, v]) => ['SET', k, JSON.stringify(v)]));
};

exports.incr = async (key, by = 1) => {
  if (!URL_) { const n = (mem.get(key) || 0) + by; mem.set(key, n); return n; }
  const { result } = await call('', ['INCRBY', key, by]);
  return result;
};
