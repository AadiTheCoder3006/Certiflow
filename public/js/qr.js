/**
 * qr.js - a compact QR Code generator (byte mode, error-correction level M, versions 1-10).
 * Written from the QR standard so the project needs no external library.
 * Usage:  const qr = makeQR("https://example.com/verify/ABC");   // -> { size, modules[y][x] }
 */

// Level-M tables, index = version (1..10)
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const NUM_BLOCKS    = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

/* ---------- Reed-Solomon error correction over GF(256) ---------- */
function rsMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) { r[j] = rsMul(r[j], root); if (j + 1 < degree) r[j] ^= r[j + 1]; }
    root = rsMul(root, 2);
  }
  return r;
}
function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    divisor.forEach((c, i) => { r[i] ^= rsMul(c, f); });
  }
  return r;
}

/* ---------- capacity helpers ---------- */
function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}
const dataCodewords = ver => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];

function alignPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const res = [6];
  for (let pos = size - 7; res.length < n; pos -= step) res.splice(1, 0, pos);
  return res;
}

const getBit = (x, i) => ((x >>> i) & 1) !== 0;

export function makeQR(text) {
  const bytes = Array.from(new TextEncoder().encode(text));

  // 1. pick the smallest version that fits
  let ver = 1;
  for (; ver <= 10; ver++) {
    const ccBits = ver < 10 ? 8 : 16;
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break;
  }
  if (ver > 10) throw new Error('Text too long for QR');

  // 2. build the bit stream: mode(0100) + length + data + terminator + padding
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16);
  bytes.forEach(b => put(b, 8));
  const capBits = dataCodewords(ver) * 8;
  put(0, Math.min(4, capBits - bits.length));
  put(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v);
  }

  // 3. split into blocks, add ECC, interleave
  const nb = NUM_BLOCKS[ver], eccLen = ECC_PER_BLOCK[ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const shortBlocks = nb - raw % nb, shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < shortBlocks ? 0 : 1)); k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < shortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < blocks[0].length; i++)
    blocks.forEach((blk, j) => { if (i !== shortLen - eccLen || j >= shortBlocks) codewords.push(blk[i]); });

  // 4. draw fixed patterns
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn  = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x, y, v) => { mod[y][x] = v; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const ap = alignPositions(ver);
  ap.forEach((ax, i) => ap.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === ap.length - 1) || (i === ap.length - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
      setFn(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));

  const drawFormat = mask => {
    const d = (0 << 3) | mask;           // ECC level M has format bits 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(f, i));
    setFn(8, 7, getBit(f, 6)); setFn(8, 8, getBit(f, 7)); setFn(7, 8, getBit(f, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(f, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(f, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(f, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0); // reserve the area first

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const v = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      setFn(a, b, getBit(v, i)); setFn(b, a, getBit(v, i));
    }
  }

  // 5. place data bits in the zig-zag order
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && bi < codewords.length * 8) { mod[y][x] = getBit(codewords[bi >>> 3], 7 - (bi & 7)); bi++; }
    }
  }

  // 6. try all 8 masks, keep the one with the lowest penalty
  const maskFn = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
  ];
  const applyMask = m => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](x, y)) mod[y][x] = !mod[y][x]; };

  const penalty = () => {
    let p = 0;
    const lines = [];
    for (let y = 0; y < size; y++) lines.push(mod[y].map(Number).join(''));
    for (let x = 0; x < size; x++) lines.push(mod.map(r => Number(r[x])).join(''));
    for (const s of lines) {
      const runs = s.match(/0+|1+/g);                                  // rule 1: long runs
      runs.forEach(r => { if (r.length >= 5) p += 3 + (r.length - 5); });
      p += 40 * ((s.match(/(?=10111010000|00001011101)/g) || []).length); // rule 3: finder-like
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { // rule 2: 2x2 blocks
      const c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
    }
    let dark = 0; mod.forEach(r => r.forEach(v => { if (v) dark++; }));   // rule 4: balance
    p += (Math.ceil(Math.abs(dark * 20 - size * size * 10) / (size * size)) - 1) * 10;
    return p;
  };

  let best = 0, bestP = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const p = penalty();
    if (p < bestP) { bestP = p; best = m; }
    applyMask(m);                                // XOR again = undo
  }
  applyMask(best); drawFormat(best);
  return { size, modules: mod, version: ver };
}
