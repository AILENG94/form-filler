// Dev: list box rows / underlines with the nearest label, plus detected fields.  node tools/list.js <file-substring> [pages]
import { allForms, buildLayout, pageGeo, loadFixes, fixFor } from './layout-kit.js';
const [sub, pagesArg] = process.argv.slice(2);
const form = allForms().find(f => f.file.includes(sub));
const { pdf, layout } = await buildLayout(form, fixFor(await loadFixes(), form));
const pages = pagesArg ? pagesArg.split(',').map(Number) : Array.from({ length: pdf.numPages }, (_, i) => i + 1);
const short = s => s.length > 38 ? s.slice(0, 36) + '…' : s;
console.log(`# ${form.file}  (${pdf.numPages} pages)`);
for (const p of pages) {
  const g = await pageGeo(form, pdf, p);
  // label: nearest text to the left on the same line, else just above
  const labelFor = (x, y, h) => {
    const same = g.runs.filter(r => r.x < x && Math.abs(r.y - (y + h / 2 - 3)) < h / 2 + 3).sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
    const above = g.runs.filter(r => r.y > y + h && r.y - (y + h) < 14 && Math.abs(r.x - x) < 60).sort((a, b) => a.y - b.y)[0];
    return (same ? short(same.str) : '') + (above ? ` ^${short(above.str)}` : '');
  };
  console.log(`\n## page ${p}`);
  g.rows.forEach((r, i) => console.log(`R${i}\ty=${r.y.toFixed(0)} x=${r.cells[0].x.toFixed(0)} n=${r.cells.length} w=${r.cells[0].w.toFixed(1)}\t${labelFor(r.cells[0].x, r.y, r.h)}`));
  g.lines.forEach((s, i) => { if (s.x2 - s.x1 < 520) console.log(`L${i}\ty=${s.y.toFixed(0)} x=${s.x1.toFixed(0)}-${s.x2.toFixed(0)}\t${labelFor(s.x1 + 2, s.y, 10)}`); });
  for (const f of layout.filter(f => f.page === p)) console.log(`  F ${f.type} ${f.key} <- ${f.label || ''} @${(f.type === 'comb' ? f.cells[0].x : f.x).toFixed(0)},${f.y.toFixed(0)}`);
}
