// Dev check: auto-detect every form, fill with a sample customer, write to test-output/.
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
import * as PDFLib from 'pdf-lib';
const pdfjs = await import(pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const { detectLayout } = await import('../public/detect.js');
const { fillPdf } = await import('../public/fill.js');
const sample = JSON.parse(fs.readFileSync('tools/sample-customer.json', 'utf8'));
const only = process.argv[2];
fs.mkdirSync('test-output', { recursive: true }); // dev output, safe to delete
for (const cat of fs.readdirSync('Forms')) for (const f of fs.readdirSync(path.join('Forms', cat))) {
  if (only && !f.includes(only)) continue;
  const bytes = fs.readFileSync(path.join('Forms', cat, f));
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes), verbosity: 0 }).promise;
  const layout = await detectLayout(pdf, pdfjs.OPS);
  console.log(`\n== ${cat} / ${f}: ${layout.length} fields`);
  for (const l of layout) console.log(`  p${l.page} ${l.type.padEnd(4)} ${l.key.padEnd(14)} <- "${l.label}"${l.type === 'comb' ? ' cells=' + l.cells.length : ''}`);
  fs.writeFileSync(path.join('test-output', f), await fillPdf(PDFLib, bytes, layout, sample));
}
