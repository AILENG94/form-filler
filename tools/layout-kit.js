// Dev kit for building the saved layouts: auto-detect each form, then apply the per-form fixes in form-fixes.js.
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pdfjs = await import(pathToFileURL(path.join(ROOT, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
const { detectLayout, extractPage } = await import(pathToFileURL(path.join(ROOT, 'public/detect.js')).href);
const { findItems, findLeftovers, keyItems } = await import(pathToFileURL(path.join(ROOT, 'tools/form-items.js')).href);
const { matchLabel } = await import(pathToFileURL(path.join(ROOT, 'public/fields.js')).href);
export { pdfjs };

export function allForms() {
  const out = [];
  for (const folder of fs.readdirSync(path.join(ROOT, 'Forms'))) {
    for (const f of fs.readdirSync(path.join(ROOT, 'Forms', folder)).filter(f => /\.pdf$/i.test(f)).sort()) {
      out.push({ folder, file: f, id: `${folder}__${f.replace(/\.pdf$/i, '')}`, path: path.join(ROOT, 'Forms', folder, f) });
    }
  }
  return out;
}

export async function openPdf(form) {
  return pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(form.path)), verbosity: 0, standardFontDataUrl: path.join(ROOT, 'node_modules/pdfjs-dist/standard_fonts') + '/' }).promise;
}

// Rows of letter boxes anywhere on the page: vertical strokes of equal height in an evenly spaced chain.
export function boxRows(geo) {
  // Group strokes with (nearly) the same top and bottom.
  const groups = [];
  for (const v of geo.vs.filter(v => v.y2 - v.y1 >= 6 && v.y2 - v.y1 <= 30).sort((a, b) => a.y1 - b.y1)) {
    const g = groups.find(g => Math.abs(g[0].y1 - v.y1) < 1.6 && Math.abs(g[0].y2 - v.y2) < 1.6);
    g ? g.push(v) : groups.push([v]);
  }
  const rows = [];
  for (const vs of groups) {
    const xs = [...new Set(vs.map(v => Math.round(v.x * 2) / 2))].sort((a, b) => a - b);
    let chain = [xs[0]];
    const flush = () => {
      if (chain.length >= 2) {
        const y1 = vs[0].y1, y2 = vs[0].y2;
        // A real box has a top and a bottom edge; the gap holding a printed "/" or "-" does not.
        const edged = (x, w, y) => geo.hs.some(s => Math.abs(s.y - y) < 1.2 && s.x1 <= x + 1.5 && s.x2 >= x + w - 1.5);
        const cells = [];
        for (let i = 1; i < chain.length; i++) {
          const x = chain[i - 1], w = chain[i] - chain[i - 1];
          if (edged(x, w, y1) && edged(x, w, y2)) cells.push({ x, w });
        }
        if (!cells.length) return;
        rows.push({ y: vs[0].y1, h: vs[0].y2 - vs[0].y1, cells });
      }
    };
    for (let i = 1; i < xs.length; i++) {
      const g = xs[i] - xs[i - 1];
      if (g >= 6 && g <= 28 && (chain.length < 2 || Math.abs(g - (chain[1] - chain[0])) < 4)) chain.push(xs[i]);
      else if (g < 1) continue;
      else { flush(); chain = [xs[i]]; }
    }
    flush();
  }
  rows.sort((a, b) => b.y - a.y || a.cells[0].x - b.cells[0].x);
  return rows;
}

export function underlines(geo) {
  return geo.hs.filter(s => s.x2 - s.x1 > 40).sort((a, b) => b.y - a.y || a.x1 - b.x1)
    .filter((s, i, arr) => !arr.slice(0, i).some(o => Math.abs(o.y - s.y) < 0.6 && Math.abs(o.x1 - s.x1) < 1 && Math.abs(o.x2 - s.x2) < 1));
}

const geoCache = new Map();
export async function pageGeo(form, pdf, p) {
  const k = form.id + '#' + p;
  if (!geoCache.has(k)) {
    const geo = await extractPage(await pdf.getPage(p), pdfjs.OPS);
    geo.rows = boxRows(geo);
    geo.lines = underlines(geo);
    geoCache.set(k, geo);
  }
  return geoCache.get(k);
}

// ---- applying fixes ----
// A fix file entry (see form-fixes.js):
//   drop:  [{ page, key?, label? }]            remove detected fields
//   keep:  [{ page, key?, label? }]            keep only these detected fields (others dropped)
//   rekey: [{ page, key?, label?, to }]        change a detected field's detail
//   rows:  [{ page, row, key, from?, n? }]     fill a box row (by index from the review image); from/n pick part of it
//   lines: [{ page, line, key, x?, size? }]    write on an underline (by index)
//   text:  [{ page, x, y, w, key, size? }]     free text position
//   ticks: [{ page, row?|x,y, key, when }]     tick mark (row: centre of that single box)
const matches = (f, m) => f.page === m.page && (!m.key || f.key === m.key) && (!m.label || f.label === m.label);

export async function buildLayout(form, fix = {}) {
  const pdf = await openPdf(form);
  let layout = fix.manualOnly ? [] : await detectLayout(pdf, pdfjs.OPS);
  // Snap detected letter-box fields onto the exact box row they sit on.
  for (const f of layout.filter(f => f.type === 'comb')) {
    const geo = await pageGeo(form, pdf, f.page);
    const x0 = f.cells[0].x, x1 = f.cells.at(-1).x + f.cells.at(-1).w;
    // All box groups on this line within the field's span (DD / MM / YYYY, or NRIC 6-2-4), real boxes only.
    const rows = geo.rows.filter(r => r.cells.length > 1 && r.y < f.y + f.h && r.y + r.h > f.y && r.cells[0].x < x1 - 2 && r.cells.at(-1).x + r.cells.at(-1).w > x0 + 2);
    if (rows.length) {
      const main = rows.sort((a, b) => b.cells.length - a.cells.length)[0];
      const same = rows.filter(r => Math.abs(r.y - main.y) < 2 && Math.abs(r.h - main.h) < 2);
      const cells = same.flatMap(r => r.cells).sort((a, b) => a.x - b.x).filter((c, i, a) => !i || c.x - a[i - 1].x > 2);
      Object.assign(f, { y: main.y, h: main.h, cells });
    }
  }
  if (fix.keep) layout = layout.filter(f => fix.keep.some(m => matches(f, m)));
  for (const m of fix.drop || []) layout = layout.filter(f => !matches(f, m));
  for (const m of fix.rekey || []) for (const f of layout) if (matches(f, m)) f.key = m.to;
  for (const r of [...(fix.rows || []), ...(fix.rows2 || [])]) {
    const geo = await pageGeo(form, pdf, r.page);
    // row: one index, or several (e.g. day/month/year groups) joined into one field.
    // span: [first, last] = evenly spaced boxes from the first row's start to the last row's end (for rows drawn in chunks).
    const ids = [].concat(r.span || r.row);
    const row = geo.rows[ids[0]];
    if (ids.some(i => !geo.rows[i])) throw new Error(`${form.file}: no box row ${ids} on page ${r.page}`);
    let cells;
    if (r.span) {
      const a = geo.rows[r.span[0]], b = geo.rows[r.span[1]];
      const x0 = a.cells[0].x, x1 = b.cells.at(-1).x + b.cells.at(-1).w;
      const ws = [a, b].flatMap(x => x.cells.map(c => c.w)).sort((p, q) => p - q);
      const n = Math.round((x1 - x0) / ws[Math.floor(ws.length / 2)]), w = (x1 - x0) / n;
      cells = Array.from({ length: n }, (_, i) => ({ x: x0 + i * w, w }));
    } else cells = ids.flatMap(i => geo.rows[i].cells).sort((a, b) => a.x - b.x);
    cells = cells.slice(r.from || 0, r.n ? (r.from || 0) + r.n : undefined);
    layout.push({ key: r.key, page: r.page, type: 'comb', cells, y: row.y, h: row.h, ...(r.size ? { size: r.size } : {}),
      ...(r.ifDiff ? { ifDiff: r.ifDiff } : {}), ...(r.cont ? { cont: true } : {}), ...(r.right ? { right: true } : {}), ...(r.skipIf ? { skipIf: r.skipIf } : {}) });
  }
  for (const l of [...(fix.lines || []), ...(fix.lines2 || [])]) {
    const geo = await pageGeo(form, pdf, l.page);
    const s = geo.lines[l.line];
    if (!s) throw new Error(`${form.file}: no line ${l.line} on page ${l.page}`);
    const x = l.x ?? s.x1 + 3;
    layout.push({ key: l.key, page: l.page, type: 'text', x, y: s.y + 2, w: (l.x2 ?? s.x2) - x - 2, size: l.size || 9,
      ...(l.ifDiff ? { ifDiff: l.ifDiff } : {}), ...(l.skipIf ? { skipIf: l.skipIf } : {}) });
  }
  for (const t of [...(fix.text || []), ...(fix.text2 || [])]) layout.push({ type: 'text', size: 9, w: 200, ...t });
  for (const t of [...(fix.ticks || []), ...(fix.ticks2 || [])]) {
    if (t.row != null) {
      const geo = await pageGeo(form, pdf, t.page);
      const row = geo.rows[t.row], c = row.cells[t.cell || 0];
      const s = Math.min(9, row.h * 0.8);
      layout.push({ key: t.key, when: t.when, page: t.page, type: 'check', x: c.x + (c.w - s) / 2, y: row.y + (row.h - s) / 2, size: s });
    } else layout.push({ type: 'check', size: 8, ...t });
  }
  // Every other fill-in item on the form (questions, "Dated at", Others …), typed or ticked in the app.
  // fix.items: false to skip; fix.dropItems: [regex on label | { page }]; fix.renameItems: { "old label": "new label" }.
  if (fix.items !== false && !fix.manualOnlyItems) {
    let items = [];
    const ctx = { counts: {} };
    for (let p = 1; p <= pdf.numPages && fix.finder !== false; p++) {
      const page = await pdf.getPage(p);
      items.push(...findItems(await pageGeo(form, pdf, p), p, layout, page.view[2] - page.view[0], ctx));
    }
    items = items.filter(f => !/^(NBZ|CLM|CSD|GMBS|GHI)-[A-Za-z0-9-]+$/.test(f.item.label)); // form code in the footer
    // fix.healthRows: { pages: [..], cols: [x of the 6 Yes/No columns], persons: [..], minX } the Yes / No tick grid of the health questions.
    if (fix.healthRows) {
      const H = fix.healthRows;
      for (const p of H.pages) {
        const geo = await pageGeo(form, pdf, p);
        const ticks = geo.rows.filter(r => r.cells.length === 1 && r.cells[0].w >= 5 && r.cells[0].w <= 12 && r.h >= 5 && r.h <= 13 && r.cells[0].x > H.minX && r.y > 60 && r.y < 790);
        const lines = [];
        for (const t of ticks.sort((a, b) => b.y - a.y)) { const g = lines.find(l => Math.abs(l.y - t.y) < 3); g ? g.boxes.push(t) : lines.push({ y: t.y, boxes: [t] }); }
        for (const ln of lines) {
          // question text: the English line level with / just above the boxes, left of the tick grid
          const near = geo.runs.filter(r => r.x < H.minX - 20 && r.y > ln.y - 2 && r.y < ln.y + 18 && /^[A-Z0-9(]/.test(r.str) || (r.x < 60 && r.y > ln.y - 2 && r.y < ln.y + 18));
          const top = near.sort((a, b) => b.y - a.y)[0];
          const text = top ? geo.runs.filter(r => Math.abs(r.y - top.y) < 2 && r.x < H.minX - 20).sort((a, b) => a.x - b.x).map(r => r.str).join(' ') : '';
          let q = text.replace(/^\s*\d+\.?\s*/, '').replace(/\s+/g, ' ').trim();
          if (q.length > 105) q = q.slice(0, 102).replace(/\s\S*$/, '') + '…';
          if (!q || q.length < 4) q = `Health question on page ${p} (y ${Math.round(ln.y)})`;
          const nr = (text.match(/^\s*(\d+)\./) || [])[1];
          const used = new Set();
          for (const b of ln.boxes.sort((a, b) => a.cells[0].x - b.cells[0].x)) {
            const x = b.cells[0].x;
            let idx = -1, best = 99;
            H.cols.forEach((cx, i) => { if (Math.abs(cx - x) < best) { best = Math.abs(cx - x); idx = i; } });
            if (best > 8 || used.has(idx)) continue;
            used.add(idx);
            const person = H.persons[Math.floor(idx / 2)], when = idx % 2 ? 'No' : 'Yes';
            const sz = Math.min(8.5, b.h * 0.8);
            items.push({ extra: true, type: 'check', page: p, x: x + (b.cells[0].w - sz) / 2, y: b.y + (b.h - sz) / 2, size: sz, when,
              item: { label: `${H.prefix || ''}${nr ? nr + '. ' : ''}${q} – ${person}`, kind: 'choice', options: ['Yes', 'No'] } });
          }
          // Boxes the page does not draw as separate shapes (the Assured / Spouse columns on some rows): same height, known columns.
          const ref = ln.boxes[0];
          H.cols.forEach((cx, idx) => {
            if (used.has(idx)) return;
            const person = H.persons[Math.floor(idx / 2)], when = idx % 2 ? 'No' : 'Yes';
            const w = ref.cells[0].w, sz = Math.min(8.5, ref.h * 0.8);
            items.push({ extra: true, type: 'check', page: p, x: cx + (w - sz) / 2, y: ref.y + (ref.h - sz) / 2, size: sz, when,
              item: { label: `${H.prefix || ''}${nr ? nr + '. ' : ''}${q} – ${person}`, kind: 'choice', options: ['Yes', 'No'] } });
          });
        }
      }
    }
    // fix.tables: [{ page, name, cols: [x0, x1, …], heads: [..], rows: [yTop, y1, …, yBottom] }] one text box per cell.
    for (const t of fix.tables || []) {
      for (let r = 0; r + 1 < t.rows.length; r++) {
        for (let c = 0; c + 1 < t.cols.length; c++) {
          const h = t.rows[r] - t.rows[r + 1];
          items.push({ extra: true, type: 'text', page: t.page, x: t.cols[c] + 3, y: t.rows[r + 1] + Math.max(3, h / 2 - 3), w: t.cols[c + 1] - t.cols[c] - 6, size: 8.5,
            item: { label: `${t.name} – ${t.heads[c]} (row ${r + 1})`, kind: 'text' } });
        }
      }
    }
    // fix.extraChoices: [{ page, label, boxes: [{ row, when }] }] a question whose tick boxes the finder missed or mislabelled.
    for (const e of fix.extraChoices || []) {
      const geo = await pageGeo(form, pdf, e.page);
      const options = e.boxes.map(b => b.when);
      for (const b of e.boxes) {
        // a box given by row index, or by position { x, y, w, h } (left, bottom, size) when it is not found as a row
        const row = b.row != null ? geo.rows[b.row] : { cells: [{ x: b.x, w: b.w || 7 }], y: b.y, h: b.h || b.w || 7 };
        const c = row.cells[0], s = Math.min(9, row.h * 0.8);
        items.push({ extra: true, type: 'check', page: e.page, x: c.x + (c.w - s) / 2, y: row.y + (row.h - s) / 2, size: s, when: b.when, item: { label: e.label, kind: 'choice', options } });
      }
    }
    // fix.itemRows: [{ page, row | span, label, cont?, right?, from?, n? }] a row of letter boxes as a form item.
    for (const r of fix.itemRows || []) {
      const geo = await pageGeo(form, pdf, r.page);
      const ids = [].concat(r.span || r.row), row = geo.rows[ids[0]];
      if (ids.some(i => !geo.rows[i])) throw new Error(`${form.file}: no box row ${ids} on page ${r.page}`);
      let cells;
      if (r.span) {
        const a = geo.rows[r.span[0]], b = geo.rows[r.span[1]];
        const x0 = a.cells[0].x, x1 = b.cells.at(-1).x + b.cells.at(-1).w;
        const ws = [a, b].flatMap(x => x.cells.map(c => c.w)).sort((p, q) => p - q);
        const n = Math.round((x1 - x0) / ws[Math.floor(ws.length / 2)]), w = (x1 - x0) / n;
        cells = Array.from({ length: n }, (_, i) => ({ x: x0 + i * w, w }));
      } else cells = ids.flatMap(i => geo.rows[i].cells).sort((p, q) => p.x - q.x);
      cells = cells.slice(r.from || 0, r.n ? (r.from || 0) + r.n : undefined);
      items.push({ extra: true, type: 'comb', page: r.page, cells, y: row.y, h: row.h, ...(r.cont ? { cont: true } : {}), ...(r.right ? { right: true } : {}), item: { label: r.label, kind: 'text' } });
    }
    // fix.itemTicks: [{ page, row | x,y, label, when }] tick boxes of one question (options = the 'when' values of that label).
    {
      const groups = new Map();
      for (const t of fix.itemTicks || []) { if (!groups.has(t.label)) groups.set(t.label, []); groups.get(t.label).push(t); }
      for (const [label, list] of groups) {
        const options = list.map(t => t.when);
        for (const t of list) {
          const geo = await pageGeo(form, pdf, t.page);
          const row = t.row != null ? geo.rows[t.row] : { cells: [{ x: t.x, w: t.w || 7 }], y: t.y, h: t.h || t.w || 7 };
          const c = row.cells[0], s = Math.min(9, row.h * 0.8);
          items.push({ extra: true, type: 'check', page: t.page, x: c.x + (c.w - s) / 2, y: row.y + (row.h - s) / 2, size: s, when: t.when, item: { label, kind: 'choice', options } });
        }
      }
    }
    // fix.itemText: [{ page, x, y, w, label, size? }] a write-in at a given position.
    for (const t of fix.itemText || []) items.push({ extra: true, type: 'text', page: t.page, x: t.x, y: t.y, w: t.w, size: t.size || 9, item: { label: t.label, kind: 'text' } });
    // fix.grids: [{ page, cols:[x…], heads:[…], rows:[{ top, bottom, label, map?:{ colIndex: detailKey } }], size? }]
    // one text box per cell, "label – head"; a mapped cell is that customer detail instead (e.g. the witness = the agent).
    for (const g of fix.grids || []) {
      for (const row of g.rows) {
        for (let c = 0; c + 1 < g.cols.length; c++) {
          const h = row.top - row.bottom;
          const cell = { type: 'text', page: g.page, x: g.cols[c] + 3, y: row.bottom + Math.max(3, h / 2 - 3), w: g.cols[c + 1] - g.cols[c] - 6, size: g.size || 8.5 };
          // a list of keys stacks them on separate lines inside the cell (e.g. a two-line address)
          if (row.map && Array.isArray(row.map[c])) row.map[c].forEach((key, i) => layout.push({ ...cell, key, size: row.size || cell.size, y: row.top - 8.5 - i * 8 }));
          else if (row.map && row.map[c]) layout.push({ ...cell, key: row.map[c] });
          else items.push({ extra: true, ...cell, item: { label: `${row.label} – ${g.heads[c]}`, kind: 'text' } });
        }
      }
    }
    // fix.extraItems: [{ page, line, label, x? }] adds a write-in line the finder missed.
    for (const e of fix.extraItems || []) {
      const s = (await pageGeo(form, pdf, e.page)).lines[e.line];
      if (!s) throw new Error(`${form.file}: no line ${e.line} on page ${e.page}`);
      const x = e.x ?? s.x1 + 3;
      items.push({ extra: true, type: 'text', page: e.page, x, y: s.y + 2, w: s.x2 - x - 2, size: 9, item: { label: e.label, kind: 'text' } });
    }
    // everything still uncovered (tables, extra lines, boxes the label rules missed) so no blank is left out
    if (fix.leftovers !== false && fix.finder !== false) {
      for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        items.push(...findLeftovers(await pageGeo(form, pdf, p), p, [...layout, ...items.filter(i => i.page === p)], page.view[2] - page.view[0]));
      }
    }
    for (const d of fix.dropItems || []) items = items.filter(f => !(d instanceof RegExp ? d.test(f.item.label) : (!f.extra && (d.page == null || f.page === d.page) && (d.maxY == null || f.y < d.maxY) && (d.minX == null || (f.x ?? f.cells?.[0].x) >= d.minX) && (!d.kind || f.item.kind === d.kind) && (!d.label || d.label.test(f.item.label)))));
    for (const f of items) if (fix.renameItems && fix.renameItems[f.item.label]) f.item = { ...f.item, label: fix.renameItems[f.item.label] };
    // A write-in for a detail the page already fills (e.g. a 2nd "Policy No." line) is left out.
    items = items.filter(f => {
      const hit = !f.leftover && f.item.kind === 'text' && matchLabel(f.item.label);
      // only when that detail's own field sits right beside it (the same slot found twice), not a second address block etc.
      const yOf = g => g.type === 'comb' ? g.y : g.y;
      return !(hit && layout.some(g => g.page === f.page && g.key === hit.key && Math.abs(yOf(g) - yOf(f)) < 14));
    });
    // fix.mapItems: [{ page?, label: /re/, key }] turns an item into a customer detail (e.g. witness Date of Birth -> agentDob).
    const mapped = [];
    for (const m of fix.mapItems || []) items = items.filter(f => {
      if ((m.page && f.page !== m.page) || !m.label.test(f.item.label)) return true;
      const { item, ...rest } = f; mapped.push({ ...rest, key: m.key }); return false;
    });
    layout.push(...mapped, ...keyItems(items));
  }
  return { pdf, layout };
}

export async function loadFixes() {
  return (await import(pathToFileURL(path.join(ROOT, 'tools/form-fixes.js')).href + '?t=' + Date.now())).default;
}
export function fixFor(fixes, form) {
  const k = Object.keys(fixes).find(k => form.file.includes(k));
  return k ? fixes[k] : {};
}
