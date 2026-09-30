/**
 * exporter.js - turns rendered certificates into downloadable files, with no libraries.
 *
 *   buildPdf(pages)      -> Blob   one PDF, one A4-landscape page per certificate
 *   buildZip(entries)    -> Blob   a ZIP archive  [{ name, data: Uint8Array | Blob-bytes }]
 *   downloadBlob(b, fn)  -> triggers the browser download
 *
 * PDF: each page is a full-page JPEG image (the canvas render), which keeps the PDF identical
 *      to the on-screen preview, including logos, signatures and the QR code.
 * ZIP: files are "stored" (no compression) because PDFs/JPEGs are already compressed.
 */

const A4_W = 841.89, A4_H = 595.28;         // points (A4 landscape)
const enc = new TextEncoder();

/* ------------------------------- PDF ------------------------------- */
/** pages: [{ jpeg: Uint8Array, width: px, height: px }] */
export function buildPdf(pages, title = 'Certificates') {
  const parts = []; const offsets = [];
  let pos = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); pos += b.length; };
  const startObj = id => { offsets[id] = pos; push(`${id} 0 obj\n`); };

  push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

  const n = pages.length, infoId = 3 + n * 3;
  startObj(1); push('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  startObj(2);
  push(`<< /Type /Pages /Count ${n} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>\nendobj\n`);

  pages.forEach((pg, i) => {
    const pageId = 3 + i * 3, contentId = pageId + 1, imgId = pageId + 2;
    startObj(pageId);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_W} ${A4_H}] /Resources << /XObject << /Im0 ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`);
    const content = `q ${A4_W} 0 0 ${A4_H} 0 0 cm /Im0 Do Q`;
    startObj(contentId);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
    startObj(imgId);
    push(`<< /Type /XObject /Subtype /Image /Width ${pg.width} /Height ${pg.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg); push('\nendstream\nendobj\n');
  });

  const safeTitle = title.replace(/[^\x20-\x7E]/g, '').replace(/[()\\]/g, '');
  startObj(infoId); push(`<< /Title (${safeTitle}) /Producer (Certiflow) /Creator (Certiflow) >>\nendobj\n`);

  const xrefPos = pos, total = infoId + 1;
  let xref = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}

/* ------------------------------- ZIP ------------------------------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

/** entries: [{ name: 'folder/file.pdf', data: Uint8Array }] */
export function buildZip(entries) {
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = []; let offset = 0;

  for (const e of entries) {
    const name = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); // UTF-8 names
    lh.setUint16(8, 0, true); lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true); lh.setUint32(18, size, true); lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, e.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true); ch.setUint32(20, size, true); ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* ----------------------------- helpers ----------------------------- */
export function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}

export const canvasToJpeg = (canvas, q = 0.9) =>
  new Promise((res, rej) => canvas.toBlob(async b => (b ? res(new Uint8Array(await b.arrayBuffer())) : rej(new Error('Render failed'))), 'image/jpeg', q));

export const safeName = s => String(s || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'certificate';

export const csvCell = v => { const s = String(v ?? ''); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
