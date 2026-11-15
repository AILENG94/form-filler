import * as pdfjsLib from './lib/pdf.mjs';
import * as PDFLib from './lib/pdf-lib.esm.js';
import { FIELDS, FIELD_BY_KEY } from './fields.js';
import { readDocument, parseDetails } from './extract.js';
import { detectLayout } from './detect.js';
import { fillPdf, valueFor, boxChars, formatNric, formatMobile } from './fill.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./lib/pdf.worker.mjs', import.meta.url).href;

const $ = s => document.querySelector(s);
const state = {
  categories: [], cat: 0, form: null, pdf: null, bytes: null,
  layout: [], customer: {}, used: new Set(), ownAddress: {}, pendingSame: new Set(),
  scale: 1.4, preview: false, pages: [],
};

// ---------- helpers ----------
function toast(msg, err) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.className = 'toast'), err ? 9000 : 3200);
}
// On the published web version there is no server: the form list and layouts are plain files under data/.
const STATIC = !!window.FF_STATIC;
async function api(url, opts = {}) {
  if (STATIC && url.startsWith('/api/')) url = 'data/' + url.slice(5) + '.json';
  else url = url.replace(/^\//, ''); // relative, so it also works under a sub-folder like github.io/form-filler/
  let r;
  try { r = await fetch(url, opts); }
  catch { throw new Error('the Form Filler server is not running (computer version: double-click "Start Form Filler.bat", then refresh this page).'); }
  if (!r.ok) throw Object.assign(new Error((await r.json().catch(() => ({}))).error || r.statusText), { status: r.status });
  return r.headers.get('content-type')?.includes('json') ? r.json() : r.arrayBuffer();
}
const opts = () => ({ upper: $('#upper').checked });
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const today = () => { const d = new Date(); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; };
const measure = (() => { const c = document.createElement('canvas').getContext('2d'); return (s, px) => { c.font = `${px}px Helvetica, Arial, sans-serif`; return c.measureText(s).width; }; })();

// Malaysian NRIC: YYMMDD-PB-###G — date of birth and gender (last digit odd = male).
function fromNric(nric) {
  const m = String(nric || '').replace(/\D/g, '').match(/^(\d{2})(\d{2})(\d{2})\d{5}(\d)$/);
  if (!m) return null;
  const yy = +m[1], cur = new Date().getFullYear() % 100;
  const year = (yy > cur ? 1900 : 2000) + yy;
  const mm = +m[2], dd = +m[3];
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return { dob: `${m[3]}/${m[2]}/${year}`, gender: +m[4] % 2 ? 'Male' : 'Female' };
}

// ---------- forms list ----------
async function loadForms() {
  state.categories = await api('/api/forms');
  renderCats(); renderForms();
}
function renderCats() {
  $('#cats').innerHTML = state.categories.map((c, i) =>
    `<option value="${i}" ${i === state.cat ? 'selected' : ''}>${esc(c.label)} (${c.forms.length})</option>`).join('');
}
function renderForms() {
  const cat = state.categories[state.cat];
  const list = cat ? cat.forms : [];
  const current = state.form && list.some(f => f.id === state.form.id) ? state.form.id : '';
  $('#formSelect').innerHTML = `<option value="">${list.length ? '— Choose a form —' : 'No forms in this folder'}</option>` +
    list.map(f => `<option value="${esc(f.id)}" ${f.id === current ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
}
const allForms = () => state.categories.flatMap(c => c.forms);

$('#cats').addEventListener('change', e => { state.cat = +e.target.value; renderForms(); });
$('#formSelect').addEventListener('change', e => {
  const form = allForms().find(f => f.id === e.target.value);
  if (form) openForm(form);
});

// ---------- open a form ----------
async function getLayout(form, pdf) {
  const saved = await api('/api/layouts/' + encodeURIComponent(form.id));
  if (saved) return saved.fields || [];
  return detectLayout(pdf, pdfjsLib.OPS);
}

async function openForm(form) {
  state.form = form;
  renderForms();
  $('#formTitle').textContent = form.name;
  $('#fields').innerHTML = '<div class="empty"><p>Loading form…</p></div>';
  try {
    state.bytes = await api('/forms/' + form.file.split('/').map(encodeURIComponent).join('/'));
    state.pdf = await pdfjsLib.getDocument({ data: new Uint8Array(state.bytes.slice(0)) }).promise;
    state.layout = await getLayout(form, state.pdf);
    renderFields();
    $('#download').disabled = false; $('#previewToggle').disabled = false;
    if (state.preview) await renderPages();
  } catch (e) {
    console.error(e); toast('Could not open form: ' + e.message, true);
    $('#fields').innerHTML = `<div class="empty"><h2>Could not open this form</h2><p>${esc(e.message)}</p></div>`;
  }
}

// ---------- the form's fill-in fields, in the form's own order ----------
const topOf = f => f.type === 'comb' ? f.y + f.h : f.type === 'check' ? f.y + (f.size || 9) : f.y + 9;
const leftOf = f => f.type === 'comb' ? f.cells[0].x : f.x;

// Customer details and the form's own items, page by page, top to bottom, left to right.
function orderedFields() {
  const fields = state.layout.filter(f => f.key && f.type !== 'static');
  fields.sort((a, b) => a.page - b.page || topOf(b) - topOf(a));
  // rows: fields within a few points of each other vertically read left to right
  const rows = [];
  for (const f of fields) {
    const row = rows.find(r => r.page === f.page && Math.abs(r.y - topOf(f)) < 7);
    row ? row.items.push(f) : rows.push({ page: f.page, y: topOf(f), items: [f] });
  }
  const out = [], seen = new Set();
  const add = (key, page, f) => {
    if (seen.has(key)) return;
    const def = FIELD_BY_KEY[key];
    seen.add(key);
    if (f && f.item) { out.push({ key, page, item: f.item, options: [...(f.item.options || [])] }); return; }
    if (def) out.push({ key, page, def });
  };
  const addWithSources = (key, page) => {
    const def = FIELD_BY_KEY[key];
    // details this one is built from or falls back to come first
    for (const s of (def && (def.sources || [])) || []) addWithSources(s, page);
    if (def && def.fallback) addWithSources(def.fallback, page);
    if (!(def && def.sources)) add(key, page);
  };
  for (const row of rows) {
    row.items.sort((a, b) => leftOf(a) - leftOf(b));
    for (const f of row.items) {
      if (f.item) {
        const prior = out.find(o => o.key === f.key);
        if (prior) { for (const o of f.item.options || []) if (!prior.options.includes(o)) prior.options.push(o); continue; }
        add(f.key, f.page, f);
      } else addWithSources(f.key, f.page);
    }
  }
  // Two items with the same printed label (a tick box and the blank beside it): tell them apart.
  const seenLabel = new Map();
  for (const o of out) {
    if (!o.item) continue;
    const l = o.item.label, prev = seenLabel.get(l);
    if (prev) {
      const n = (prev.n || 1) + 1; prev.n = n;
      o.item = { ...o.item, label: prev.kind === 'choice' && o.item.kind === 'text' && n === 2 ? `${l} – details` : `${l} (${n})` };
    } else seenLabel.set(l, { kind: o.item.kind });
  }
  return out;
}

function inputFor(o) {
  const id = 'f_' + o.key;
  if (o.item) {
    if (o.item.kind === 'choice' && o.options.length === 1 && o.options[0] === 'Yes')
      return `<label class="row tick" data-key="${o.key}"><input type="checkbox" id="${id}" data-key="${o.key}"> <span>${esc(o.item.label)}</span></label>`;
    const input = o.item.kind === 'choice'
      ? `<select id="${id}" data-key="${o.key}"><option value=""></option>${o.options.map(x => `<option>${esc(x)}</option>`).join('')}</select>`
      : `<input id="${id}" data-key="${o.key}">`;
    return `<div class="row ${o.item.label.length > 48 ? 'wide' : ''}" data-key="${o.key}"><label for="${id}">${esc(o.item.label)}</label>${input}</div>`;
  }
  const f = o.def;
  const input = f.options
    ? `<select id="${id}" data-key="${f.key}">${f.options.map(x => `<option>${esc(x)}</option>`).join('')}</select>`
    : `<input id="${id}" data-key="${f.key}" placeholder="${esc(f.placeholder || '')}" ${f.key === 'email' ? 'type="email"' : ''}>`;
  const extra = f.key === 'signDate' ? '<button type="button" data-today="signDate">Today</button>' : '';
  return `<div class="row ${f.label.length > 48 ? 'wide' : ''}" data-key="${f.key}"><label for="${id}">${esc(f.label)}</label>${extra ? `<div class="with-btn">${input}${extra}</div>` : input}</div>`;
}

function renderFields() {
  const list = orderedFields();
  state.used = new Set(list.map(o => o.key));
  const box = $('#fields');
  if (!list.length) { box.innerHTML = '<div class="empty"><p>This form has nothing for you to fill in.</p></div>'; return; }
  let page = 0;
  box.innerHTML = list.map(o => (o.page !== page ? `<div class="page-tag">Page ${(page = o.page)}</div>` : '') + inputFor(o)).join('');
  writeFields(); redraw();
}

function writeFields() {
  for (const el of document.querySelectorAll('#fields [data-key]')) {
    if (!/INPUT|SELECT/.test(el.tagName)) continue;
    const v = state.customer[el.dataset.key] || '';
    if (el.type === 'checkbox') el.checked = v === 'Yes'; else el.value = v;
  }
}

// After an NRIC changes: fill that person's date of birth and gender (if blank and the form asks for them).
function applyDerived(changedKey) {
  if (!/Nric$/.test(changedKey)) return;
  const d = fromNric(state.customer[changedKey]);
  if (!d) return;
  for (const [key, value] of [[changedKey.replace(/Nric$/, 'Dob'), d.dob], [changedKey.replace(/Nric$/, 'Gender'), d.gender]]) {
    if (state.customer[key] || !state.used.has(key)) continue;
    state.customer[key] = value;
  }
}
// NRIC as xxxxxx-xx-xxxx and Malaysian mobiles with +60, shown in the box as soon as it is filled in.
function tidy(key) {
  const v = state.customer[key];
  if (!v) return;
  const t = /Nric$/.test(key) ? formatNric(v) : (FIELD_BY_KEY[key]?.mobile && key !== 'agentMobile' ? formatMobile(v) : v);
  if (t !== v) state.customer[key] = t;
}

$('#fields').addEventListener('input', e => {
  const k = e.target.dataset.key; if (!k) return;
  state.customer[k] = e.target.type === 'checkbox' ? (e.target.checked ? 'Yes' : '') : e.target.value;
  if (agentKeys.includes(k)) saveAgent();
  redraw();
});
$('#fields').addEventListener('change', e => {
  const k = e.target.dataset.key; if (!k) return;
  tidy(k); applyDerived(k); writeFields(); redraw();
});
$('#fields').addEventListener('click', e => {
  const k = e.target.dataset.today; if (!k) return;
  state.customer[k] = today(); writeFields(); redraw();
});
$('#upper').onchange = redraw;

// ---------- fill from pasted text or an uploaded picture / PDF ----------
function applyDetails(text, source) {
  const found = parseDetails(text);
  // With a form open, take only the details that form asks for.
  const all = Object.keys(found);
  const keys = (state.form ? all.filter(k => state.used.has(k)) : all).filter(k => !/SameAddress$/.test(k));
  for (const k of keys) { state.customer[k] = found[k]; tidy(k); }
  for (const k of keys) applyDerived(k);
  // The customer's own address is remembered (even if this form has no address box) for "same with life assured" nominees.
  for (const k of ['address1', 'address2', 'address3', 'postcode', 'town', 'state', 'country']) if (found[k]) state.ownAddress[k] = found[k];
  // "Address: same with life assured" -> copy the customer's own address into that nominee / trustee. A nominee whose
  // address is not known yet is remembered and filled as soon as the customer's address is read (either order works).
  for (const k of all.filter(k => /SameAddress$/.test(k))) state.pendingSame.add(k.replace(/SameAddress$/, ''));
  const own = { ...state.ownAddress };
  for (const x of ['address1', 'address2', 'address3', 'postcode', 'town', 'country']) if (state.customer[x]) own[x] = state.customer[x];
  let sameNote = '';
  if (own.address1 || own.postcode) {
    const copy = { Address: own.address1, Address2: own.address2, Address3: own.address3, Postcode: own.postcode, Town: own.town, Country: own.country || 'Malaysia' };
    for (const p of state.pendingSame) for (const [part, v] of Object.entries(copy)) if (v && state.used.has(p + part)) state.customer[p + part] = v;
    if (state.pendingSame.size) sameNote = ` Address filled for ${[...state.pendingSame].map(p => p.replace(/^./, c => c.toUpperCase()).replace(/(\d)$/, ' $1')).join(', ')} (same as life assured).`;
    state.pendingSame.clear();
  } else if (state.pendingSame.size) sameNote = ' The address is "same as life assured": also paste or upload the life assured address and it will be filled in.';
  writeFields(); redraw();
  const skipped = all.filter(k => !/SameAddress$/.test(k)).length - keys.length;
  const note = (skipped > 0 ? ` ${skipped} other detail(s) not used on this form were ignored.` : '') + sameNote;
  if (keys.length) toast(`Filled ${keys.length} field(s) from ${source}: ${keys.map(k => (FIELD_BY_KEY[k]?.label || k).replace(/\.$/, '')).join(', ')}.${note} Please check them.`);
  else if (sameNote.includes('(same as life assured)')) toast(sameNote.trim());
  else if (skipped) toast(`None of the details found in ${source} are used on this form.${note}`, true);
  else toast(`No customer details recognised in ${source}. You can correct the text and click "Populate details".`, true);
}
$('#pasteApply').onclick = () => applyDetails($('#pasteBox').value, 'the text');

async function handleUpload(file) {
  if (!file) return;
  if (!/^image\/|pdf$/.test(file.type) && !/\.(pdf|png|jpe?g|webp|bmp|gif)$/i.test(file.name)) return toast('Please choose a picture (JPG, PNG) or a PDF.', true);
  const status = $('#uploadStatus');
  $('#drop').classList.add('busy');
  try {
    const text = await readDocument(file, pdfjsLib, msg => (status.textContent = msg));
    $('#pasteBox').value = text.trim();
    $('.paste').open = true;
    status.textContent = `Read ${file.name}. The text found is shown under "Paste or check details".`;
    applyDetails(text, file.name);
  } catch (e) {
    console.error(e); status.textContent = ''; toast('Could not read the file: ' + e.message, true);
  } finally { $('#drop').classList.remove('busy'); $('#uploadFile').value = ''; }
}
$('#uploadFile').onchange = e => handleUpload(e.target.files[0]);
const drop = $('#drop');
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleUpload(e.dataTransfer.files[0]));
addEventListener('paste', e => {
  const img = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'));
  if (img) { e.preventDefault(); handleUpload(img); }
});

// ---------- form preview (hidden unless asked for) ----------
$('#previewToggle').onclick = async () => {
  state.preview = !state.preview;
  $('#layout').classList.toggle('no-preview', !state.preview);
  $('#previewToggle').textContent = state.preview ? 'Hide form preview' : 'Show form preview';
  if (state.preview && state.pdf) await renderPages();
};
async function renderPages() {
  const wrap = $('#pages'); wrap.innerHTML = '';
  state.pages = [];
  const ratio = window.devicePixelRatio || 1;
  for (let i = 1; i <= state.pdf.numPages; i++) {
    const page = await state.pdf.getPage(i);
    const vp = page.getViewport({ scale: state.scale });
    const div = document.createElement('div');
    div.className = 'page'; div.style.width = vp.width + 'px'; div.style.height = vp.height + 'px';
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * ratio); canvas.height = Math.floor(vp.height * ratio);
    canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px';
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.dataset.page = i;
    div.append(canvas, ov);
    div.insertAdjacentHTML('beforeend', `<span class="num">Page ${i} of ${state.pdf.numPages}</span>`);
    wrap.append(div);
    state.pages[i] = { vp, ov };
    page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : null });
  }
  $('#zoomLabel').textContent = Math.round(state.scale / 1.4 * 100) + '%';
  redraw();
}
$('#zoomIn').onclick = () => { if (state.pdf && state.scale < 3) { state.scale += 0.2; renderPages(); } };
$('#zoomOut').onclick = () => { if (state.pdf && state.scale > 0.7) { state.scale -= 0.2; renderPages(); } };

const toPx = (p, x, y) => state.pages[p].vp.convertToViewportPoint(x, y);

function redraw() {
  if (!state.preview || !state.pages.length) return;
  for (const p of state.pages) if (p) p.ov.innerHTML = '';
  const s = state.scale;
  const boxes = boxChars(state.layout, state.customer, opts());
  for (const f of state.layout) {
    const pg = state.pages[f.page]; if (!pg) continue;
    const el = document.createElement('div');
    el.className = 'f' + (f.type === 'comb' ? ' comb' : '') + (f.type === 'check' ? ' check' : '');
    const value = valueFor(f, state.customer, opts());
    if (!value) continue;
    if (f.type === 'comb') {
      const x0 = f.cells[0].x, last = f.cells[f.cells.length - 1];
      const [l, t] = toPx(f.page, x0, f.y + f.h), [r, b] = toPx(f.page, last.x + last.w, f.y);
      Object.assign(el.style, { left: l + 'px', top: t + 'px', width: r - l + 'px', height: b - t + 'px' });
      const size = (f.size || Math.min(10, Math.max(6, f.h * 0.62))) * s;
      const chars = boxes.get(f) || [];
      el.innerHTML = f.cells.map((c, i) => `<span class="c" style="left:${(c.x - x0) * s}px;width:${c.w * s}px;font-size:${size}px">${esc(chars[i] || '')}</span>`).join('');
    } else if (f.type === 'check') {
      const sz = (f.size || 9);
      const [l, t] = toPx(f.page, f.x, f.y + sz);
      Object.assign(el.style, { left: l + 'px', top: t + 'px', width: sz * s + 'px', height: sz * s + 'px' });
      el.innerHTML = '<svg viewBox="0 0 10 10"><polyline points="0,5.5 3.5,9 10,0" fill="none" stroke="#0d1a73" stroke-width="1.4"/></svg>';
    } else {
      let size = f.size || 9;
      const max = f.w || 300;
      while (size > 5 && measure(value, size) > max) size -= 0.5;
      const [l, base] = toPx(f.page, f.x, f.y);
      Object.assign(el.style, { left: l + 'px', top: base - size * s * 0.78 + 'px', fontSize: size * s + 'px' });
      el.textContent = value;
    }
    pg.ov.append(el);
  }
}

// ---------- output ----------
function outName(form) {
  const who = (state.customer.ownerName || state.customer.companyName || 'Customer').trim();
  const d = new Date().toISOString().slice(0, 10);
  return `${who} - ${form.name} - ${d}.pdf`.replace(/[\\/:*?"<>|]+/g, '_');
}
$('#download').onclick = async () => {
  if (!state.form) return;
  try {
    const bytes = await fillPdf(PDFLib, state.bytes.slice(0), state.layout, state.customer, opts());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = outName(state.form); a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (e) { console.error(e); toast('Could not create the PDF: ' + e.message, true); }
};

// ---------- start ----------
// The agent's own details: remembered on this device (typed once), and on the computer version also pre-filled from agent-defaults.js (never published).
const AGENT_STORE = 'form-filler-agent';
const agentKeys = FIELDS.filter(f => f.group === 'agent' && !f.sources).map(f => f.key);
const saveAgent = () => { try { localStorage.setItem(AGENT_STORE, JSON.stringify(Object.fromEntries(agentKeys.map(k => [k, state.customer[k] || ''])))); } catch {} };
{
  let defaults = {}, saved = {};
  if (!STATIC) { try { defaults = (await import('./agent-defaults.js')).default || {}; } catch {} }
  try { saved = JSON.parse(localStorage.getItem(AGENT_STORE) || '{}'); } catch {}
  for (const k of agentKeys) { const v = saved[k] || defaults[k]; if (v) state.customer[k] = v; }
}
loadForms().catch(e => toast('Could not reach the Form Filler server: ' + e.message, true));
