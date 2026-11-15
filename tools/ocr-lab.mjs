// Dev lab: how well does each picture clean-up recipe let the text reader find the details?  node tools/ocr-lab.mjs
import { createCanvas } from '@napi-rs/canvas';
import { createWorker } from 'tesseract.js';
import path from 'path';
const { parseDetails } = await import('../public/extract.js');

const lines = ['CUSTOMER INFORMATION FORM', 'Full Name: Wong Siew Lan', 'NRIC No: 780315-08-5432', 'Mobile No: 016-778 1234', 'Email: siewlan.wong@example.com', 'Policy No: 9876543210', 'Address: 22, Jalan Sultan Azlan Shah, 11700 Gelugor, Pulau Pinang', 'Occupation: Teacher'];
let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
function make({ tilt = 0, shadow = false, noise = 0, W = 900, H = 620, font = 25 }) {
  const c = createCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f3efe4'; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2); g.rotate(tilt * Math.PI / 180); g.translate(-W / 2, -H / 2);
  g.fillStyle = '#222'; g.font = `${font}px Arial`; lines.forEach((t, i) => g.fillText(t, 40, 70 + i * 62 * font / 25)); g.restore();
  if (shadow) { const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  if (noise) { const id = g.getImageData(0, 0, W, H); for (let i = 0; i < id.data.length; i += 4) { const n = (rnd() - 0.5) * noise; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0); }
  return c;
}
const gray = c => { const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data, L = new Float32Array(c.width * c.height); for (let i = 0; i < L.length; i++) L[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114; return L; };
function boxBlur(L, w, h, r) { // separable box blur
  const tmp = new Float32Array(L.length), out = new Float32Array(L.length);
  for (let y = 0; y < h; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += L[y * w + Math.min(w - 1, Math.max(0, x))]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * r + 1); acc += L[y * w + Math.min(w - 1, x + r + 1)] - L[y * w + Math.max(0, x - r)]; } }
  for (let x = 0; x < w; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]; for (let y = 0; y < h; y++) { out[y * w + x] = acc / (2 * r + 1); acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; } }
  return out;
}
function toCanvas(L, w, h) { const c = createCanvas(w, h), g = c.getContext('2d'), id = g.createImageData(w, h); for (let i = 0; i < L.length; i++) { const v = Math.max(0, Math.min(255, L[i])); id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; } g.putImageData(id, 0, 0); return c; }
function scaleTo(c, target) { const s = target / Math.max(c.width, c.height), w = Math.round(c.width * s), h = Math.round(c.height * s), o = createCanvas(w, h), g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, w, h); return o; }

const recipes = {
  raw: c => c,
  'gray+stretch @1900': c => { const s = scaleTo(c, 1900); const L = gray(s); return toCanvas(stretch(L), s.width, s.height); },
  'denoise(r1) @1400': c => { const L0 = gray(c); const L = boxBlur(L0, c.width, c.height, 1); const s = scaleTo(toCanvas(L, c.width, c.height), 1400); return toCanvas(stretch(gray(s)), s.width, s.height); },
  'flatten-bg + denoise @1400': c => { const w = c.width, h = c.height, L0 = gray(c), sm = boxBlur(L0, w, h, 1), bg = boxBlur(L0, w, h, Math.round(Math.min(w, h) / 12)); const L = new Float32Array(L0.length); for (let i = 0; i < L.length; i++) L[i] = Math.min(255, (sm[i] / Math.max(40, bg[i])) * 235); const s = scaleTo(toCanvas(L, w, h), 1400); return toCanvas(stretch(gray(s)), s.width, s.height); },
  'flatten-bg + denoise @native x1.5': c => { const w = c.width, h = c.height, L0 = gray(c), sm = boxBlur(L0, w, h, 1), bg = boxBlur(L0, w, h, Math.round(Math.min(w, h) / 12)); const L = new Float32Array(L0.length); for (let i = 0; i < L.length; i++) L[i] = Math.min(255, (sm[i] / Math.max(40, bg[i])) * 235); const s = scaleTo(toCanvas(L, w, h), Math.max(w, h) * 1.5); return toCanvas(stretch(gray(s)), s.width, s.height); },
};
function stretch(L) { const h = new Uint32Array(256); for (const v of L) h[Math.max(0, Math.min(255, v | 0))]++; let lo = 0, hi = 255, a = 0; for (let v = 0; v < 256; v++) { a += h[v]; if (a > L.length * 0.02) { lo = v; break; } } a = 0; for (let v = 255; v >= 0; v--) { a += h[v]; if (a > L.length * 0.02) { hi = v; break; } } const span = Math.max(40, hi - lo), o = new Float32Array(L.length); for (let i = 0; i < L.length; i++) o[i] = ((L[i] - lo) * 255) / span; return o; }

const worker = await createWorker('eng', 1, { langPath: path.resolve('node_modules/@tesseract.js-data/eng/4.0.0_best_int'), cachePath: path.resolve('node_modules/.cache-tess'), gzip: true });
const cases = { clean: {}, 'tilt+shadow+noise34': { tilt: -2.5, shadow: true, noise: 34 }, 'noise20': { noise: 20 }, 'shadow only': { shadow: true }, 'tilt only': { tilt: -3 }, 'small 600px': { W: 600, H: 413, font: 17, noise: 16 } };
for (const [cn, opts] of Object.entries(cases)) {
  const img = make(opts);
  for (const [rn, fn] of Object.entries(recipes)) {
    const t0 = Date.now();
    await worker.setParameters({ tessedit_pageseg_mode: '6' });
    const { data } = await worker.recognize(fn(img).toBuffer('image/png'));
    const found = parseDetails(data.text);
    console.log(`${cn.padEnd(22)} ${rn.padEnd(34)} ${String(Object.keys(found).length).padStart(2)} fields  ${((Date.now() - t0) / 1000).toFixed(1)}s  name=${found.ownerName || '-'} nric=${found.ownerNric || '-'} mob=${found.mobile || '-'}`);
  }
}
await worker.terminate();
process.exit(0);
