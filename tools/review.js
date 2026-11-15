// Dev: render form pages with box rows (blue, numbered), underlines (green, numbered) and layout fields (red).
//   node tools/review.js <file-substring> [pages e.g. 1,3] [outDir]
import fs from 'fs'; import path from 'path';
import { createCanvas } from '@napi-rs/canvas';
import { allForms, buildLayout, pageGeo, loadFixes, fixFor, pdfjs } from './layout-kit.js';
import * as PDFLib from 'pdf-lib';
import { fillPdf } from '../public/fill.js';
const FILL = process.env.FILL === '1';

const [sub, pagesArg, outDir = process.env.REVIEW_DIR || 'review'] = process.argv.slice(2);
const form = allForms().find(f => f.file.includes(sub));
if (!form) throw new Error('No form matching ' + sub);
let { pdf, layout } = await buildLayout(form, fixFor(await loadFixes(), form));
const geoPdf = pdf;
if (FILL) {
  const sample = JSON.parse(fs.readFileSync(process.env.SAMPLE || new URL('./sample-customer.json', import.meta.url), 'utf8'));
  const bytes = await fillPdf(PDFLib, fs.readFileSync(form.path), layout, { ...sample, signDate: '01/11/2026' });
  pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0, standardFontDataUrl: path.resolve('node_modules/pdfjs-dist/standard_fonts') + '/' }).promise;
}
fs.mkdirSync(outDir, { recursive: true });
const pages = pagesArg ? pagesArg.split(',').map(Number) : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
const S = process.env.CROP ? 2 : FILL ? 1.25 : 1.6;
for (const p of pages) {
  const page = await pdf.getPage(p);
  const vp = page.getViewport({ scale: S });
  const canvas = createCanvas(vp.width, vp.height);
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const X = x => (x - page.view[0]) * S, Y = y => (page.view[3] - y) * S;
  const geo = await pageGeo(form, geoPdf, p);
  if (FILL) {
    let out = canvas;
    if (process.env.CROP) { // CROP=x0,yTop,x1,yBottom in PDF points
      const [a, b, c, d] = process.env.CROP.split(",").map(Number);
      out = createCanvas((c - a) * S, (b - d) * S);
      out.getContext("2d").drawImage(canvas, X(a), Y(b), (c - a) * S, (b - d) * S, 0, 0, (c - a) * S, (b - d) * S);
    }
    fs.writeFileSync(path.join(outDir, `p${p}.png`), out.toBuffer("image/png")); console.log(path.join(outDir, `p${p}.png`)); continue;
  }
  ctx.font = 'bold 10px Arial';
  geo.rows.forEach((r, i) => {
    const x0 = r.cells[0].x, x1 = r.cells.at(-1).x + r.cells.at(-1).w;
    ctx.strokeStyle = 'rgba(0,90,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(X(x0), Y(r.y + r.h), (x1 - x0) * S, r.h * S);
    ctx.fillStyle = 'rgba(0,70,230,.95)'; ctx.fillText(`R${i}:${r.cells.length}`, X(x1) + 2, Y(r.y) - 1);
  });
  geo.lines.forEach((s, i) => { ctx.fillStyle = 'rgba(0,140,0,.95)'; ctx.fillText(`L${i}`, X(s.x2) + 2, Y(s.y) + 4); });
  for (const f of layout.filter(f => f.page === p)) {
    ctx.strokeStyle = 'red'; ctx.lineWidth = 2; ctx.fillStyle = 'rgba(220,0,0,.95)'; ctx.font = 'bold 11px Arial';
    if (f.type === 'comb') { const a = f.cells[0].x, b = f.cells.at(-1).x + f.cells.at(-1).w; ctx.strokeRect(X(a), Y(f.y + f.h), (b - a) * S, f.h * S); ctx.fillText(f.key, X(a) + 2, Y(f.y + f.h) - 2); }
    else if (f.type === 'check') { ctx.strokeRect(X(f.x), Y(f.y + f.size), f.size * S, f.size * S); ctx.fillText(`${f.key}=${f.when}`, X(f.x) + 12, Y(f.y)); }
    else { ctx.strokeRect(X(f.x), Y(f.y + 9), (f.w || 100) * S, 11 * S); ctx.fillText(f.key, X(f.x) + 2, Y(f.y) - 1); }
  }
  const out = path.join(outDir, `p${p}.png`);
  fs.writeFileSync(out, canvas.toBuffer('image/png'));
  console.log(out, `rows=${geo.rows.length} lines=${geo.lines.length} fields=${layout.filter(f => f.page === p).length}`);
}
