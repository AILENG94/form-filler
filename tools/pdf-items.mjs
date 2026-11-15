// Dev: raw text items with positions for the first rows of a PDF page.  node tools/pdf-items.mjs <file.pdf> [rows] [page]
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const pdfjs = await import(pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), verbosity: 0 }).promise;
const tc = await (await doc.getPage(+process.argv[4] || 1)).getTextContent(); const rows = [];
for (const it of tc.items.filter(t => t.str.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
  let r = rows.find(r => Math.abs(r.y - it.transform[5]) < 3); if (!r) rows.push(r = { y: it.transform[5], items: [] }); r.items.push(it);
}
rows.sort((a, b) => b.y - a.y).slice(0, +process.argv[3] || 12).forEach(r => console.log(r.y.toFixed(1), r.items.sort((a, b) => a.transform[4] - b.transform[4]).map(i => `[${i.transform[4].toFixed(0)}+${i.width.toFixed(0)} h${Math.hypot(i.transform[2], i.transform[3]).toFixed(0)}] ${i.str}`).join('  ')));
process.exit(0);
