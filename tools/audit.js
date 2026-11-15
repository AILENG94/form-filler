// Dev: list blanks (underlines, letter-box rows, tick boxes) on each form that no layout field covers.
//   node tools/audit.js [file-substring]      -> one line per uncovered blank, with the text nearest to it
import { allForms, buildLayout, pageGeo, loadFixes, fixFor } from './layout-kit.js';

const SKIP = /signature|tandatangan|stamp|cop syarikat|office use|kegunaan pejabat|company chop/i;

function covered(layout, page, x0, y0, x1, y1) {
  return layout.some(f => {
    if (f.page !== page) return false;
    let a, b, c, d;
    if (f.type === 'comb') { a = f.cells[0].x; c = f.cells.at(-1).x + f.cells.at(-1).w; b = f.y; d = f.y + f.h; }
    else if (f.type === 'check') { a = f.x - 1; c = f.x + f.size + 1; b = f.y - 1; d = f.y + f.size + 1; }
    else { a = f.x - 4; c = f.x + (f.w || 100); b = f.y - 4; d = f.y + 11; }
    return a < x1 - 1 && c > x0 + 1 && b < y1 + 1 && d > y0 - 1;
  });
}

const only = process.argv[2];
let total = 0;
for (const form of allForms()) {
  if (only && !form.file.includes(only)) continue;
  const { pdf, layout } = await buildLayout(form, fixFor(await loadFixes(), form));
  const rows = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const g = await pageGeo(form, pdf, p);
    const near = (x, y, h) => {
      const left = g.runs.filter(r => r.x + r.w <= x + 3 && Math.abs(r.y + r.h * 0.35 - (y + h / 2)) < h / 2 + 4 && x - (r.x + r.w) < 520).sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
      const above = g.runs.filter(r => r.y > y + h && r.y - (y + h) < 22 && r.x < x + 60 && r.x + r.w > x - 10).sort((a, b) => a.y - b.y)[0];
      return ((left ? left.str : '') + (above ? '  ^' + above.str : '')).slice(0, 90);
    };
    const edge = s => g.rows.some(r => (Math.abs(r.y - s.y) < 1.5 || Math.abs(r.y + r.h - s.y) < 1.5) && r.cells[0].x < s.x2 - 2 && r.cells.at(-1).x + r.cells.at(-1).w > s.x + 2);
    const wall = (x, y1, y2) => g.vs.some(v => Math.abs(v.x - x) < 2 && v.y1 <= y1 + 1 && v.y2 >= y2 - 1);
    for (const s of g.lines) {
      const w = s.x2 - s.x1;
      if (w < 30 || w > 480 || s.y < 40 || s.y > 800) continue;
      if (edge(s)) continue;
      // table / frame border: has side walls reaching down to another line
      if (g.lines.some(t => t !== s && t.y < s.y - 5 && s.y - t.y < 200 && Math.abs(t.x1 - s.x1) < 2 && Math.abs(t.x2 - s.x2) < 2 && wall(s.x1, t.y, s.y))) continue;
      if (covered(layout, p, s.x1, s.y - 1, s.x2, s.y + 10)) continue;
      // underlined heading text, or the line a signature is written on
      if (g.runs.some(r => r.y > s.y - 1 && r.y < s.y + 10 && r.x >= s.x1 - 6 && r.x + r.w <= s.x2 + 6 && r.w > (s.x2 - s.x1) * 0.6 && r.str.trim().length > 3)) continue;
      if (g.runs.some(r => /signature|tandatangan|stamp|cop /i.test(r.str) && r.y < s.y && s.y - r.y < 30 && r.x < s.x2 && r.x + r.w > s.x1)) continue;
      if (g.runs.length && g.lines.filter(t => Math.abs(t.y - s.y) < 0.8 && Math.abs(t.x1 - s.x1) < 1).length > 1 && false) continue;
      const n = near(s.x1, s.y, 8);
      if (SKIP.test(n)) continue;
      rows.push(`p${p} LINE  x${s.x1.toFixed(0)}-${s.x2.toFixed(0)} y${s.y.toFixed(0)}  ${n}`);
    }
    for (const r of g.rows) {
      const c0 = r.cells[0], x1 = r.cells.at(-1).x + r.cells.at(-1).w;
      if (r.y < 40 || r.y > 800) continue;
      if (r.cells.length === 1 && c0.w < 5) continue;
      if (covered(layout, p, c0.x, r.y, x1, r.y + r.h)) continue;
      const n = near(c0.x, r.y, r.h);
      if (SKIP.test(n)) continue;
      rows.push(`p${p} ${r.cells.length === 1 ? 'TICK ' : 'BOXES'} x${c0.x.toFixed(0)}-${x1.toFixed(0)} y${r.y.toFixed(0)}  n=${r.cells.length}  ${n}`);
    }
  }
  total += rows.length;
  console.log(`\n# ${form.file}: ${rows.length} uncovered`);
  for (const r of rows) console.log('  ' + r);
}
console.log('\nTOTAL', total);
process.exit(0);
