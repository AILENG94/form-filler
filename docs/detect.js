// Finds where customer details go on a flat (non-fillable) PDF.
// Reads each page's text labels plus the drawn lines/boxes, then for every recognised label
// picks the slot next to it: a row of character boxes (comb), an underline, or the blank space after it.
// All coordinates are PDF user space (origin bottom-left, points).

import { matchLabel } from './fields.js';

const mul = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

export async function extractPage(page, OPS) {
  const [text, ops] = await Promise.all([page.getTextContent(), page.getOperatorList()]);

  // Text items -> runs (items on one line joined when the gap is small).
  const items = text.items.filter(t => t.str && t.str.trim()).map(t => {
    const h = Math.hypot(t.transform[2], t.transform[3]) || 8;
    return { str: t.str, x: t.transform[4], y: t.transform[5], w: t.width, h };
  }).sort((a, b) => (Math.abs(a.y - b.y) > 2 ? b.y - a.y : a.x - b.x));
  const runs = [];
  for (const it of items) {
    const last = runs[runs.length - 1];
    if (last && Math.abs(last.y - it.y) <= 2 && it.x - (last.x + last.w) < Math.max(4, it.h * 0.6) && it.x >= last.x) {
      const gap = it.x - (last.x + last.w);
      last.str += (gap > it.h * 0.15 && !last.str.endsWith(' ') && !it.str.startsWith(' ') ? ' ' : '') + it.str;
      last.w = it.x + it.w - last.x;
      last.h = Math.max(last.h, it.h);
    } else runs.push({ ...it });
  }
  for (const r of runs) r.str = r.str.replace(/\s+/g, ' ').trim();

  // Drawn geometry -> horizontal and vertical segments.
  const hs = [], vs = [];
  const seg = (a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    if (Math.abs(dy) < 0.8 && Math.abs(dx) > 2) hs.push({ y: (a[1] + b[1]) / 2, x1: Math.min(a[0], b[0]), x2: Math.max(a[0], b[0]) });
    else if (Math.abs(dx) < 0.8 && Math.abs(dy) > 2) vs.push({ x: (a[0] + b[0]) / 2, y1: Math.min(a[1], b[1]), y2: Math.max(a[1], b[1]) });
  };
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const { fnArray, argsArray } = ops;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i], args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args[0]) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (fn === OPS.constructPath) {
      const [pops, coords] = args;
      let k = 0, cur = null, start = null;
      for (const op of pops) {
        if (op === OPS.moveTo) { cur = start = apply(ctm, coords[k], coords[k + 1]); k += 2; }
        else if (op === OPS.lineTo) { const p = apply(ctm, coords[k], coords[k + 1]); if (cur) seg(cur, p); cur = p; k += 2; }
        else if (op === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
          const p = [apply(ctm, x, y), apply(ctm, x + w, y), apply(ctm, x + w, y + h), apply(ctm, x, y + h)];
          const W = Math.abs(p[1][0] - p[0][0]), H = Math.abs(p[3][1] - p[0][1]);
          if (W < 1.5 && H > 2) seg([(p[0][0] + p[1][0]) / 2, p[0][1]], [(p[0][0] + p[1][0]) / 2, p[3][1]]);
          else if (H < 1.5 && W > 2) seg([p[0][0], (p[0][1] + p[3][1]) / 2], [p[1][0], (p[0][1] + p[3][1]) / 2]);
          else { seg(p[0], p[1]); seg(p[1], p[2]); seg(p[2], p[3]); seg(p[3], p[0]); }
          cur = start = p[0];
        }
        else if (op === OPS.curveTo) { cur = apply(ctm, coords[k + 4], coords[k + 5]); k += 6; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { cur = apply(ctm, coords[k + 2], coords[k + 3]); k += 4; }
        else if (op === OPS.closePath) { if (cur && start) seg(cur, start); cur = start; }
      }
    }
  }
  return { runs, hs, vs };
}

// Nearby short texts, nearest first, used to tell a witness's "Name" from the customer's:
// same-line texts, then texts above in the same column, plus ALL-CAPS section headings at any x.
function contextFor(run, runs) {
  const short = runs.filter(r => r !== run && r.str.length < 60);
  const sameLine = short.filter(r => Math.abs(r.y - run.y) <= 3).sort((a, b) => Math.abs(a.x - run.x) - Math.abs(b.x - run.x));
  const isHeading = r => r.str === r.str.toUpperCase() && /[A-Z]{4}/.test(r.str);
  const above = short
    .filter(r => r.y > run.y + 3 && r.y - run.y < 130 && (Math.abs(r.x - run.x) < 150 || isHeading(r)))
    .sort((a, b) => a.y - b.y);
  // String objects so matchLabel can tell section headings from nearby labels.
  return [...sameLine, ...above].map(r => Object.assign(new String(r.str.toLowerCase()), { heading: Math.abs(r.x - run.x) >= 150 || (isHeading(r) && r.y - run.y > 40) }));
}

function findComb(run, { runs, vs }) {
  const xr = run.x + run.w, mid = run.y + run.h * 0.35;
  // Vertical strokes that cross the label's line, to the right of it.
  let xs = vs.filter(v => v.x > xr + 0.3 &&v.x < xr + 420 && v.y1 <= mid + 3 && v.y2 >= mid - 3 && v.y2 - v.y1 < 40 && v.y2 - v.y1 > 6);
  if (xs.length < 4) return null;
  // Box edges share a height; shorter strokes are label backgrounds or underlines' ticks.
  const heights = xs.map(v => v.y2 - v.y1).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)];
  xs = xs.filter(v => v.y2 - v.y1 > medH * 0.75);
  if (xs.length < 4) return null;
  xs.sort((a, b) => a.x - b.x);
  const uniq = [];
  for (const v of xs) {
    const last = uniq[uniq.length - 1];
    if (last && v.x - last.x < 1.5) { last.y1 = Math.min(last.y1, v.y1); last.y2 = Math.max(last.y2, v.y2); }
    else uniq.push({ ...v });
  }
  if (uniq[0].x - xr > 130) return null;
  // Another label between this label and the first box means the boxes belong to it.
  if (runs.some(r => r !== run && Math.abs(r.y - run.y) < run.h && r.x > xr - 1 && r.x + r.w < uniq[0].x + 1 && r.str.length > 1)) return null;

  const gaps = [];
  for (let i = 1; i < uniq.length; i++) gaps.push(uniq[i].x - uniq[i - 1].x);
  const typical = gaps.filter(g => g >= 7 && g <= 28).sort((a, b) => a - b);
  if (typical.length < 3) return null;
  const cw = typical[Math.floor(typical.length / 2)];
  const cells = [];
  let y1 = Infinity, y2 = -Infinity;
  for (let i = 1; i < uniq.length; i++) {
    const g = gaps[i - 1];
    if (Math.abs(g - cw) <= cw * 0.3) {
      cells.push({ x: uniq[i - 1].x, w: g });
      y1 = Math.min(y1, uniq[i - 1].y1, uniq[i].y1); y2 = Math.max(y2, uniq[i - 1].y2, uniq[i].y2);
    } else if (g > cw * 3.2) break; // end of this field
    else if (runs.some(r => Math.abs(r.y - run.y) < run.h && r.x > uniq[i - 1].x && r.x + r.w < uniq[i].x && /[a-z]{3}/i.test(r.str))) break; // next label
  }
  if (cells.length < 3) return null;
  return { type: 'comb', cells, y: y1, h: Math.min(y2 - y1, 24) };
}

function findLine(run, { runs, hs, vs }) {
  const xr = run.x + run.w;
  // An underline has no box edges hanging off it; a grid border does.
  const isGrid = s => vs.filter(v => v.x > s.x1 + 1 && v.x < s.x2 - 1 && (Math.abs(v.y1 - s.y) < 1 || Math.abs(v.y2 - s.y) < 1)).length > 2;
  // The line can sit up to ~12pt below the label when a translated sub-label sits between them.
  const cands = hs.filter(s => s.y <= run.y + 2 && s.y >= run.y - 12 && s.x2 > xr + 20 && s.x1 < xr + 40 && s.x2 - Math.max(s.x1, xr) > 25 && !isGrid(s))
    .sort((a, b) => (b.y - a.y) || (a.x1 - b.x1));
  if (!cands.length) return null;
  const s = cands[0];
  const sub = runs.filter(r => r !== run && r.y < run.y - 1 && r.y > s.y && r.x < xr && r.x + r.w > run.x);
  const x = Math.max(s.x1 + 2, xr + 4, ...sub.map(r => r.x + r.w + 4));
  // Stop before the next label on the line.
  const next = runs.filter(r => r !== run && r.y >= s.y - 1 && r.y <= Math.max(s.y + run.h, run.y + 2) && r.x > x + 5).sort((a, b) => a.x - b.x)[0];
  const end = Math.min(s.x2, next ? next.x - 4 : Infinity);
  if (end - x < 20) return null;
  return { type: 'text', x, y: s.y + 2, w: end - x, size: 9 };
}

function findSpace(run, { runs, vs }, pageWidth) {
  const xr = run.x + run.w + 5;
  const next = runs.filter(r => r !== run && Math.abs(r.y - run.y) < run.h * 0.4 && r.x > xr).sort((a, b) => a.x - b.x)[0];
  // A box or table border on the line also ends the free space.
  const wall = vs.filter(v => v.x > xr && v.y1 <= run.y + run.h * 0.5 && v.y2 >= run.y).sort((a, b) => a.x - b.x)[0];
  const end = Math.min(next ? next.x - 4 : pageWidth - 30, wall ? wall.x - 3 : Infinity);
  if (end - xr < 80) return null;
  return { type: 'text', x: xr, y: run.y, w: Math.min(end - xr, 300), size: 9 };
}

// A lone square (not the last box of a row of letter boxes) ending just before the label.
function hasTickBox(run, vs) {
  const near = vs.filter(v => v.y1 <= run.y + 2 && v.y2 >= run.y + 2 && v.y2 - v.y1 < 16);
  const right = near.find(v => v.x > run.x - 12 && v.x < run.x - 1);
  if (!right) return false;
  const h = right.y2 - right.y1;
  const left = near.find(v => right.x - v.x > h * 0.6 && right.x - v.x < h * 1.5);
  if (!left) return false;
  return !near.some(v => left.x - v.x > 2 && left.x - v.x < 25);
}

// Returns a layout: [{ key, page, type: 'text'|'comb', ... }]
export async function detectLayout(pdf, OPS) {
  const layout = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const pageWidth = page.view[2] - page.view[0];
    const geo = await extractPage(page, OPS);
    const taken = [], usedKeys = new Set();
    for (const run of geo.runs) {
      // Labels start with a capital; a trailing full stop on a long word means it is the end of a sentence.
      if (!/^[A-Z]/.test(run.str) || /[a-z]{4,}\.$/i.test(run.str)) continue;
      // A small box just before the label makes it a tick option ("☐ Mailing Address"), not a field.
      if (hasTickBox(run, geo.vs)) continue;
      const m = matchLabel(run.str, contextFor(run, geo.runs));
      if (!m || usedKeys.has(m.key)) continue;
      const slot = findComb(run, geo) || findLine(run, geo) || findSpace(run, geo, pageWidth);
      if (!slot) continue;
      const sx = slot.type === 'comb' ? slot.cells[0].x : slot.x, sy = slot.y;
      if (taken.some(t => Math.abs(t[0] - sx) < 3 && Math.abs(t[1] - sy) < 3)) continue;
      taken.push([sx, sy]);
      usedKeys.add(m.key);
      layout.push({ key: m.key, page: p, label: run.str, ...slot });
    }
  }
  return layout;
}
