// Dev: dump runs and segments near a label.  node tools/dump.js <file-substring> <page> <label>
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const pdfjs = await import(pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const { extractPage } = await import('../public/detect.js');
const [sub, pg, label] = process.argv.slice(2);
for (const cat of fs.readdirSync('Forms')) for (const f of fs.readdirSync(path.join('Forms', cat))) {
  if (!f.includes(sub)) continue;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path.join('Forms', cat, f))), verbosity: 0 }).promise;
  const g = await extractPage(await pdf.getPage(+pg), pdfjs.OPS);
  for (const r of g.runs.filter(r => r.str.includes(label))) {
    console.log('RUN', r.str, r.x.toFixed(1), r.y.toFixed(1), 'w', r.w.toFixed(1), 'h', r.h.toFixed(1));
    console.log(' V', g.vs.filter(v => Math.abs((v.y1 + v.y2) / 2 - r.y) < 15 && v.x > r.x).map(v => `${v.x.toFixed(1)}[${v.y1.toFixed(0)}-${v.y2.toFixed(0)}]`).join(' '));
    console.log(' H', g.hs.filter(h => Math.abs(h.y - r.y) < 12).map(h => `${h.y.toFixed(1)}:${h.x1.toFixed(0)}-${h.x2.toFixed(0)}`).join(' '));
  }
}
