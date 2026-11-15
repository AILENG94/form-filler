// Fills every saved layout with the sample customer; reports errors, unknown details, and fields off the page.
import fs from 'fs'; import path from 'path';
import * as PDFLib from 'pdf-lib';
import { allForms, ROOT } from './layout-kit.js';
import { fillPdf } from '../public/fill.js';
import { FIELD_BY_KEY } from '../public/fields.js';
const sample = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sample-customer.json'), 'utf8'));
let bad = 0;
for (const form of allForms()) {
  const file = path.join(ROOT, 'layouts', form.id.replace(/[^\w\- ()&.]+/g, '_') + '.json');
  if (!fs.existsSync(file)) { console.log('MISSING', form.file); bad++; continue; }
  const { fields } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const doc = await PDFLib.PDFDocument.load(fs.readFileSync(form.path));
  const problems = [];
  for (const f of fields) {
    if (f.type !== 'static' && !f.item && !/^q_/.test(f.key) && !FIELD_BY_KEY[f.key]) problems.push('unknown detail ' + f.key);
    const page = doc.getPages()[f.page - 1];
    if (!page) { problems.push('no page ' + f.page); continue; }
    const { width, height } = page.getSize();
    const x = f.type === 'comb' ? f.cells[0].x : f.x;
    if (!(x >= 0 && x < width && f.y >= 0 && f.y < height)) problems.push(`${f.key} off page`);
  }
  try { await fillPdf(PDFLib, fs.readFileSync(form.path), fields, { ...sample, signDate: '01/11/2026' }); } catch (e) { problems.push('fill error ' + e.message); }
  if (problems.length) { bad++; console.log('PROBLEM', form.file, problems.join('; ')); }
}
console.log(bad ? `${bad} form(s) with problems` : 'All forms fill cleanly.');
process.exit(0);
