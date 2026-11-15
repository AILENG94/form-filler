// Finds the remaining fill-in items on a form (questions, "Dated at", "Others: ___", tick-box choices …) that no
// customer detail covers, so they can be typed or ticked in the app. Each becomes a layout field with an `item`:
//   { label, kind: 'text' | 'choice', options? }   (values are stored under the field's key, e.g. q_dated_at)

const SKIP_LABEL = /signature|tandatangan|office use|kegunaan pejabat|for office|stamp|\bcop\b|page \d|great eastern life|generali insurance|tokio marine insurans|head office|website|careline|please (fill|tick)|tick (the )?box|^\W*$/i;
const OFFICE = /office use|kegunaan pejabat|for official use|to be completed by relevant department|untuk kegunaan/i;

const MALAY = /\b(yang|dan|untuk|nama|tarikh|no\. ?kp|bayaran|jenis|hari|bulan|tahun|sila|pemegang|penama|asurans|kereta|manfaat|pengurangan|penukaran|pengunduran|fasal|tempoh|kemas|alamat|polisi|hayat|pembatalan|perletakan|diasuranskan|rawatan|lelaki|perempuan|berkahwin|bujang|tandatangan|saksi|negara|pekerjaan|kenderaan|perkahwinan|warganegara|bimbit|rumah|pejabat|cukai|pendapatan|jumlah|penuh|seperti|kad pengenalan|pindaan|permohonan|butiran|lain-lain|nyatakan|kegunaan|syarikat|bandar|poskod|cadangan|skim|berkelompok|kebenaran|pertanyaan|tuntutan|amaun|saya|kami|kepada|ini|ialah|adalah|sebagai|dengan|bagi|sekiranya|berkenaan|pemastautin|bercukai|setiap|merupakan|serahan|nilai|pemberikuasaan|memberi|perniagaan)\b/i;
const ENGLISH = /\b(the|name|date|policy|address|number|amount|please|of|and|your|type|payment|bank|with|other|others|details)\b/i;
// Running text (instructions, notes) is not a label.
const SECTION = /^(?:\d\)\s*)?(nominee|trustee|witness details|beneficiary)\b(?!\s*(name|nric|'s|\(|\/\s*[a-z]*\/))/i;
const isSentence = s => s.length > 130 || s.split(' ').length > 24 ||/[a-z)"]\.$/.test(s) || /^\(.*\)$/.test(s)
  || /\b(declaration|notice|notes?|important)\b/i.test(s) || (s === s.toUpperCase() && /[A-Z]{3}/.test(s) && s.split(' ').length >= 3);
const english = s => s.split(/\s+\/\s+|\s{2,}/)[0]; // "Single / Bujang" -> "Single"
function clean(s) {
  let t = english(String(s))
    .replace(/^\s*(\(?[a-z0-9]{1,3}[).]|\d+\.)\s*/i, '') // 3) (a) 1.
    .replace(/[*^]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // "Proposal No. No. Cadangan" -> "Proposal No." (drop a Malay translation run on after the English)
  const m = t.match(MALAY);
  if (m && m.index > 3 && ENGLISH_START.test(t)) t = t.slice(0, m.index).replace(/\b(no\.?|tel)\s*$/i, x => x).trim();
  if (t.length > 12) t = t.replace(/([a-z)])\.$/i, '$1'); // a question that ends with a full stop
  return t.replace(/:?\s*(day|hari)$/i, '').replace(/[\s:：/+]+$/, '').replace(/^(.*\bNo\.)\s*No\.?$/i, '$1').trim();
}
const ENGLISH_START = /^[A-Za-z(]/;
// Words that only make sense next to a box (date parts, option names), never as an item's name.
const DATE_PART = /^(day|month|year|hari|bulan|tahun|dd|mm|yyyy|yy|\/|-)$/i;
const LINE_WEAK = /^(day|month|year|hari|bulan|tahun|dd|mm|yyyy|yy|female|male|yes|no|rm|%|\/|-|husband|wife|son|daughter|father|mother|brother|sister|single|married|divorced|widowed|malaysian)$/i;
const WEAK =/^(day|month|year|hari|bulan|tahun|dd|mm|yyyy|yy|female|male|gender|yes|no|nationality|country|others?|rm|%|\/|-|to|from|husband|wife|son|daughter|father|mother|brother|sister|single|married|divorced|widowed|malaysian|house|office|handphone|please)$/i;
const slug = s => {
  const t = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (t.length <= 40) return t;
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return t.slice(0, 32) + '_' + h.toString(36); // long labels keep a short fingerprint so similar ones stay apart
};

function overlaps(layout, page, x0, y0, x1, y1) {
  return layout.some(f => {
    if (f.page !== page) return false;
    let a, b, c, d;
    if (f.type === 'comb') { a = f.cells[0].x; c = f.cells.at(-1).x + f.cells.at(-1).w; b = f.y; d = f.y + f.h; }
    else if (f.type === 'check') { a = f.x; c = f.x + f.size; b = f.y; d = f.y + f.size; }
    else { a = f.x - 6; c = f.x + (f.w || 100); b = f.y - 3; d = f.y + 9; }
    return a < x1 - 1 && c > x0 + 1 && b < y1 + 1 && d > y0 - 1;
  });
}

// ctx carries numbering of repeated sections (Nominee 1, 2, 3 …) across pages.
export function findItems(geo, page, layout, pageWidth, ctx = { counts: {} }) {
  const runs = geo.runs;
  const out = [];
  const inOffice = (x, y) => runs.some(r => OFFICE.test(r.str) && r.y > y - 4 && r.y - y < 90 && r.x < x + 300);

  // Section headings for people ("Nominee / Penama", "Trustee", "Witness Details"), numbered in form order.
  const sections = runs.filter(r => r.str.length < 60 && SECTION.test(clean(r.str)))
    .sort((a, b) => b.y - a.y)
    .map(r => {
      const role = clean(r.str).match(SECTION)[1].replace(/\s.*/, '');
      const key = role.toLowerCase();
      ctx.counts[key] = (ctx.counts[key] || 0) + 1;
      return { y: r.y, name: /witness/i.test(role) ? 'Witness' : `${role[0].toUpperCase()}${role.slice(1).toLowerCase()} ${ctx.counts[key]}` };
    });
  const sectionAt = y => (sections.filter(s => s.y > y).sort((a, b) => a.y - b.y)[0] || {}).name;
  const named = (label, y) => { const s = sectionAt(y); return s && !label.startsWith(s.split(' ')[0]) ? `${s} – ${label}` : label; };

  // Text to the left on the same line, else just above. Date parts and option words are skipped over.
  const labelLeft = (x, yMid, h = 10, skip = WEAK, gap = 200) => runs.filter(r => r.x + r.w <= x + 3 && Math.abs(r.y + r.h * 0.35 - yMid) < h * 0.7 + 2 && x - (r.x + r.w) < gap
      && !skip.test(clean(r.str)))
    .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
  // The forms print the English label with its Malay translation underneath; use the English one.
  const en = r => {
    if (!r || !MALAY.test(r.str) || ENGLISH.test(r.str)) return r;
    const up = runs.filter(o => o !== r && o.y > r.y && o.y - r.y < 14 && Math.abs(o.x - r.x) < 25 && !MALAY.test(o.str)).sort((a, b) => a.y - b.y)[0];
    return up || r;
  };
  const labelAbove = (x, yTop) => runs.filter(r => r.y > yTop && r.y - yTop < 16 && r.x < x + 40 && r.x + r.w > x - 10)
    .sort((a, b) => a.y - b.y)[0];

  // ---- tick boxes, grouped per line into one question ----
  const ticks = geo.rows.filter(r => r.cells.length === 1 && r.cells[0].w >= 5 && r.cells[0].w <= 16 && Math.abs(r.cells[0].w - r.h) < 4)
    .map(r => ({ x: r.cells[0].x, w: r.cells[0].w, y: r.y, h: r.h }))
    .filter(t => !overlaps(layout, page, t.x, t.y, t.x + t.w, t.y + t.h) && !inOffice(t.x, t.y))
    .filter(t => !((t.y > 760 || t.y < 50) && (t.x < 45 || t.x > 530))); // printer's corner marks
  const lines = [], orphans = [];
  for (const t of ticks.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const l = lines.find(l => Math.abs(l[0].y - t.y) < 4);
    l ? l.push(t) : lines.push([t]);
  }
  for (const group of lines) {
    group.sort((a, b) => a.x - b.x);
    const opts = group.map(t => {
      const r = runs.filter(r => r.x >= t.x + t.w - 3 && r.x - (t.x + t.w) < 30 && Math.abs(r.y + r.h * 0.35 - (t.y + t.h / 2)) < t.h * 0.8 + 2)
        .sort((a, b) => a.x - b.x)[0];
      return { t, label: r ? clean(en(r).str) : '' };
    }).filter(o => o.label && !SKIP_LABEL.test(o.label));
    // Tick boxes with nothing printed beside them are answer boxes (e.g. "How many …?"): write-in slots below.
    for (const t of group) if (!opts.some(o => o.t === t)) orphans.push(t);
    if (!opts.length) continue;
    const first = opts[0].t;
    let q = labelLeft(first.x, first.y + first.h / 2, first.h, DATE_PART, 520);
    if (q && opts.some(o => clean(q.str) === o.label)) q = null;
    let question = q ? clean(en(q).str) : '';
    if (!question || question.length < 3) { const a = labelAbove(first.x, first.y + first.h); question = a ? clean(en(a).str) : ''; }
    if (opts.length === 1) question = opts[0].label.length > 3 ? opts[0].label : (question || opts[0].label);
    if (!question || SKIP_LABEL.test(question) || isSentence(question)) {
      // No question text: each box stands alone as a tick item named after its own label.
      for (const o of opts) {
        if (isSentence(o.label)) continue;
        const sz = Math.min(9, o.t.h * 0.8);
        out.push({ type: 'check', page, x: o.t.x + (o.t.w - sz) / 2, y: o.t.y + (o.t.h - sz) / 2, size: sz, when: 'Yes', item: { label: named(o.label, o.t.y), kind: 'choice', options: ['Yes'] } });
      }
      continue;
    }
    // A row of boxes reading "Yes … No" etc. is one choice; a single box is a tick-if-applies item.
    const options = opts.length === 1 ? ['Yes'] : opts.map(o => o.label);
    for (const [i, o] of opts.entries()) {
      const s = Math.min(9, o.t.h * 0.8);
      out.push({ type: 'check', page, x: o.t.x + (o.t.w - s) / 2, y: o.t.y + (o.t.h - s) / 2, size: s,
        when: opts.length === 1 ? 'Yes' : options[i], item: { label: named(question, first.y), kind: 'choice', options } });
    }
  }

  // ---- write-in lines and rows of letter boxes ----
  const slots = [
    ...geo.lines.filter(s => s.x2 - s.x1 >= 30 && s.x2 - s.x1 <= pageWidth * 0.8).map(s => ({ kind: 'line', x: s.x1, x2: s.x2, y: s.y, h: 10 })),
    ...geo.rows.filter(r => r.cells.length >= 2 || (r.cells[0].w > 16 && r.cells[0].w < 40 && Math.abs(r.cells[0].w - r.h) < 6)).map(r => ({ kind: 'comb', x: r.cells[0].x, x2: r.cells.at(-1).x + r.cells.at(-1).w, y: r.y, h: r.h, row: r })),
    ...orphans.map(t => ({ kind: 'comb', x: t.x, x2: t.x + t.w, y: t.y, h: t.h, row: { cells: [{ x: t.x, w: t.w }], y: t.y, h: t.h } })),
  ].sort((a, b) => b.y - a.y || a.x - b.x);
  const taken = [];
  let prev = null;
  // Edges of letter boxes / tick boxes are not write-in lines.
  const boxEdge = s => geo.rows.some(r => (Math.abs(r.y - s.y) < 1.5 || Math.abs(r.y + r.h - s.y) < 1.5)
    && r.cells[0].x < s.x2 - 2 && r.cells.at(-1).x + r.cells.at(-1).w > s.x + 2);
  // The top edge of a rectangle (same-width line below it, with side walls): write on the bottom edge only.
  const wall = (x, y1, y2) => geo.vs.some(v => Math.abs(v.x - x) < 2 && v.y1 <= y1 + 1 && v.y2 >= y2 - 1);
  const rectTop = s => geo.lines.some(t => t !== s && t.y < s.y - 5 && s.y - t.y < 45 && Math.abs(t.x1 - s.x) < 2 && Math.abs(t.x2 - s.x2) < 2
    && wall(s.x, t.y, s.y) && wall(s.x2, t.y, s.y));
  for (const s of slots) {
    if (s.kind === 'line' && (boxEdge(s) || rectTop(s))) continue;
    const top = s.kind === 'line' ? s.y + 10 : s.y + s.h;
    if (overlaps(layout, page, s.x + 2, s.y, s.x2 - 2, top) || inOffice(s.x, s.y)) continue;
    if (taken.some(t => Math.abs(t.y - s.y) < 3 && t.x < s.x2 - 2 && t.x2 > s.x + 2)) continue;
    // a printed word inside the slot means it is a table border or a heading bar, not a blank
    if (runs.some(r => r.x > s.x + 2 && r.x < s.x2 - 4 && r.y > s.y + 0.5 && r.y < top - 1 && r.str.trim().length > 1 && s.kind === 'line')) continue;
    const mid = s.kind === 'line' ? s.y + 4 : s.y + s.h / 2;
    let lab = labelLeft(s.x, mid, s.kind === 'line' ? 8 : s.h, LINE_WEAK, 520);
    let label = lab ? clean(en(lab).str) : '';
    // A slot straight under the previous one with no label of its own continues it (address lines, "Others" details).
    const continues = !label && prev && prev.kind === s.kind && prev.y - s.y < 30 && Math.abs(prev.x - s.x) < 20;
    if (!label && !continues) { const a = labelAbove(s.x, top); label = a ? clean(en(a).str) : ''; }
    // letter boxes carry on into the next row; a second write-in line is its own item
    if (continues) label = s.kind === 'comb' ? prev.label : prev.label.replace(/ \(line \d+\)$/, '') + ` (line ${(prev.lineNo || 1) + 1})`;
    // Malay-only fragments (the translation of a paragraph) are not labels.
    const malayOnly = MALAY.test(label) && !ENGLISH.test(label) && !/\b(tel|ic)\b/i.test(label) && !/^[A-Z][a-z]+( [A-Z(][\w)]*)*$/.test(label)
      || /^[a-z]/.test(label) || /\($/.test(label);
    if (!label || label.length < 2 || SKIP_LABEL.test(label) || /^\d+$/.test(label) || isSentence(label) || WEAK.test(label) || malayOnly) { prev = null; continue; }
    taken.push(s);
    const base = { page, item: { label: named(label, s.y), kind: 'text' }, ...(continues && s.kind === 'comb' ? { cont: true } : {}) };
    if (s.kind === 'comb') out.push({ ...base, type: 'comb', cells: s.row.cells, y: s.row.y, h: s.row.h });
    else out.push({ ...base, type: 'text', x: s.x + 3, y: s.y + 2, w: s.x2 - s.x - 5, size: 9 });
    prev = { ...s, label, lineNo: continues && s.kind === 'line' ? (prev.lineNo || 1) + 1 : 1 };
  }
  // The same printed label on several blanks of one page (table rows / columns): tell them apart by column and row.
  const byLabel = new Map();
  for (const it of out) { const k = it.item.label; if (!byLabel.has(k)) byLabel.set(k, []); byLabel.get(k).push(it); }
  for (const [label, list] of byLabel) {
    if (list.length < 2 || label.startsWith('#UNNAMED#')) continue;
    const xOf = it => it.x ?? it.cells[0].x;
    const cols = [];
    for (const it of [...list].sort((p, q) => xOf(p) - xOf(q))) { const c = cols.find(c => Math.abs(c.x - xOf(it)) < 12); c ? c.items.push(it) : cols.push({ x: xOf(it), items: [it] }); }
    cols.forEach((c, ci) => c.items.sort((p, q) => q.y - p.y).forEach((it, ri) => {
      it.item = { ...it.item, label: `${label} (${cols.length > 1 ? 'column ' + (ci + 1) + ', ' : ''}row ${ri + 1})` };
    }));
  }
  // unnamed blanks are numbered top to bottom, left to right on their page
  let n = 0;
  for (const f of out.sort((a, b) => ((b.y || 0) - (a.y || 0)) || ((a.x ?? a.cells[0].x) - (b.x ?? b.cells[0].x)))) {
    if (f.item.label.startsWith('#UNNAMED#')) f.item = { ...f.item, label: `${f.item.label.slice(9)} ${++n} (page ${page})` };
  }
  return out;
}

// Gives each item a key from its label; the same question appearing twice on a form gets _2, _3 …
export function keyItems(items) {
  const seen = new Map(), out = [];
  for (const f of items) {
    let base = 'q_' + slug(f.item.label);
    const k = f.extra && f.item.kind === 'choice' ? `${base}|choice` : f.item.kind === 'choice' ? `${base}|${f.page}|${Math.round(f.y)}` : `${base}|${f.page}|${Math.round(f.y)}|${Math.round(f.x || f.cells[0].x)}`;
    if (!seen.has(k)) {
      const n = [...seen.values()].filter(v => v === base || v.startsWith(base + '_')).length;
      seen.set(k, n ? `${base}_${n + 1}` : base);
    }
    let key = seen.get(k);
    // continuation lines share the key of the line above
    if (f.cont && out.length && out.at(-1).item.label === f.item.label) key = out.at(-1).key;
    out.push({ ...f, key });
  }
  return out;
}

// ---------- completeness pass ----------
// Every blank that no field or item covers yet (a write-in line, a row of letter boxes, a tick box) still gets an item,
// named after the nearest printed text, so that nothing on a form is missing from the list.
function isCovered(layout, page, x0, y0, x1, y1) {
  return layout.some(f => {
    if (f.page !== page) return false;
    let a, b, c, d;
    if (f.type === 'comb') { a = f.cells[0].x; c = f.cells.at(-1).x + f.cells.at(-1).w; b = f.y; d = f.y + f.h; }
    else if (f.type === 'check') { a = f.x - 1; c = f.x + f.size + 1; b = f.y - 1; d = f.y + f.size + 1; }
    else { a = f.x - 4; c = f.x + (f.w || 100); b = f.y - 4; d = f.y + 11; }
    return a < x1 - 1 && c > x0 + 1 && b < y1 + 1 && d > y0 - 1;
  });
}

export function findLeftovers(geo, page, layout, pageWidth, ctx = { counts: {} }) {
  const runs = geo.runs, out = [];
  const okLabel = l => l && l.length >= 2 && !SKIP_LABEL.test(l) && !isSentence(l) && !/^\d+$/.test(l) && !DATE_PART.test(l);
  // printed Malay with no English beside it is not a usable name
  const text = r => { const e = en0(r), l = clean(e.str); return okLabel(l) && (!MALAY.test(l) || ENGLISH.test(l) || /(no|tel|ic)/i.test(l)) ? l : ''; };
  const en0 = r => {
    if (!r || !MALAY.test(r.str) || ENGLISH.test(r.str)) return r;
    return runs.filter(o => o !== r && o.y > r.y && o.y - r.y < 14 && Math.abs(o.x - r.x) < 25 && !MALAY.test(o.str)).sort((a, b) => a.y - b.y)[0] || r;
  };
  const labelFor = (x, x2, y, h) => {
    const left = runs.filter(r => r.x + r.w <= x + 3 && Math.abs(r.y + r.h * 0.35 - (y + h / 2)) < h / 2 + 4 && x - (r.x + r.w) < 520 && text(r))
      .sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
    if (left) return text(left);
    const above = runs.filter(r => r.y > y + h && r.y - (y + h) < 24 && r.x < x2 - 10 && r.x + r.w > x + 10 && text(r)).sort((a, b) => a.y - b.y)[0];
    if (above) return text(above);
    // a column heading further up (tables of boxes)
    const head = runs.filter(r => r.y > y + h && r.y - (y + h) < 260 && r.x < x2 - 10 && r.x + r.w > x + 10 && text(r) && !MALAY.test(r.str)).sort((a, b) => a.y - b.y)[0];
    if (head) return text(head);
    // last resort: the nearest printed text above, so the blank can still be found on the form
    const near = runs.filter(r => r.y > y + h && r.y - (y + h) < 120 && r.x < x2 && r.x + r.w > x - 200 && text(r)).sort((a, b) => a.y - b.y)[0];
    return near ? `Blank below "${text(near).slice(0, 38)}"` : '';
  };
  const edge = s => geo.rows.some(r => (Math.abs(r.y - s.y) < 1.5 || Math.abs(r.y + r.h - s.y) < 1.5) && r.cells[0].x < s.x2 - 2 && r.cells.at(-1).x + r.cells.at(-1).w > s.x + 2);
  const wall = (x, y1, y2) => geo.vs.some(v => Math.abs(v.x - x) < 2 && v.y1 <= y1 + 1 && v.y2 >= y2 - 1);
  const inOffice = (x, y) => runs.some(r => OFFICE.test(r.str) && r.y > y - 4 && r.y - y < 90 && r.x < x + 300);
  const cur = () => [...layout, ...out];
  const push = f => out.push(f);

  for (const s of geo.lines) {
    const w = s.x2 - s.x1;
    if (w < 30 || w > 480 || s.y < 40 || s.y > 800 || s.x1 < 2 || s.x2 > pageWidth + 1) continue;
    if (edge(s) || inOffice(s.x1, s.y)) continue;
    if (geo.lines.some(t => t !== s && t.y < s.y - 5 && s.y - t.y < 200 && Math.abs(t.x1 - s.x1) < 2 && Math.abs(t.x2 - s.x2) < 2 && wall(s.x1, t.y, s.y))) continue;
    if (isCovered(cur(), page, s.x1, s.y - 1, s.x2, s.y + 10)) continue;
    if (runs.some(r => r.y > s.y - 1 && r.y < s.y + 10 && r.x >= s.x1 - 6 && r.x + r.w <= s.x2 + 6 && r.w > w * 0.6 && r.str.trim().length > 3)) continue;
    if (runs.some(r => /signature|tandatangan|stamp|cop /i.test(r.str) && r.y < s.y && s.y - r.y < 30 && r.x < s.x2 && r.x + r.w > s.x1)) continue;
    const label = labelFor(s.x1, s.x2, s.y, 8) || '#UNNAMED#Blank';
    push({ type: 'text', page, x: s.x1 + 3, y: s.y + 2, w: w - 5, size: 9, leftover: true, item: { label, kind: 'text' } });
  }
  for (const r of geo.rows) {
    const c0 = r.cells[0], x1 = r.cells.at(-1).x + r.cells.at(-1).w;
    if (r.y < 40 || r.y > 800 || c0.x < 2 || x1 > pageWidth + 1 || inOffice(c0.x, r.y)) continue;
    if (r.cells.length === 1 && c0.w < 5) continue;
    if (isCovered(cur(), page, c0.x, r.y, x1, r.y + r.h)) continue;
    if (r.cells.length === 1 && c0.w <= 16 && Math.abs(c0.w - r.h) < 4) {
      // a tick box: its own label is the text to its right
      const o = runs.filter(t => t.x >= c0.x + c0.w - 3 && t.x - (c0.x + c0.w) < 30 && Math.abs(t.y + t.h * 0.35 - (r.y + r.h / 2)) < r.h * 0.8 + 2 && text(t)).sort((a, b) => a.x - b.x)[0];
      const label = (o ? text(o) : labelFor(c0.x, x1, r.y, r.h)) || '#UNNAMED#Tick box';
      const sz = Math.min(9, r.h * 0.8);
      push({ type: 'check', page, x: c0.x + (c0.w - sz) / 2, y: r.y + (r.h - sz) / 2, size: sz, when: 'Yes', leftover: true, item: { label, kind: 'choice', options: ['Yes'] } });
    } else {
      const label = labelFor(c0.x, x1, r.y, r.h) || '#UNNAMED#Blank';
      push({ type: 'comb', page, cells: r.cells, y: r.y, h: r.h, leftover: true, item: { label, kind: 'text' } });
    }
  }
  return out;
}
