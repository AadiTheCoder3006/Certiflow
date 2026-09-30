/**
 * Certiflow - backend
 * --------------------------------------------------------------
 * A deliberately small server: Node's built-in `http` module only,
 * no npm packages, no database. Data lives in one JSON file.
 *
 * What it does
 *   1. Serves the front-end files in /public
 *   2. POST /api/leads        -> "Unlock" form: saves the lead, returns an access token
 *   3. GET  /api/session      -> checks a saved token is still valid
 *   4. POST /api/batches      -> issues unique certificate IDs for a batch (max 500) and
 *                                stores them in the register
 *   5. GET  /api/verify/:id   -> looks an ID up (used by the QR code on every certificate)
 *   6. GET  /verify/:id       -> the human-friendly verification page
 *   7. GET  /api/stats        -> tiny counters (handy for a live demo)
 *
 * Run:  node server.js     (then open http://localhost:3000)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_BATCH = 500;            // free tier limit per run
const MAX_BODY = 1024 * 1024;     // 1 MB request body cap

/* ---------------------------- tiny JSON "database" ---------------------------- */
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
let db = { leads: [], certificates: {}, batches: 0 };
try {
  db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
} catch (_) { /* first run: start empty */ }

function saveDb() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // atomic swap so the file is never half-written
}

/* --------------------------------- helpers ----------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Request too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (_) { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

const clean = (v, max = 200) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const isEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);

// IDs look like CFL-7K3M-Q9XA-2WPD (no 0/O/1/I so they are easy to read aloud)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCertId() {
  for (;;) {
    const b = crypto.randomBytes(12);
    let s = '';
    for (let i = 0; i < 12; i++) s += ALPHABET[b[i] % ALPHABET.length];
    const id = `CFL-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
    if (!db.certificates[id]) return id;
  }
}

function leadFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  return db.leads.find(l => l.token === token) || null;
}

/* ------------------------------- API handlers -------------------------------- */
async function handleApi(req, res, url) {
  const { pathname } = url;

  // Unlock form -> save the lead and hand back a token
  if (req.method === 'POST' && pathname === '/api/leads') {
    const b = await readJson(req);
    const lead = {
      name: clean(b.name, 100), email: clean(b.email, 150).toLowerCase(),
      institute: clean(b.institute, 150), designation: clean(b.designation, 100), phone: clean(b.phone, 30)
    };
    if (!lead.name) return sendJson(res, 400, { error: 'Please enter your full name.' });
    if (!isEmail(lead.email)) return sendJson(res, 400, { error: 'Please enter a valid email address.' });
    if (!lead.institute) return sendJson(res, 400, { error: 'Please enter your institute / organisation.' });

    let existing = db.leads.find(l => l.email === lead.email);
    if (existing) {
      Object.assign(existing, lead);         // same person coming back: refresh details, keep token
    } else {
      existing = Object.assign({ token: crypto.randomBytes(20).toString('hex'), createdAt: new Date().toISOString() }, lead);
      db.leads.push(existing);
    }
    saveDb();
    return sendJson(res, 200, { token: existing.token, name: existing.name, limit: MAX_BATCH });
  }

  // Is my saved token still valid?
  if (req.method === 'GET' && pathname === '/api/session') {
    const lead = leadFromToken(url.searchParams.get('token'));
    return sendJson(res, 200, lead ? { valid: true, name: lead.name, limit: MAX_BATCH } : { valid: false });
  }

  // Issue IDs for a batch of certificates and record them in the register
  if (req.method === 'POST' && pathname === '/api/batches') {
    const b = await readJson(req);
    const lead = leadFromToken(b.token);
    if (!lead) return sendJson(res, 401, { error: 'Please unlock the full batch first.' });
    if (!Array.isArray(b.certificates) || b.certificates.length === 0)
      return sendJson(res, 400, { error: 'No certificates in the request.' });
    if (b.certificates.length > MAX_BATCH)
      return sendJson(res, 400, { error: `A single run is limited to ${MAX_BATCH} certificates.` });

    const batchId = 'B' + Date.now().toString(36).toUpperCase();
    const issuedAt = new Date().toISOString();
    const out = [];
    for (const c of b.certificates) {
      const rec = {
        id: newCertId(), batchId, issuedAt, issuedBy: lead.email,
        name: clean(c.name, 120), course: clean(c.course, 150), date: clean(c.date, 40),
        institute: clean(b.institute, 150), title: clean(b.title, 120)
      };
      if (!rec.name) continue;
      db.certificates[rec.id] = rec;
      out.push({ id: rec.id });
    }
    db.batches += 1;
    saveDb();
    return sendJson(res, 200, { batchId, certificates: out });
  }

  // Verification lookup (public - this is what the QR code points at)
  const m = pathname.match(/^\/api\/verify\/([A-Za-z0-9-]{4,40})$/);
  if (req.method === 'GET' && m) {
    const id = m[1].toUpperCase();
    if (id.startsWith('SMP-')) return sendJson(res, 200, { valid: false, sample: true });
    const c = db.certificates[id];
    if (!c) return sendJson(res, 200, { valid: false });   // 200 so the page can show a friendly "not found"
    return sendJson(res, 200, {
      valid: true,
      certificate: { id: c.id, name: c.name, course: c.course, date: c.date, institute: c.institute, title: c.title, issuedAt: c.issuedAt }
    });
  }

  if (req.method === 'GET' && pathname === '/api/stats')
    return sendJson(res, 200, { leads: db.leads.length, batches: db.batches, certificates: Object.keys(db.certificates).length });

  return sendJson(res, 404, { error: 'Not found' });
}

/* ------------------------------ static files --------------------------------- */
function serveStatic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (/^\/verify\/[^/]*$/.test(pathname)) pathname = '/verify.html';
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); } // block ../ tricks
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404 Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* --------------------------------- server ------------------------------------ */
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (e) {
    sendJson(res, 400, { error: e.message || 'Bad request' });
  }
}).listen(PORT, () => console.log(`Certiflow running -> http://localhost:${PORT}`));
