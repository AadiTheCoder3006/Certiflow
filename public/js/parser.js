/**
 * parser.js - reads .csv / .tsv / .xlsx files in the browser (nothing is uploaded).
 * An .xlsx file is just a ZIP of XML files, so we open the ZIP, inflate the parts we need
 * with the browser's built-in DecompressionStream, and read the cells from the XML.
 *
 * parseFile(file) -> { headers: string[], rows: string[][] }
 */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export async function parseFile(file) {
  const name = file.name.toLowerCase();
  let table;
  if (name.endsWith('.xlsx') || name.endsWith('.xlsm')) {
    table = await readXlsx(await file.arrayBuffer());
  } else if (name.endsWith('.xls')) {
    throw new Error('Old .xls files are not supported - please save the sheet as .xlsx or .csv and try again.');
  } else {
    table = readCsv(await file.text());
  }
  return normalise(table);
}

/* ------------------------------- CSV ------------------------------- */
export function readCsv(text) {
  text = text.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map(d => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/* ------------------------------- XLSX ------------------------------- */
async function inflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function unzipIndex(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This does not look like a valid .xlsx file.');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder(), files = {};
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const off = dv.getUint32(p + 42, true);
    const fname = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[fname] = { method, csize, off };
    p += 46 + nlen + elen + clen;
  }
  return {
    async read(fname) {
      const f = files[fname]; if (!f) return null;
      const nlen = dv.getUint16(f.off + 26, true), elen = dv.getUint16(f.off + 28, true);
      const start = f.off + 30 + nlen + elen, data = u8.subarray(start, start + f.csize);
      const bytes = f.method === 0 ? data : await inflateRaw(data);
      return dec.decode(bytes);
    },
    has: fname => !!files[fname]
  };
}

const xml = s => new DOMParser().parseFromString(s, 'application/xml');
const colIndex = ref => { const m = /^[A-Z]+/i.exec(ref)[0].toUpperCase(); let n = 0; for (const ch of m) n = n * 26 + ch.charCodeAt(0) - 64; return n - 1; };
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

async function readXlsx(buf) {
  const zip = unzipIndex(buf);
  const wb = xml(await zip.read('xl/workbook.xml') || '');
  const firstSheet = wb.getElementsByTagName('sheet')[0];
  if (!firstSheet) throw new Error('No worksheet found in this file.');
  const rid = firstSheet.getAttributeNS(REL_NS, 'id') || firstSheet.getAttribute('r:id');

  let sheetPath = 'xl/worksheets/sheet1.xml';
  const relsTxt = await zip.read('xl/_rels/workbook.xml.rels');
  if (relsTxt) {
    for (const r of xml(relsTxt).getElementsByTagName('Relationship')) {
      if (r.getAttribute('Id') === rid) {
        const t = r.getAttribute('Target');
        sheetPath = t.startsWith('/') ? t.slice(1) : 'xl/' + t;
      }
    }
  }

  const shared = [];
  const sstTxt = await zip.read('xl/sharedStrings.xml');
  if (sstTxt) {
    for (const si of xml(sstTxt).getElementsByTagName('si')) {
      let s = ''; for (const t of si.getElementsByTagName('t')) { if (t.parentNode.nodeName !== 'rPh') s += t.textContent; }
      shared.push(s);
    }
  }

  const sheetTxt = await zip.read(sheetPath);
  if (!sheetTxt) throw new Error('Could not read the first worksheet.');
  const rows = [];
  for (const rowEl of xml(sheetTxt).getElementsByTagName('row')) {
    const r = [];
    for (const c of rowEl.getElementsByTagName('c')) {
      const idx = colIndex(c.getAttribute('r') || 'A1'), t = c.getAttribute('t');
      let val = '';
      if (t === 'inlineStr') val = Array.from(c.getElementsByTagName('t')).map(x => x.textContent).join('');
      else {
        const v = c.getElementsByTagName('v')[0]; val = v ? v.textContent : '';
        if (t === 's') val = shared[+val] ?? '';
      }
      r[idx] = val;
    }
    const rn = +rowEl.getAttribute('r') - 1;
    rows[isNaN(rn) ? rows.length : rn] = Array.from(r, v => v ?? '');
  }
  return Array.from(rows, r => r || []);
}

/* ------------------------- shared clean-up ------------------------- */
function normalise(rows) {
  rows = rows.filter(r => r.some(c => String(c ?? '').trim() !== ''));
  if (rows.length < 2) throw new Error('The file needs a header row and at least one data row.');
  const width = Math.max(...rows.map(r => r.length));
  const seen = {};
  const headers = Array.from({ length: width }, (_, i) => {
    let h = String(rows[0][i] ?? '').trim() || `Column ${i + 1}`;
    if (seen[h]) h = `${h} (${++seen[h]})`; else seen[h] = 1;
    return h;
  });
  const body = rows.slice(1).map(r => Array.from({ length: width }, (_, i) => String(r[i] ?? '').trim()));
  return { headers, rows: body };
}

/* ------------------------------ dates ------------------------------ */
/** Turns "2026-09-30", "30/09/2026", an Excel serial number, etc. into "30 September 2026". */
export function formatDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return '';
  let d = null;
  if (/^\d+(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) {
    d = new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 86400000);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }
  let m;
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) d = [+m[1], +m[2], +m[3]];
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s))) d = [+m[3], +m[2], +m[1]]; // day first
  if (d && d[1] >= 1 && d[1] <= 12 && d[2] >= 1 && d[2] <= 31) return `${d[2]} ${MONTHS[d[1] - 1]} ${d[0]}`;
  const t = Date.parse(s);
  if (!isNaN(t)) { const x = new Date(t); return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`; }
  return s;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
