// Dev: per form/page counts of box rows, short underlines and detected fields, plus the page heading.
import { allForms, buildLayout, pageGeo, loadFixes } from './layout-kit.js';
const fixes = await loadFixes();
const only = process.argv[2];
for (const form of allForms()) {
  if (only && !form.folder.includes(only)) continue;
  const { pdf, layout } = await buildLayout(form, {});
  const parts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const g = await pageGeo(form, pdf, p);
    const rows = g.rows.filter(r => r.cells.length > 1).length, ticks = g.rows.filter(r => r.cells.length === 1 && r.cells[0].w < 14).length;
    const lines = g.lines.filter(s => s.x2 - s.x1 < 400).length;
    parts.push(`p${p}[b${rows} t${ticks} l${lines} f${layout.filter(f => f.page === p).length}]`);
  }
  console.log(`${form.folder} | ${form.file.slice(0, 50)} | ${parts.join(' ')}`);
}
