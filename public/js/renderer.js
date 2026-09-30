/**
 * renderer.js - draws one certificate onto a <canvas> (A4 landscape ratio).
 * The SAME function feeds the live preview and the PDF export, so what you see is exactly
 * what you download.
 *
 * drawCertificate(ctx, cert, design, opts)
 *   cert   : { name, course, dateText, extra, id, verifyUrl, institute, title, intro, action, signName, signRole }
 *   design : { template: 'classic'|'modern'|'minimal', accent: '#rrggbb', logo: Image|null, sig: Image|null }
 *   opts   : { watermark: boolean, qr: {size, modules} }
 */
export const CW = 2000;
export const CH = 1414;           // 2000 / 1.4142 = A4 landscape ratio

const SERIF = '"Playfair Display","Cormorant Garamond",Georgia,"Times New Roman",serif';
const SANS  = '"Inter","Segoe UI",system-ui,-apple-system,Roboto,Arial,sans-serif';
const INK = '#1b2333', MUTED = '#59647a', FAINT = '#8a93a6';

const font = (px, { w = 400, italic = false, fam = SANS } = {}) => `${italic ? 'italic ' : ''}${w} ${px}px ${fam}`;

function fit(ctx, text, mk, maxW, start, min = 20) {
  let px = start; ctx.font = mk(px);
  while (ctx.measureText(text).width > maxW && px > min) { px -= 2; ctx.font = mk(px); }
  return px;
}

function txt(ctx, s, x, y, o = {}) {
  if (!s) return 0;
  ctx.save();
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = o.color || INK;
  if ('letterSpacing' in ctx) ctx.letterSpacing = (o.spacing || 0) + 'px';
  if (o.fitW) fit(ctx, s, o.mk, o.fitW, o.px, o.min); else ctx.font = o.mk(o.px);
  const w = ctx.measureText(s).width;
  ctx.fillText(s, x, y);
  ctx.restore();
  return w;
}

function shade(hex, amt) {                       // darken (-) / lighten (+) a #rrggbb colour
  const n = parseInt(hex.slice(1), 16);
  const c = v => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function imageFit(ctx, img, cx, top, maxW, maxH, alignBottom = false) {
  const r = Math.min(maxW / img.width, maxH / img.height, 1.6);
  const w = img.width * r, h = img.height * r;
  ctx.drawImage(img, cx - w / 2, alignBottom ? top - h : top, w, h);
  return { w, h };
}

function wrap(ctx, text, maxW, maxLines = 3) {
  const words = text.split(/\s+/), lines = []; let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, maxLines);
}

function drawQR(ctx, qr, x, y, box) {
  const n = qr.size, quiet = 2, cell = Math.floor(box / (n + quiet * 2)), total = cell * (n + quiet * 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, total, total);
  ctx.fillStyle = '#0b0f19';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++)
    if (qr.modules[r][c]) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, cell, cell);
  return total;
}

export function drawCertificate(ctx, cert, design, opts = {}) {
  const W = CW, H = CH, accent = design.accent || '#1e3a8a', tpl = design.template || 'classic';
  const modern = tpl === 'modern';
  const cx = modern ? 400 : W / 2;               // text anchor
  const al = modern ? 'left' : 'center';
  const contentW = modern ? W - 400 - 150 : 1500;

  // paper
  ctx.fillStyle = tpl === 'classic' ? '#fffdf8' : '#ffffff';
  ctx.fillRect(0, 0, W, H);

  /* ---------- template decoration ---------- */
  if (tpl === 'classic') {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 26); ctx.fillRect(0, H - 26, W, 26);
    ctx.strokeStyle = accent; ctx.lineWidth = 8; ctx.strokeRect(70, 70, W - 140, H - 140);
    ctx.lineWidth = 2; ctx.strokeRect(98, 98, W - 196, H - 196);
    ctx.fillStyle = accent;
    [[98, 98], [W - 98, 98], [98, H - 98], [W - 98, H - 98]].forEach(([x, y]) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillRect(-13, -13, 26, 26); ctx.restore();
    });
  } else if (tpl === 'minimal') {
    ctx.fillStyle = accent; ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#e5e7eb'; ctx.fillRect(120, H - 74, W - 240, 2);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, accent); g.addColorStop(1, shade(accent, -0.22));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 300, H);
    ctx.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(300, 240 + i * 260, 150 - i * 12, 0, Math.PI * 2); ctx.fill(); }
    // seal
    ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(150, 1180, 82, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(150, 1180, 64, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(122, 1182); ctx.lineTo(143, 1204); ctx.lineTo(182, 1158); ctx.stroke();
    // logo + institute inside the band
    let by = 150;
    if (design.logo) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.roundRect(40, 110, 220, 150, 22); ctx.fill();
      imageFit(ctx, design.logo, 150, 126, 190, 118); by = 330;
    }
    if (cert.institute) {
      ctx.font = font(26, { w: 700 }); if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
      const lines = wrap(ctx, cert.institute.toUpperCase(), 250, 6);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      lines.forEach((l, i) => ctx.fillText(l, 150, by + (design.logo ? 0 : 60) + i * 38));
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }
  }

  /* ---------- text block ---------- */
  const T = modern
    ? { title: 350, intro: 480, name: 625, action: 745, course: 840, extra: 905, issued: 968 }
    : { title: 440, intro: 550, name: 695, action: 815, course: 910, extra: 972, issued: 1035 };

  if (!modern) {
    if (design.logo) imageFit(ctx, design.logo, cx, 128, 380, 120);
    if (cert.institute) txt(ctx, cert.institute.toUpperCase(), cx, design.logo ? 305 : 265,
      { mk: px => font(px, { w: 600 }), px: 30, spacing: 9, color: MUTED, fitW: contentW, min: 18 });
  }

  txt(ctx, (cert.title || 'Certificate of Completion').toUpperCase(), cx, T.title, {
    align: al, mk: px => font(px, { w: 700, fam: SERIF }), px: modern ? 84 : 100, spacing: 4,
    color: modern ? INK : accent, fitW: contentW, min: 40
  });
  if (modern) { ctx.fillStyle = accent; ctx.fillRect(cx, T.title + 28, 150, 8); }
  if (tpl === 'minimal') { ctx.fillStyle = accent; ctx.fillRect(cx - 60, T.title + 62, 120, 6); }

  txt(ctx, cert.intro, cx, T.intro, { align: al, mk: px => font(px), px: 33, color: MUTED, fitW: contentW });

  const nameW = txt(ctx, cert.name, cx, T.name, {
    align: al, mk: px => font(px, { w: 700, italic: true, fam: SERIF }), px: 136, color: INK, fitW: contentW, min: 48
  });
  ctx.fillStyle = INK;
  if (modern) ctx.fillRect(cx, T.name + 40, Math.max(Math.min(nameW + 60, contentW), 520), 3);
  else { const hw = Math.max(Math.min(nameW / 2 + 90, 780), 380); ctx.fillRect(cx - hw, T.name + 40, hw * 2, 3); }

  txt(ctx, cert.action, cx, T.action, { align: al, mk: px => font(px), px: 33, color: MUTED, fitW: contentW });
  txt(ctx, cert.course, cx, T.course, { align: al, mk: px => font(px, { w: 700 }), px: 64, color: INK, fitW: contentW, min: 28 });
  txt(ctx, cert.extra, cx, T.extra, { align: al, mk: px => font(px), px: 31, color: MUTED, fitW: contentW });
  txt(ctx, cert.dateText ? `Issued on ${cert.dateText}` : '', cx, T.issued, { align: al, mk: px => font(px), px: 28, color: FAINT, fitW: contentW });

  /* ---------- signature ---------- */
  const sx = modern ? 400 + 190 : W / 2, lineY = 1212;
  if (design.sig) imageFit(ctx, design.sig, sx, lineY - 10, 340, 110, true);
  ctx.fillStyle = INK; ctx.fillRect(sx - 190, lineY, 380, 3);
  txt(ctx, cert.signName, sx, lineY + 44, { mk: px => font(px, { w: 700 }), px: 32, fitW: 400, min: 20 });
  txt(ctx, cert.signRole, sx, lineY + 84, { mk: px => font(px), px: 27, color: MUTED, fitW: 400, min: 18 });

  /* ---------- watermark (samples only) ---------- */
  if (opts.watermark) {
    ctx.save();
    ctx.translate(W / 2 + (modern ? 150 : 0), H / 2 + 30); ctx.rotate(-Math.PI / 7);
    ctx.font = font(170, { w: 800 }); ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(27,35,51,.085)';
    ctx.fillText('SAMPLE \u00B7 certiflow', 0, 0);
    ctx.restore();
  }

  /* ---------- QR + footer ---------- */
  const qrBox = 196, qrX = W - (tpl === 'classic' ? 170 : 150) - qrBox, qrY = 1040;
  if (opts.qr) {
    const total = drawQR(ctx, opts.qr, qrX, qrY, qrBox);
    txt(ctx, 'Scan to verify', qrX + total / 2, qrY + total + 32, { mk: px => font(px), px: 23, color: FAINT });
  }
  const fx = modern ? 400 + 560 : (tpl === 'classic' ? 170 : 150), fy = 1216;
  const host = cert.verifyUrl ? cert.verifyUrl.replace(/^https?:\/\//, '').replace(/\/verify\/.*$/, '/verify') : '';
  txt(ctx, `Certificate ID: ${cert.id}`, fx, fy, { align: 'left', mk: px => font(px, { w: 600 }), px: 24, color: MUTED });
  txt(ctx, host ? `Verify at ${host}` : '', fx, fy + 36, { align: 'left', mk: px => font(px), px: 21, color: FAINT });
  txt(ctx, opts.watermark ? 'Free sample \u00B7 generated with Certiflow' : 'Issued with Certiflow \u00B7 scan the QR code to verify',
    fx, fy + 70, { align: 'left', mk: px => font(px), px: 20, color: FAINT });
}
