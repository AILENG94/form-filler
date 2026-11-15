// Dev: show the text lines and what parseDetails finds in a PDF.  node tools/pdf-peek.mjs <file.pdf> [maxLines]
import fs from 'fs'; import path from 'path'; import { pathToFileURL } from 'url';
const pdfjs = await import(pathToFileURL(path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const { parseDetails, linesFromItems } = await import('../public/extract.js');
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(process.argv[2])), verbosity: 0 }).promise;
const out = [];
for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
  const tc = await (await doc.getPage(p)).getTextContent();
  out.push(...linesFromItems(tc.items));
}
console.log('pages', doc.numPages, 'lines', out.length);
console.log(out.slice(0, +process.argv[3] || 40).join('\n'));
console.log('--- parsed ---'); console.log(parseDetails(out.join('\n')));
process.exit(0);
