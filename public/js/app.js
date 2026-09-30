/**
 * app.js - the UI controller. Flow:
 *   file -> parse -> map columns -> build recipient list -> live preview (canvas)
 *   -> free: 5 watermarked samples (PDF)  |  unlocked: server issues IDs -> ZIP / combined PDF
 */
import { parseFile, formatDate, todayISO } from './parser.js';
import { makeQR } from './qr.js';
import { drawCertificate, CW, CH } from './renderer.js';
import { buildPdf, buildZip, downloadBlob, canvasToJpeg, safeName, csvCell } from './exporter.js';

const $ = id => document.getElementById(id);
const SAMPLE_ID = 'SMP-XXXX-XXXX-XXXX';
const ORIGIN = location.protocol.startsWith('http') ? location.origin : 'http://localhost:3000';
const S = { headers: [], rows: [], idx: 0, logo: null, sig: null, token: localStorage.getItem('cf_token') || '', limit: 500 };

const SAMPLE = {
  name: 'sample_students_list.csv',
  headers: ['Name', 'Email', 'Course', 'Date', 'Grade'],
  rows: [
    ['Aarav Sharma', 'aarav.s@example.com', 'Web Development', '2026-09-30', 'A+'],
    ['Diya Patel', 'diya.p@example.com', 'AIML', '2026-09-30', 'A'],
    ['Rohan Mehta', 'rohan.m@example.com', 'Data Science', '2026-09-28', 'A'],
    ['Ananya Iyer', 'ananya.i@example.com', 'Cyber Security', '2026-09-28', 'B+'],
    ['Kabir Singh', 'kabir.s@example.com', 'Cloud Computing', '2026-09-25', 'A'],
    ['Meera Nair', 'meera.n@example.com', 'UI/UX Design', '2026-09-25', 'A+'],
    ['Vihaan Gupta', 'vihaan.g@example.com', 'Web Development', '2026-09-30', 'B'],
    ['Ishita Rao', 'ishita.r@example.com', 'Python Programming', '2026-09-22', 'A'],
    ['Arjun Verma', 'arjun.v@example.com', 'AIML', '2026-09-30', 'A'],
    ['Saanvi Joshi', 'saanvi.j@example.com', 'Digital Marketing', '2026-09-22', 'B+']
  ]
};

function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = ''), 3800);
}

/* ------------------------- 1. load data ------------------------- */
async function loadFile(file) {
  try { const t = await parseFile(file); setData(t.headers, t.rows, file.name); }
  catch (e) { toast(e.message, true); }
}
function setData(headers, rows, fileName) {
  S.headers = headers; S.rows = rows; S.idx = 0;
  const guess = re => { const i = headers.findIndex(h => re.test(h)); return i < 0 ? '' : String(i); };
  const fill = (id, opt, val) => {
    const sel = $(id); sel.disabled = false;
    sel.innerHTML = (opt ? '<option value="">\u2014 not in sheet \u2014</option>' : '') + headers.map((h, i) => `<option value="${i}">${h.replace(/</g, '&lt;')}</option>`).join('');
    sel.value = val;
  };
  fill('mapName', false, guess(/name|student|candidate|participant/i) || '0');
  fill('mapCourse', true, guess(/course|program|training|subject/i));
  fill('mapDate', true, guess(/date/i));
  fill('mapExtra', true, guess(/grade|score|mark|duration|rank|result/i));
  if ($('mapExtra').value && !$('extraLabel').value) $('extraLabel').value = headers[+$('mapExtra').value];
  $('fileInfo').textContent = `${fileName} \u00B7 ${rows.length} rows`;
  refresh();
}

/* ------------------- 2. build recipients + draw ------------------- */
function recipients() {
  if (!S.rows.length) return [];
  const val = (r, id) => ($(id).value === '' ? '' : r[+$(id).value] || '');
  const label = $('extraLabel').value.trim();
  return S.rows.map(r => {
    const extra = val(r, 'mapExtra');
    return {
      name: val(r, 'mapName'),
      course: val(r, 'mapCourse') || $('fbCourse').value.trim(),
      dateText: formatDate(val(r, 'mapDate') || $('fbDate').value),
      extra: extra ? (label ? `${label}: ${extra}` : extra) : ''
    };
  }).filter(x => x.name);
}

const design = () => ({ template: document.querySelector('input[name=tpl]:checked').value, accent: $('accent').value, logo: S.logo, sig: S.sig });
const qrCache = new Map();
const qrFor = url => { if (!qrCache.has(url)) qrCache.set(url, makeQR(url)); return qrCache.get(url); };

function certData(rec, id) {
  const url = `${ORIGIN}/verify/${id}`;
  return {
    ...rec, id, verifyUrl: url, institute: $('tInstitute').value.trim(), title: $('tTitle').value.trim(),
    intro: $('tIntro').value.trim(), action: $('tAction').value.trim(),
    signName: $('tSignName').value.trim(), signRole: $('tSignRole').value.trim()
  };
}
const paint = (ctx, rec, id, watermark) => drawCertificate(ctx, certData(rec, id), design(), { watermark, qr: qrFor(`${ORIGIN}/verify/${id}`) });

let list = [];
function refresh() {
  list = recipients();
  $('emptyState').hidden = list.length > 0; $('preview').hidden = list.length === 0;
  if (!list.length) return;
  S.idx = Math.min(S.idx, list.length - 1);
  const cur = list[S.idx];
  $('recipCount').textContent = `${list.length} recipient${list.length > 1 ? 's' : ''} ready`;
  $('pagerLabel').textContent = `Preview ${S.idx + 1} of ${list.length}`;

  // course chips: shows the batch mixes different courses; click one to jump to it
  const counts = new Map(); list.forEach((r, i) => { const c = r.course || '(no course)'; if (!counts.has(c)) counts.set(c, { n: 0, first: i }); counts.get(c).n++; });
  $('courseChips').innerHTML = '';
  counts.forEach((v, c) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip' + ((cur.course || '(no course)') === c ? ' on' : '');
    b.innerHTML = `${c.replace(/</g, '&lt;')}<b>${v.n}</b>`; b.onclick = () => { S.idx = v.first; refresh(); };
    $('courseChips').appendChild(b);
  });

  const unlocked = document.body.classList.contains('unlocked');
  paint($('certCanvas').getContext('2d'), cur, SAMPLE_ID, !unlocked);
  $('warnBox').hidden = !(unlocked && list.length > S.limit);
  $('warnBox').textContent = `Only the first ${S.limit} recipients will be issued in one run.`;
  if (!$('dlNote').dataset.done) $('dlNote').textContent = unlocked
    ? `Unlocked: ${Math.min(list.length, S.limit)} clean certificates with live QR verification, as a ZIP of PDFs + register CSV.`
    : 'Free: first 5 certificates (watermarked, sample QR). Unlock below for the full batch, clean PDFs and hosted QR verification.';
}

/* ------------------------- 3. exporting ------------------------- */
const canvas = document.createElement('canvas'); canvas.width = CW; canvas.height = CH;
const tick = () => new Promise(r => setTimeout(r));
function progress(done, total, msg) {
  $('progress').hidden = done >= total && !msg; $('progressBar').style.width = (done / total * 100) + '%';
  $('progressText').textContent = msg || `Rendering ${done} of ${total}\u2026`;
}
const page = async () => ({ jpeg: await canvasToJpeg(canvas, 0.82), width: CW, height: CH });

$('dlSampleBtn').onclick = async () => {
  const btn = $('dlSampleBtn'); btn.disabled = true;
  try {
    const sample = list.slice(0, 5), pages = [], ctx = canvas.getContext('2d');
    for (let i = 0; i < sample.length; i++) { paint(ctx, sample[i], SAMPLE_ID, true); pages.push(await page()); progress(i + 1, sample.length); await tick(); }
    downloadBlob(buildPdf(pages, 'Certiflow sample certificates'), 'sample-certificates-certiflow.pdf');
    $('dlNote').dataset.done = 1; $('dlNote').innerHTML = `<b>${sample.length} sample certificates downloaded (watermarked).</b> Unlock below for the full batch.`;
  } catch (e) { toast(e.message, true); } finally { btn.disabled = false; progress(1, 1); }
};

async function exportFull(kind) {
  const btns = [$('dlZipBtn'), $('dlPdfBtn')]; btns.forEach(b => (b.disabled = true));
  try {
    const items = list.slice(0, S.limit);
    progress(0, items.length, 'Registering certificates on the server\u2026');
    const res = await fetch('/api/batches', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: S.token, institute: $('tInstitute').value, title: $('tTitle').value, certificates: items.map(r => ({ name: r.name, course: r.course, date: r.dateText })) })
    });
    const data = await res.json();
    if (!res.ok) { if (res.status === 401) lock(); throw new Error(data.error || 'Server error'); }

    const ctx = canvas.getContext('2d'), pages = [], files = [], rows = [['Certificate ID', 'Name', 'Course', 'Issue date', 'Verify URL', 'File']];
    for (let i = 0; i < items.length; i++) {
      const id = data.certificates[i].id;
      paint(ctx, items[i], id, false);
      const pg = await page();
      const file = `${String(i + 1).padStart(3, '0')}_${safeName(items[i].name)}_${safeName(items[i].course)}.pdf`;
      if (kind === 'zip') files.push({ name: `certificates/${file}`, data: new Uint8Array(await buildPdf([pg], items[i].name).arrayBuffer()) });
      else pages.push(pg);
      rows.push([id, items[i].name, items[i].course, items[i].dateText, `${ORIGIN}/verify/${id}`, file]);
      progress(i + 1, items.length); await tick();
    }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    if (kind === 'zip') {
      files.push({ name: 'register.csv', data: new TextEncoder().encode('\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n')) });
      downloadBlob(buildZip(files), `certiflow-batch-${stamp}.zip`);
    } else downloadBlob(buildPdf(pages, 'Certiflow certificates'), `certiflow-certificates-${stamp}.pdf`);
    $('dlNote').dataset.done = 1; $('dlNote').innerHTML = `<b>${items.length} certificates issued.</b> Each one is saved in the server register and verifies at ${ORIGIN}/verify/&lt;ID&gt;`;
    toast(`${items.length} certificates downloaded`);
  } catch (e) { toast(e.message, true); } finally { btns.forEach(b => (b.disabled = false)); progress(1, 1); }
}
$('dlZipBtn').onclick = () => exportFull('zip');
$('dlPdfBtn').onclick = () => exportFull('pdf');

/* ------------------------- 4. unlock (backend) ------------------------- */
function unlock(name, limit) {
  S.limit = limit || 500; document.body.classList.add('unlocked'); $('unlockedName').textContent = name.split(' ')[0]; delete $('dlNote').dataset.done; refresh();
}
function lock() { S.token = ''; localStorage.removeItem('cf_token'); document.body.classList.remove('unlocked'); delete $('dlNote').dataset.done; refresh(); }

$('unlockForm').onsubmit = async e => {
  e.preventDefault(); const err = $('unlockError'); err.hidden = true; $('unlockBtn').disabled = true;
  try {
    const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: $('uName').value, email: $('uEmail').value, institute: $('uInst').value, designation: $('uDesig').value, phone: $('uPhone').value }) });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error);
    S.token = d.token; localStorage.setItem('cf_token', d.token); unlock(d.name, d.limit);
    toast('Unlocked! You can now download the full batch.'); $('generator').scrollIntoView();
  } catch (x) { err.textContent = x instanceof TypeError ? 'Cannot reach the server - start it with "node server.js".' : x.message; err.hidden = false; }
  finally { $('unlockBtn').disabled = false; }
};
if (S.token) fetch('/api/session?token=' + encodeURIComponent(S.token)).then(r => r.json()).then(d => d.valid ? unlock(d.name, d.limit) : lock()).catch(() => {});

/* ------------------------- 5. wiring ------------------------- */
$('chooseBtn').onclick = () => $('fileInput').click();
$('fileInput').onchange = e => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ''; };
const dz = $('dropzone');
['dragenter', 'dragover'].forEach(v => dz.addEventListener(v, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(v => dz.addEventListener(v, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });

const useSample = e => { e && e.preventDefault(); setData(SAMPLE.headers, SAMPLE.rows, SAMPLE.name); };
$('trySampleLink').onclick = useSample; $('trySampleBtn').onclick = useSample;
$('sampleCsvLink').onclick = e => {
  e.preventDefault();
  const csv = [SAMPLE.headers, ...SAMPLE.rows].map(r => r.map(csvCell).join(',')).join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv' }), 'sample_students_list.csv');
};

document.querySelectorAll('.panel input:not([type=file]), .panel select').forEach(el => el.addEventListener('input', () => { delete $('dlNote').dataset.done; refresh(); }));
document.querySelectorAll('.swatches button').forEach(b => (b.onclick = () => { $('accent').value = b.dataset.c; refresh(); }));

function loadImage(input, key) {
  input.onchange = () => {
    const f = input.files[0]; if (!f) { S[key] = null; return refresh(); }
    const fr = new FileReader();
    fr.onload = () => { const img = new Image(); img.onload = () => { S[key] = img; refresh(); }; img.src = fr.result; };
    fr.readAsDataURL(f);
  };
}
loadImage($('logoInput'), 'logo'); loadImage($('sigInput'), 'sig');

$('pagerPrev').onclick = () => { S.idx = (S.idx - 1 + list.length) % list.length; refresh(); };
$('pagerNext').onclick = () => { S.idx = (S.idx + 1) % list.length; refresh(); };
$('verifyForm').onsubmit = e => { e.preventDefault(); location.href = '/verify/' + encodeURIComponent($('verifyId').value.trim().toUpperCase()); };

$('fbDate').value = todayISO(); $('verifyHost').textContent = ORIGIN.replace(/^https?:\/\//, '') + '/verify/';
