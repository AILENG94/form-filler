// Reads customer details from an uploaded picture or PDF, entirely in the browser.
// PDFs with a text layer are read directly; pictures and scanned PDFs go through local OCR (tesseract.js).

import { matchLabel, normaliseLabel, FIELDS } from './fields.js';
import { splitAddress, splitNominees } from './address.js';

let ocrWorker = null;
async function getOcr(onProgress) {
  if (!ocrWorker) {
    const mod = await import('./lib/ocr/tesseract.esm.min.js');
    const { createWorker } = mod.createWorker ? mod : mod.default;
    ocrWorker = await createWorker('eng', 1, {
      workerPath: new URL('lib/ocr/worker.min.js', document.baseURI).href,
      corePath: new URL('lib/ocr-core', document.baseURI).href,
      langPath: new URL('lib/ocr-lang', document.baseURI).href,
      logger: m => onProgress && onProgress(m),
    });
  }
  return ocrWorker;
}

// ---- picture clean-up: upright, a good size, grayscale, stretched contrast (and a black-and-white copy) ----
async function toCanvas(src) {
  if (src instanceof HTMLCanvasElement) return src;
  const bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }); // honours the phone's rotation flag
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  c.getContext('2d').drawImage(bmp, 0, 0);
  return c;
}
function rotate(canvas, deg) {
  if (!deg) return canvas;
  const c = document.createElement('canvas'), swap = deg % 180;
  c.width = swap ? canvas.height : canvas.width; c.height = swap ? canvas.width : canvas.height;
  const g = c.getContext('2d');
  g.translate(c.width / 2, c.height / 2); g.rotate(deg * Math.PI / 180); g.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return c;
}
// Returns { gray, bw }: the text reader does far better on a clean, evenly lit picture than on a raw photo.
// Recipe (tested on tilted / shadowed / noisy pictures): light de-noise, divide by the blurred background to take
// out shadows and glare, stretch the contrast, then enlarge.
function boxBlur(L, w, h, r) {
  const tmp = new Float32Array(L.length), out = new Float32Array(L.length), k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const o = y * w; let acc = 0;
    for (let x = -r; x <= r; x++) acc += L[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) { tmp[o + x] = acc / k; acc += L[o + Math.min(w - 1, x + r + 1)] - L[o + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc / k; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
function grayCanvas(L, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), id = g.createImageData(w, h);
  for (let i = 0; i < L.length; i++) { const v = L[i] < 0 ? 0 : L[i] > 255 ? 255 : L[i]; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  g.putImageData(id, 0, 0);
  return c;
}
function prepare(canvas, outLong = 0) {
  // work at (up to) 2400 px on the long side, so a 12-megapixel phone photo is not slow
  const down = Math.min(1, 2400 / Math.max(canvas.width, canvas.height));
  const w = Math.round(canvas.width * down), h = Math.round(canvas.height * down);
  const src = document.createElement('canvas'); src.width = w; src.height = h;
  const sg = src.getContext('2d'); sg.imageSmoothingQuality = 'high'; sg.drawImage(canvas, 0, 0, w, h);
  const d = sg.getImageData(0, 0, w, h).data, n = w * h, L0 = new Float32Array(n);
  for (let i = 0; i < n; i++) L0[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
  const smooth = boxBlur(L0, w, h, 1), bg = boxBlur(L0, w, h, Math.max(8, Math.round(Math.min(w, h) / 12)));
  const L = new Float32Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const v = Math.min(255, (smooth[i] / Math.max(40, bg[i])) * 235); L[i] = v; hist[v | 0]++; }
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc > n * 0.02) { hi = v; break; } }
  const span = Math.max(40, hi - lo), BW = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = ((L[i] - lo) * 255) / span; BW[i] = L[i] < 150 ? 0 : 255; }
  // enlarge small pictures (text reads best when letters are ~30 px tall)
  const target = outLong || Math.min(2200, Math.max(1400, Math.max(w, h) * 1.5)), s = target / Math.max(w, h);
  const scaled = c => { const o = document.createElement('canvas'); o.width = Math.round(w * s); o.height = Math.round(h * s); const g = o.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(c, 0, 0, o.width, o.height); return o; };
  return { gray: scaled(grayCanvas(L, w, h)), bw: scaled(grayCanvas(BW, w, h)) };
}

let lastWords = [];
async function recognise(worker, image, psm) {
  await worker.setParameters({ tessedit_pageseg_mode: String(psm), preserve_interword_spaces: '1' });
  const { data } = await worker.recognize(image);
  const flat = [];
  for (const b of data.blocks || []) for (const p of b.paragraphs || []) for (const l of p.lines || []) for (const w of l.words || []) flat.push(w);
  lastWords = flat.length > (data.words || []).length ? flat : data.words || [];
  return data.text || '';
}

// ---- GE ePartner "Policy Detail Information" printouts (scanned) ----
// Their tables are small grids whose cells a whole-page read garbles (names run together, digits wrong). So the
// tables are found from their grid lines and every cell is read on its own, enlarged.
function gridOf(canvas) {
  const W = canvas.width, H = canvas.height, px = canvas.getContext('2d').getImageData(0, 0, W, H).data;
  const dark = (x, y) => { const o = (y * W + x) * 4; return px[o] * 0.3 + px[o + 1] * 0.59 + px[o + 2] * 0.11 < 190; };
  const x0 = Math.round(W * 0.115), x1 = Math.round(W * 0.88);
  const ys = []; let prev = -9;
  for (let y = 0; y < H; y++) { // horizontal grid lines: long dark runs across the table area
    let n = 0; for (let x = x0; x < x1; x++) if (dark(x, y)) n++;
    if (n > (x1 - x0) * 0.6) { if (y - prev <= 2) ys[ys.length - 1] = (ys.at(-1) * 2 + y) / 3; else ys.push(y); prev = y; }
  }
  const rows = []; // neighbouring lines a table-row apart
  for (let i = 0; i + 1 < ys.length; i++) { const h = ys[i + 1] - ys[i]; if (h >= 12 && h <= 60) rows.push([ys[i], ys[i + 1]]); }
  // vertical grid lines through a stretch of rows -> column edges
  const edgesThrough = (ra, rb, share = 0.88) => {
    const edges = [];
    for (let x = Math.round(W * 0.08); x < Math.round(W * 0.95); x++) {
      let n = 0; for (let y = Math.round(ra) + 3; y < Math.round(rb) - 3; y++) if (dark(x, y)) n++;
      if (n > (rb - ra - 6) * share) { if (edges.length && x - edges.at(-1).end <= 2) edges.at(-1).end = x; else edges.push({ start: x, end: x }); }
    }
    return edges.map(e => (e.start + e.end) / 2);
  };
  return { W, H, rows, edgesThrough };
}
async function readCell(worker, canvas, [a, b], [y0, y1]) {
  const h = y1 - y0 - 3, w = b - a, S = Math.max(2, Math.min(5, 90 / Math.min(h, 30)));
  const c = document.createElement('canvas'); c.width = Math.round(w * S); c.height = Math.round(h * S);
  const cg = c.getContext('2d'); cg.fillStyle = '#fff'; cg.fillRect(0, 0, c.width, c.height); cg.imageSmoothingQuality = 'high';
  cg.drawImage(canvas, a, y0 + 1.5, w, h, 0, 0, c.width, c.height);
  await worker.setParameters({ tessedit_pageseg_mode: h > 34 ? '6' : '7', preserve_interword_spaces: '1' });
  return ((await worker.recognize(c)).data.text || '').replace(/\s+/g, ' ').trim();
}

// The "Insured" table (page 1): "Proposer CHO HAW YEN 910129-08-5731 29/01/1991" per row.
async function readInsuredTable(worker, canvas) {
  const g = gridOf(canvas);
  // the first run of at least three row-high lines is the Insured table (header + data rows)
  let rows = [];
  for (const r of g.rows) { if (rows.length && Math.abs(rows.at(-1)[1] - r[0]) > 2) { if (rows.length >= 3) break; rows = []; } rows.push(r); }
  if (rows.length < 3) return '';
  const ex = g.edgesThrough(rows[0][0], rows[2][1]); // Insured | Name | Gender | ID No | ID Type | DOB | Religion
  if (ex.length < 7) return '';
  const cols = { label: [ex[0] + 2, ex[1] - 1], name: [ex[1] + 2, ex[2] - 1], id: [ex[3] + 2, ex[4] - 1], dob: [ex[5] + 2, ex[6] - 1] };
  const out = [];
  for (const r of rows.slice(1, 5)) {
    const label = await readCell(worker, canvas, cols.label, r);
    if (!/^\W*(proposer|life|ife|assured)/i.test(label)) continue;
    out.push([label, await readCell(worker, canvas, cols.name, r), await readCell(worker, canvas, cols.id, r), await readCell(worker, canvas, cols.dob, r)].join(' '));
  }
  return out.join('\n');
}

// The "PAYER DETAILS" table (page 2): Name / ID No / Mobile No / E-mail / Address of the proposer.
async function readPayerTable(worker, canvas) {
  const g = gridOf(canvas);
  let start = -1;
  for (let i = 0; i < g.rows.length - 6; i++) { // the heading row: the first cell reads "PAYER DETAILS"
    const t = await readCell(worker, canvas, [g.W * 0.1, g.W * 0.5], g.rows[i]);
    if (/payer/i.test(t)) { start = i; break; }
  }
  if (start < 0) return '';
  const body = [];
  for (let i = start + 1; i < g.rows.length && body.length < 8; i++) { if (body.length && Math.abs(body.at(-1)[1] - g.rows[i][0]) > 2) break; body.push(g.rows[i]); }
  if (body.length < 5) return '';
  const ex = g.edgesThrough(body[2][0], body[4][1]); // ID No, Effective Date and Mobile No rows have all four columns
  if (ex.length < 5) return '';
  const lines = ['PAYER DETAILS'];
  for (const r of body) {
    const cells = [];
    for (let c = 0; c + 1 < ex.length && c < 4; c++) cells.push(await readCell(worker, canvas, [ex[c] + 2, ex[c + 1] - 1], r));
    lines.push(cells.join(' '));
  }
  return lines.join('\n');
}

// Reads a picture. 1) quick small reads find which way up it is, 2) one full-size read of the cleaned-up picture,
// 3) a black-and-white read only when that found little. Texts are joined best-first so a detail one pass missed
// is picked up from another.
async function ocr(src, onProgress) {
  const worker = await getOcr(m => {
    if (m.status === 'recognizing text') onProgress(`Reading text… ${Math.round(m.progress * 100)}%`);
    else if (m.status) onProgress('Preparing text reader…');
  });
  const base = await toCanvas(src);
  // 1. which way up? (quick small reads; stop at the first one that makes sense)
  let best = { deg: 0, q: -1 };
  for (const deg of [0, 90, 270, 180]) {
    onProgress(deg ? `Checking the picture turned ${deg}°…` : 'Looking at the picture…');
    const quick = await recognise(worker, prepare(rotate(base, deg), 1000).gray, 6);
    const q = quality(quick);
    if (q > best.q) best = { deg, q };
    if (q >= 20) break;
  }
  // 2. the full-size read
  const { gray, bw } = prepare(rotate(base, best.deg));
  onProgress('Reading text…');
  const texts = [await recognise(worker, gray, 6)];
  // 3. a second look when that found little
  if (quality(texts[0]) < 30) {
    onProgress('Reading text again (black and white)…');
    texts.push(await recognise(worker, bw, 6));
  }
  let result = texts.sort((a, b) => quality(b) - quality(a)).join('\n');
  if (/policyenquiry|getpolicydetail/i.test(result) && !/policy detail information/i.test(result)) {
    onProgress('Reading the payer table…');
    try { result += '\n' + await readPayerTable(worker, rotate(base, best.deg)); } catch (e) { console.warn('payer table', e); }
  }
  if (/policy detail information/i.test(result)) {
    onProgress('Reading the insured table…');
    try { const rot = rotate(base, best.deg); result += '\n' + await readInsuredTable(worker, rot); } catch (e) { console.warn('insured table', e); }
  }
  return result;
}

// Text items of a PDF page -> lines. Rows are split into cells wherever there is a wide gap (columns), a recognised
// label is paired with the value to its right ("label: value"), and a wrapped value that continues on the next row,
// starting at the same x, is attached to the value above it. Without this, two-column pages run together.
export function linesFromItems(items) {
  const rows = [];
  for (const it of items.filter(t => t.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    let row = rows.find(r => Math.abs(r.y - it.transform[5]) < 3);
    if (!row) rows.push(row = { y: it.transform[5], items: [] });
    row.items.push(it);
  }
  rows.sort((a, b) => b.y - a.y);
  const isLabel = t => { const l = t.replace(/[:：]\s*$/, '').trim(); return l.length >= 2 && l.length <= 40 && !/\d{3}/.test(l) && !!(baseKey(l) || /^nominee\(?s\)?$/i.test(l)); };
  const out = [], anchors = []; // anchors: values that a wrapped line below may continue
  for (const row of rows) {
    const its = row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    const cells = [];
    for (const it of its) {
      const last = cells.at(-1), x = it.transform[4];
      if (last && x - last.end < 8) { last.text += (x - last.end > 1.5 ? ' ' : '') + it.str; last.end = x + it.width; }
      else cells.push({ x, end: x + it.width, text: it.str });
    }
    const used = new Set();
    for (let i = 0; i < cells.length; i++) {
      if (used.has(i)) continue;
      const c = cells[i], text = c.text.replace(/\s+/g, ' ').trim();
      // a wrapped value: starts where a value above started, and is not a label itself
      const above = anchors.find(a => Math.abs(a.x - c.x) < 4 && a.y - row.y > 3 && a.y - row.y < 16 && !isLabel(text));
      if (above) { above.line.text += ' ' + text; above.y = row.y; continue; }
      if (isLabel(text) && i + 1 < cells.length && !isLabel(cells[i + 1].text.trim())) {
        const v = cells[i + 1]; used.add(i + 1);
        const line = { text: `${text.replace(/[:：]\s*$/, '')}: ${v.text.replace(/\s+/g, ' ').trim()}` };
        out.push(line); anchors.push({ x: v.x, y: row.y, line });
      } else out.push({ text });
    }
    for (let k = anchors.length - 1; k >= 0; k--) if (anchors[k].y - row.y > 16) anchors.splice(k, 1);
  }
  const lines = out.map(l => l.text);
  // "NAME OF PERSON" / "Insurance Policy Summary | …": the heading is the life assured
  if (lines.length > 1 && /^[A-Z][A-Za-z@'’.\- ]{3,60}$/.test(lines[0]) && lines[0].trim().split(/\s+/).length >= 2 && /policy summary|summary of|statement/i.test(lines[1]))
    lines[0] = `Life Assured: ${lines[0].trim()}`;
  return lines;
}

export async function readDocument(file, pdfjsLib, onProgress = () => {}) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return ocr(file, onProgress);

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(pdf.numPages, 6);
  const out = [];
  for (let i = 1; i <= pages; i++) {
    onProgress(`Reading page ${i} of ${pages}…`);
    const page = await pdf.getPage(i);
    const lines = linesFromItems((await page.getTextContent()).items);
    if (lines.join('').length > 30) { out.push(...lines); continue; }
    // Scanned page: render it and read it with OCR.
    const vp = page.getViewport({ scale: 3 });
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    const g = canvas.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: g, viewport: vp }).promise;
    out.push(await ocr(canvas, m => onProgress(`Page ${i}: ${m}`)));
  }
  return out.join('\n');
}

// ---------- picking details out of the text ----------

const STATES = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Malacca', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang', 'Penang',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'W.P. Kuala Lumpur', 'Wilayah Persekutuan', 'Labuan', 'Putrajaya'];
const STATE_RE = new RegExp(`\\b(${STATES.map(s => s.replace('.', '\\.').replace(/ /g, '\\s+')).join('|')})\\b\\s*$`, 'i');
const NRIC_RE = /\b([\dOoIlS]{6})\s*-?\s*([\dOoIlS]{2})\s*-?\s*([\dOoIlS]{4})\b/;
const DATE_RE = /\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})\b/;
const SKIP_KEYS = new Set(['signDate', 'agentName', 'agentNric', 'agentCode', 'agentMobile']); // never taken from a customer's document
const CARD_WORDS = /^(kad pengenalan|mykad|malaysia|identity card|warganegara|lelaki|perempuan|islam|kristian|buddha|hindu|pengenalan|kerajaan malaysia|mykid|mypr)\b/i;

const fixDigits = s => s.replace(/[Oo]/g, '0').replace(/[Il]/g, '1').replace(/S/g, '5');

function nric(s) {
  const m = String(s).match(NRIC_RE);
  if (!m) return '';
  const v = fixDigits(m[1] + m[2] + m[3]);
  return /^\d{12}$/.test(v) ? `${v.slice(0, 6)}-${v.slice(6, 8)}-${v.slice(8)}` : '';
}
function date(s) {
  const m = String(s).match(DATE_RE);
  if (!m) return '';
  let y = m[3]; if (y.length === 2) y = (+y > new Date().getFullYear() % 100 ? '19' : '20') + y;
  return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${y}`;
}

// Turns a raw value into a clean one for the field, or '' when it does not look right.
function validate(key, raw) {
  const v = String(raw).replace(/\s+/g, ' ').replace(/^[\s:;,.\-–]+|[\s;,]+$/g, '').trim();
  if (!v) return '';
  const def = FIELDS.find(f => f.key === key);
  if (/Nric$/.test(key)) return nric(v);
  if (def && def.date) return date(v);
  if (key === 'email') return (v.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [''])[0];
  if (/postcode$/i.test(key)) return (v.match(/\b\d{5}\b/) || [''])[0];
  if (/Gender$/.test(key)) return /^(m|male|lelaki)\b/i.test(v) ? 'Male' : /^(f|female|perempuan)\b/i.test(v) ? 'Female' : '';
  if (/Share$/.test(key)) return (v.match(/\d{1,3}(\.\d+)?/) || [''])[0];
  if (key === 'ownerMarital') return (['Single', 'Married', 'Divorced', 'Widowed'].find(s => new RegExp('^' + s.slice(0, 4), 'i').test(v))
    || ({ bujang: 'Single', berkahwin: 'Married', bercerai: 'Divorced', balu: 'Widowed', duda: 'Widowed' })[v.toLowerCase().split(/\W/)[0]] || '');
  if (/mobile|Tel$/i.test(key)) {
    const p = v.replace(/[Oo]/g, '0').replace(/[Il]/g, '1'); // letters read in place of digits
    // the first phone number only: groups of digits, stopping at a stray 1-2 digit group
    const run = (p.match(/\+?\d[\d\s-]*/) || [''])[0].trim(), kept = [];
    let digits = 0;
    for (const g of run.split(/\s+/)) {
      const n = g.replace(/\D/g, '').length;
      if (kept.length && (n < 3 || digits + n > 13)) break;
      kept.push(g); digits += n;
    }
    return digits >= 8 ? kept.join(' ') : '';
  }
  if (/Nationality$/.test(key) && /^(malaysia|malaysian|warganegara|wn)\b/i.test(v)) return 'Malaysian';
  if (/Name$|^town$|^state$|^country$|Nationality$/.test(key)) return /\d/.test(v) || !/[a-z]{2}/i.test(v) ? '' : v;
  if (/No$/.test(key)) { // the first number only ("1032466327 | Smart Health Protector …")
    const m = v.match(/[A-Za-z]{0,3}\d[\d-]{5,}\d/);
    return m ? m[0] : (/\d/.test(v) ? v.replace(/\s+/g, '') : '');
  }
  return v;
}

// Extra labels seen on customer documents (not on the forms), e.g. "P/N" for Policy No.
const DOC_LABELS = [
  ...FIELDS.flatMap(f => (f.docMatch || []).map(p => [p, f.key])),
  ['gender', 'ownerGender'], ['sex', 'ownerGender'], ['jantina', 'ownerGender'],
  ['marital status', 'ownerMarital'], ['status perkahwinan', 'ownerMarital'],
  ['share', 'share'], ['% share', 'share'], ['share %', 'share'], ['share \\(%\\)', 'share'], ['percentage', 'share'], ['bahagian', 'share'],
  ['ic', 'ownerNric'], ['ic no', 'ownerNric'], ['nric/passport', 'ownerNric'], ['tel', 'mobile'], ['phone', 'mobile'], ['hp', 'mobile'],
  ['dob', 'ownerDob'], ['birth date', 'ownerDob'], ['address', 'address1'],
  ['life assured', 'laName'], ['policy ?holder', 'ownerName'], ['policyholder', 'ownerName'],
  ['la', 'laName'], ['la name', 'laName'], ['la nric( no)?', 'laNric'], ['la ic( no)?', 'laNric'], ['la dob', 'laDob'],
  ['po', 'ownerName'], ['po name', 'ownerName'], ['po nric( no)?', 'ownerNric'], ['po ic( no)?', 'ownerNric'],
].map(([p, key]) => ({ key, re: new RegExp('^' + p.replace(/ /g, ' ?') + '$') }));

// Who a heading or label is about. The first match wins.
const ROLES = [
  [/\b(nominee|penama|beneficiar)/i, 'nominee'],
  [/\b(trustee|pemegang amanah)/i, 'trustee'],
  [/\b(agent|witness|saksi|advisor|ejen)\b/i, 'agent'],
  [/\b(life (to be )?assured|insured person|hayat yang diasuranskan|patient|pesakit)/i, 'la'],
  [/\b(policy ?owner|proposer|pemegang polisi|customer|applicant|claimant|payor|pencadang)/i, 'owner'],
];
const roleOf = s => (ROLES.find(([re]) => re.test(s)) || [])[1] || null;
const ROLE_WORDS = /\b(nominee|penama|beneficiar(y|ies)|trustee|pemegang amanah|life (to be )?assured|insured person|policy ?owner|proposer|patient|customer|applicant|claimant|agent|witness)('?s)?\b|\b(of|for|the|details?|particulars|maklumat|butiran)\b|\(?\s*[12](st|nd)?\s*\)?|#/gi;
const PERSON_PART = { ownerName: 'Name', ownerNric: 'Nric', ownerDob: 'Dob', ownerGender: 'Gender', relationship: 'Relationship',
  mobile: 'Mobile', address1: 'Address', postcode: 'Postcode', town: 'Town', share: 'Share', ownerNationality: 'Nationality' };
const ANY_SECTION = new Set(['policyNo', 'proposalNo', 'planName']);

// Customer-detail key for a plain label ("Name", "NRIC No.", "P/N"), before taking the section into account.
function baseKey(label) {
  const l = label.replace(/[*:]+$/, '').trim();
  if (l.length < 1 || l.length > 50) return null;
  const n = normaliseLabel(l);
  const doc = DOC_LABELS.find(d => d.re.test(n));
  if (doc) return doc.key;
  const hit = matchLabel(l) || matchLabel(l + ' no');
  if (hit) return hit.key;
  const plain = l.toLowerCase().replace(/[^a-z ]/g, '').trim();
  return (FIELDS.find(f => f.label.toLowerCase().replace(/[^a-z ]/g, '').trim() === plain) || {}).key || null;
}

// The detail a label fills, given the section it is in ({ role, n }). Roles in the label itself win ("Nominee 2 NRIC").
function labelKey(label, section) {
  let sec = section;
  const role = roleOf(label);
  if (role) {
    const num = +((label.match(/\b([12])(st|nd)?\b/) || [])[1] || (section && section.role === role ? section.n : 1));
    sec = { role, n: num };
  }
  let key = baseKey(label);
  if (!key && role) {
    const rest = label.replace(ROLE_WORDS, ' ').replace(/\s+/g, ' ').trim();
    key = rest ? baseKey(rest) : 'ownerName'; // "Nominee: Lim Ah Kow" is the nominee's name
  }
  if (!key) return null;
  // "Name of Life Assured" etc. already name their person.
  if (/^la/.test(key) || ANY_SECTION.has(key)) return key;
  if (/^(agent)/.test(key)) return null;
  if (!sec || sec.role === 'owner') return SKIP_KEYS.has(key) || key === 'share' ? null : key;
  if (sec.role === 'agent') return null; // agent details are typed in the app, not read from documents
  if (sec.role === 'la') return ({ ownerName: 'laName', ownerNric: 'laNric', ownerDob: 'laDob', ownerGender: 'laGender', relationship: 'relationship' })[key] || null;
  const part = PERSON_PART[key];
  if (!part || (part === 'Share' && sec.role !== 'nominee')) return null;
  return `${sec.role}${sec.n}${part}`;
}

// ---- tolerance for misread letters in label words ("NRlC", "Mobi1e", "Addres5", "Pol1cy") ----
const LABEL_WORDS = [...new Set([
  ...FIELDS.flatMap(f => (f.label + ' ' + (f.docMatch || []).join(' ')).toLowerCase().match(/[a-z]{4,}/g) || []),
  'name', 'nric', 'mobile', 'phone', 'email', 'policy', 'address', 'postcode', 'town', 'state', 'country', 'gender', 'nationality', 'occupation',
  'relationship', 'share', 'nominee', 'trustee', 'agent', 'bank', 'account', 'assured', 'owner', 'proposal', 'telephone', 'passport', 'birth', 'date',
])];
const WORDS = new Set(LABEL_WORDS);
const quality = t => Object.keys(parseDetails(t)).length * 10 + (t.toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => WORDS.has(w)).length;
const SWAPS = { '1': 'li', '0': 'o', '5': 's', '8': 'b', '|': 'l' };
function editDistance1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}
function fixWord(w) {
  const lw = w.toLowerCase();
  if (lw.length < 4 || LABEL_WORDS.includes(lw) || !/^[A-Za-z0-9|]+$/.test(w)) return w;
  // digits / bars standing in for letters first, then one wrong, missing or extra letter
  const swapped = lw.replace(/[1058|]/g, c => SWAPS[c][0]);
  const cands = new Set([lw, swapped, lw.replace(/1/g, 'i'), lw.replace(/0/g, 'o'), lw.replace(/rn/g, 'm'), swapped.replace(/rn/g, 'm'), lw.replace(/vv/g, 'w'), lw.replace(/cl/g, 'd')]);
  for (const c of cands) if (LABEL_WORDS.includes(c)) return c;
  const near = LABEL_WORDS.filter(v => v.length >= 5 && (editDistance1(lw, v) || editDistance1(swapped, v)));
  return near.length === 1 ? near[0] : w;
}
// Only the label part of a line (before ":" or "=") is corrected, so names and values are never rewritten.
function fixLine(line) {
  const m = line.match(/^([^:=;]{2,45}?)\s*[:=;]\s*(.*)$/);
  if (!m) return line;
  const label = m[1].split(/(\s+)/).map(p => (/\s/.test(p) ? p : fixWord(p))).join('');
  return `${label}: ${m[2]}`;
}

export function parseDetails(text) {
  const out = {};
  const set = (key, raw) => {
    if (!key || key in out) return false;
    const v = validate(key, raw);
    if (v) out[key] = v;
    return !!v;
  };
  const lines = String(text).split(/\r?\n/).map(l => fixLine(l.replace(/^[\s•·*>\-–]+/, '').replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim())).filter(Boolean);

  // GE ePartner "Policy Detail Information for P/N" printout: an Insured table (Proposer / Life Assured rows).
  const pn = lines.join('\n').match(/policy detail information[^\n]*?P\s*\/\s*N\s*:?\s*([\dOoIl]{10})\b/i);
  if (pn) {
    out.policyNo = fixDigits(pn[1]);
    let laSeen = 0;
    for (const raw of lines) {
      const line = raw.replace(/[\[\]~]+/g, ' ').replace(/\s+/g, ' ').trim();
      const m = line.match(/^(proposer|life assured(?:\s*\(\s*\d\s*\))?)\s+(.+)$/i);
      if (!m) continue;
      const rest = m[2], idm = rest.match(/[\dOoIlS][\dOoIlS.\-]{8,}[\dOoIlS]/);
      if (!idm) continue;
      // the NRIC, repaired: 12 digits, and its first six digits are the date of birth (YYMMDD)
      const digits = fixDigits(idm[0]).replace(/\D/g, '');
      if (digits.length !== 12) continue;
      const yy = +digits.slice(0, 2), mm = digits.slice(2, 4), dd = digits.slice(4, 6);
      if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) continue;
      const year = (yy > (new Date().getFullYear() % 100) ? 1900 : 2000) + yy;
      const id = digits.slice(0, 6) + '-' + digits.slice(6, 8) + '-' + digits.slice(8);
      const name = rest.slice(0, idm.index).replace(/\s+[MF]{1,2}\s*$/i, '').replace(/[^A-Za-z@'’.\/\- ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
      const gender = +digits[11] % 2 ? 'Male' : 'Female';
      const dob = dd + '/' + mm + '/' + year;
      const role = /^proposer/i.test(m[1]) ? 'owner' : (/\(\s*2\s*\)/.test(m[1]) ? 'la2' : 'la');
      if (role === 'la2') { out.la2Name = name; out.la2Nric = id; continue; } // a second life assured (e.g. the policyholder on a child's policy)
      out[role + 'Name'] = name; out[role + 'Gender'] = gender; out[role + 'Nric'] = id; out[role + 'Dob'] = dob;
    }
    // Nominee / trustee blocks typed or pasted below the printout ("NOMINEE 1:" ...): read them as well.
    const ni = lines.findIndex(l => /^(nominee|trustee|penama)s?\s*\(?\s*[12]\s*\)?\s*[:\-]?\s*$/i.test(l));
    if (ni >= 0) {
      const sub = parseDetails(lines.slice(ni).join('\n'));
      for (const k of Object.keys(sub)) if (/^(nominee|trustee)\d/.test(k) && !(k in out)) out[k] = sub[k];
    }
    // Page 2, "PAYER DETAILS": the proposer's mobile, e-mail and address (the policy enquiry has no address elsewhere).
    const pi = lines.findIndex(l => /^payer details/i.test(l));
    if (pi >= 0) {
      const blk = lines.slice(pi + 1, pi + 16).map(l => l.replace(/[\[\]~]+/g, ' ').replace(/\s+/g, ' ').trim());
      const mob = blk.map(l => l.match(/mobile\s*no\.?\s*[:\-]?\s*(\d[\d\s-]{6,12}\d)(?!\d)/i)).find(Boolean);
      if (mob) { let d = mob[1].replace(/\D/g, ''); if (/^1\d{8,9}$/.test(d)) d = '0' + d; if (/^01\d{8,9}$/.test(d)) out.mobile = d; }
      const em = blk.join(' ').match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/);
      if (em) out.email = em[0];
      const ai = blk.findIndex(l => /\baddress\s+(?!ind\b)\S/i.test(l.replace(/invalid address ind/i, '')));
      if (ai >= 0) {
        const parts = [blk[ai].replace(/invalid address ind/i, '').replace(/^.*?\baddress\s+/i, '')];
        let pc = null;
        for (let j = ai + 1; j < blk.length && j <= ai + 4; j++) {
          const m = blk[j].match(/(\d{5})\s+([A-Za-z][A-Za-z .'\-]*)$/);
          if (m) { pc = m; break; }
          if (/^(office tel|residence tel|payee|assignee)/i.test(blk[j]) && !/[A-Z]{3,}/.test(blk[j].replace(/office tel|residence tel/i, ''))) break;
          parts.push(blk[j].replace(/^(office|residence) tel\s*[-–]?\s*/i, ''));
        }
        const street = parts.join(' ').replace(/\s+/g, ' ').replace(/^[-–\s]+/, '').trim();
        if (street) {
          const sp = splitAddress(street + (pc ? `, ${pc[1]} ${pc[2].trim()}` : ''));
          Object.assign(out, { address1: sp.address1 });
          if (sp.address2) out.address2 = sp.address2;
          if (sp.address3) out.address3 = sp.address3;
          if (sp.postcode) out.postcode = sp.postcode;
          if (sp.town) out.town = sp.town;
          if (sp.state) out.state = sp.state;
          out.country = 'Malaysia';
        }
      }
    }
    return out;
  }

  // GE policy summary: the customer's details end where the coverage tables begin.
  const cut = lines.findIndex(l => /^coverage snapshot/i.test(l));
  if (cut > 0) lines.splice(cut);
  const dobM = lines.join('\n').match(/date of birth(?:\s*\/\s*age)?\s*[:\n ]\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{4})/i);
  if (dobM) { const d = dobM[1].replace(/[.-]/g, '/').replace(/^(\d)\//, '0$1/').replace(/\/(\d)\//, '/0$1/'); out.laDob = d; out.ownerDob = d; }

  // A heading line ("NOMINEE DETAILS", "Particulars of Trustee 2") starts a section about that person.
  let section = null, firstOther = lines.length;
  const counts = {};
  lines.forEach((line, i) => {
    // "Nominee(s) Mother / NAME / Father / NAME" (policy summary)
    const nm = line.match(/^nominee\(?s\)?\s*[:\-]?\s*(.+\/.+)$/i);
    if (nm) {
      splitNominees(nm[1]).slice(0, 2).forEach((n, j) => {
        if (n.name) out[`nominee${j + 1}Name`] = n.name;
        if (n.relationship) out[`nominee${j + 1}Relationship`] = n.relationship.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
      });
      return;
    }
    const role = roleOf(line);
    const isHeading = role && line.length < 70 && !/[:=]\s*\S/.test(line) && !NRIC_RE.test(line);
    if (isHeading) {
      const explicit = (line.match(/\b([12])(st|nd)?\b/) || [])[1];
      counts[role] = explicit ? +explicit : Math.min((counts[role] || 0) + 1, 2);
      section = { role, n: counts[role] };
      if (role !== 'owner' && firstOther === lines.length) firstOther = i;
      return;
    }
    // "Label: value" / "Label - value"
    const m = line.match(/^([^:=]{1,50}?)\s*[:=]\s*(.+)$/) || line.match(/^(.{2,50}?)\s+[-–]\s+(.+)$/);
    if (m && set(labelKey(m[1], section), m[2])) return;
    // Label on one line, value on the next
    const k = labelKey(line, section);
    if (k && lines[i + 1] && !labelKey(lines[i + 1], section) && set(k, lines[i + 1])) return;
    // "Label value" without a colon
    const words = line.split(' ');
    for (let n = Math.min(6, words.length - 1); n >= 1; n--) {
      if (set(labelKey(words.slice(0, n).join(' '), section), words.slice(n).join(' '))) return;
    }
  });

  // Patterns anywhere in the customer's own part of the text (before any nominee / trustee / agent section).
  lines.splice(firstOther);
  const all = lines.join('\n');
  if (!out.ownerNric) set('ownerNric', all);
  if (!out.email) set('email', all);
  if (!out.mobile) { const p = all.match(/(?:\+?6)?01\d[\s-]?\d{3,4}[\s-]?\d{4}\b/); if (p) set('mobile', p[0]); }

  // MyKad / address block: name after the NRIC line, then address lines down to "postcode town".
  const icLine = lines.findIndex(l => nric(l));
  const pcLine = lines.findIndex((l, i) => i > icLine && /^\d{5}\s+[A-Za-z]/.test(l));
  if (icLine >= 0) {
    let i = icLine + 1;
    const nameParts = [];
    // Up to two all-capital lines without digits (the address starts with a house number).
    while (i < lines.length && nameParts.length < 2 && /^[A-Z@'\/.\- ]{3,}$/.test(lines[i]) && !CARD_WORDS.test(lines[i]) && (pcLine < 0 || i < pcLine)) {
      nameParts.push(lines[i++]);
    }
    if (nameParts.length && !out.ownerName) set('ownerName', nameParts.join(' '));
    if (pcLine > i && !out.address1) {
      const addr = lines.slice(i, pcLine).filter(l => !CARD_WORDS.test(l));
      if (addr.length) { out.address1 = addr.slice(0, Math.ceil(addr.length / 2)).join(', '); if (addr.length > 1) out.address2 = addr.slice(Math.ceil(addr.length / 2)).join(', '); }
    }
  }
  const pc = pcLine >= 0 ? pcLine : lines.findIndex(l => /^\d{5}\s+[A-Za-z]/.test(l) || /,\s*\d{5}\s+[A-Za-z]/.test(l));
  if (pc >= 0) {
    const m = lines[pc].match(/(\d{5})\s+([A-Za-z][A-Za-z .,'\-]*)$/);
    if (m) {
      let town = m[2].trim().replace(/,?\s*malaysia\.?$/i, '');
      const st = town.match(STATE_RE) || (lines[pc + 1] || '').match(STATE_RE);
      if (st) { if (!out.state) out.state = st[1].replace(/\s+/g, ' '); town = town.replace(STATE_RE, ''); }
      town = town.split(',')[0].trim();
      if (!out.postcode) out.postcode = m[1];
      if (town && !out.town) out.town = town;
      if (!out.country) out.country = 'Malaysia';
      // A one-line address keeps only the street part.
      if (out.address1 && out.address1.includes(m[1])) out.address1 = out.address1.slice(0, out.address1.indexOf(m[1])).replace(/[,\s]+$/, '');
    }
  }
  // A single long address line: split it into lines of at most 34 characters.
  if (out.address1 && out.address1.length > 34 && !out.address2) {
    const sp = splitAddress(out.address1 + (out.postcode && !out.address1.includes(out.postcode) ? `, ${out.postcode} ${out.town || ''}` : ''));
    out.address1 = sp.address1; if (sp.address2) out.address2 = sp.address2; if (sp.address3) out.address3 = sp.address3;
    if (!out.postcode && sp.postcode) out.postcode = sp.postcode;
    if (!out.town && sp.town) out.town = sp.town;
    if (!out.state && sp.state) out.state = sp.state;
  }
  // Policy Summary: the life assured is the policyholder
  if (/policy summary/i.test(String(text)) || (out.laName && !out.ownerName)) {
    if (out.laName && !out.ownerName) out.ownerName = out.laName;
    if (out.laDob && !out.ownerDob) out.ownerDob = out.laDob;
    if (out.laGender && !out.ownerGender) out.ownerGender = out.laGender;
  }
  if (!out.ownerGender) { if (/\bLELAKI\b/.test(all)) out.ownerGender = 'Male'; else if (/\bPEREMPUAN\b/.test(all)) out.ownerGender = 'Female'; }
  // "Address: same with life assured" for a nominee / trustee is not an address but a request to copy the customer's own
  for (const k of Object.keys(out)) {
    if (/^(nominee|trustee)\dAddress$/.test(k) && /^(address\s*)?\(?\s*(same\s+(as|with)|sama\s+dengan)\b/i.test(out[k])) { delete out[k]; out[k.replace(/Address$/, 'SameAddress')] = 'Yes'; }
  }
  return out;
}
