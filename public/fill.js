// Turns a customer record + a form layout into values, and writes them onto the PDF with pdf-lib.

import { FIELD_BY_KEY } from './fields.js';

// Malaysian NRIC as xxxxxx-xx-xxxx (other IDs, e.g. passports, are left as typed).
export function formatNric(s) {
  const d = String(s || '').replace(/[\s-]/g, '');
  return /^\d{12}$/.test(d) ? `${d.slice(0, 6)}-${d.slice(6, 8)}-${d.slice(8)}` : String(s || '').trim();
}

// Malaysian mobile always with +60: 012-345 6789 / 60123456789 -> +6012-345 6789 (foreign numbers left as typed).
export function formatMobile(s) {
  const raw = String(s || '').trim();
  if (raw.startsWith('+') && !raw.startsWith('+60')) return raw;
  const d = raw.replace(/\D/g, '').replace(/^60/, '').replace(/^0/, '');
  if (!/^1\d{8,9}$/.test(d)) return raw;
  const rest = d.slice(2);
  return `+60${d.slice(0, 2)}-${rest.length === 8 ? rest.slice(0, 4) + ' ' + rest.slice(4) : rest.slice(0, 3) + ' ' + rest.slice(3)}`;
}

export function resolveValue(key, customer, opts = {}) {
  let v = customer[key];
  const def = FIELD_BY_KEY[key];
  if ((v == null || v === '') && def && def.fallback) v = customer[def.fallback];
  if (def && def.pick) v = def.pick.map(k => customer[k]).find(x => x != null && String(x).trim() !== '');
  const city = [[customer.postcode, customer.town].filter(Boolean).join(' '), customer.state].filter(Boolean).join(', ');
  if (key === 'cityLine') v = city;
  if (key === 'holderName') v = customer.companyName || customer.ownerName;
  if (key === 'holderId') v = customer.companyRegNo || customer.ownerNric;
  if (key === 'agentAddress23') v = [customer.agentAddress2, customer.agentCityLine].filter(Boolean).join(' ');
  if (key === 'streetLine') v = [customer.address1, customer.address2].filter(Boolean).join(', ');
  if (key === 'mobileCC' || key === 'mobileNoZero') {
    const digits = String(customer.mobile || '').replace(/\D/g, '').replace(/^6?0/, '');
    v = digits.length >= 8 ? (key === 'mobileCC' ? '60' : digits) : '';
  }
  if (key === 'mobileCode' || key === 'mobilePrefix' || key === 'mobileRest') {
    // 012-345 6789 / +6012-3456789 -> "12" and "3456789"
    const digits = String(customer.mobile || '').replace(/\D/g, '').replace(/^6?0/, '');
    v = digits.length >= 8 ? (key === 'mobileRest' ? digits.slice(2) : (key === 'mobileCode' ? '+60' : '') + digits.slice(0, 2)) : '';
  }
  // Third-party policy (proposer is not the life assured): the proposer is the patient's parent.
  if (key === 'parentRel' && !v) {
    const o = String(customer.ownerName || '').trim().toUpperCase(), l = String(customer.laName || '').trim().toUpperCase();
    v = o && l && o !== l ? 'PARENTS' : '';
  }
  if (key === 'laAge') {
    const m = String(customer.laDob || customer.ownerDob || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) {
      const now = new Date(), [d, mo, y] = [+m[1], +m[2], +m[3]];
      v = String(now.getFullYear() - y - (now.getMonth() + 1 < mo || (now.getMonth() + 1 === mo && now.getDate() < d) ? 1 : 0));
    }
  }
  if (key === 'fullAddress') v = [customer.address1, customer.address2, city].filter(Boolean).join(', ');
  v = v == null ? '' : String(v).trim();
  if (/Nric$/.test(key)) v = formatNric(v);
  if (key !== 'agentMobile' && ((def && def.mobile) || /Mobile$/.test(key))) v = formatMobile(v); // the agent's number is written exactly as typed
  if (opts.upper !== false && !(def && def.key === 'email')) v = v.toUpperCase();
  return v;
}

export function valueFor(field, customer, opts) {
  if (field.type === 'check') {
    const actual = resolveValue(field.key, customer, { upper: false }).toLowerCase();
    if (field.when === '*') return actual ? 'X' : ''; // tick whenever the detail is filled in
    // "!Husband|Wife|…" = the "Others" box: tick when filled in and not one of the listed choices.
    if (String(field.when || '').startsWith('!')) return actual && !field.when.slice(1).toLowerCase().split('|').includes(actual) ? 'X' : '';
    return actual && actual === String(field.when || '').toLowerCase() ? 'X' : '';
  }
  if (field.type === 'static') return field.text || '';
  const v = resolveValue(field.key, customer, opts);
  // An "Others: ____" box is written only when the value is not one of the ticked choices.
  if (field.skipIf && field.skipIf.split('|').includes(v.toLowerCase())) return '';
  // "(if other than Life Assured)" boxes stay blank when it is the same person.
  if (field.ifDiff && v && v.toUpperCase() === resolveValue(field.ifDiff, customer, opts).toUpperCase()) return '';
  // Phone numbers in letter boxes: digits only.
  if (field.type === 'comb' && /^(mobile|homeTel|officeTel)$|Mobile$/.test(field.key)) return v.replace(/[^\d+]/g, '');
  return v;
}

// Characters to put into a row of boxes: drop separators when the value is too long for the boxes.
export function combChars(value, n) {
  let v = value;
  // DD/MM/YYYY into six boxes (DD MM YY).
  const d = v.match(/^(\d{2})\/(\d{2})\/\d{2}(\d{2})$/);
  if (d && n === 6) v = d[1] + d[2] + d[3];
  if (v.length > n) v = v.replace(/[\s\-\/.,+]/g, '');
  return v.slice(0, n).split('');
}

// Characters for every letter-box field. A field marked `cont` carries on from the previous
// letter-box field of the same detail (a long name or address flowing onto the next row of boxes).
export function boxChars(layout, customer, opts) {
  const out = new Map();
  layout.forEach((f, i) => {
    if (f.type !== 'comb' || f.cont) return;
    const group = [f];
    for (const g of layout.slice(i + 1)) {
      if (g.type !== 'comb' || g.key !== f.key) continue;
      if (!g.cont) break;
      group.push(g);
    }
    const n = group.reduce((n, g) => n + g.cells.length, 0);
    let chars = combChars(valueFor(f, customer, opts), n);
    if (f.right && chars.length) chars = [...Array(n - chars.length).fill(''), ...chars]; // numbers such as "% of share" sit at the right
    let k = 0;
    for (const g of group) { out.set(g, chars.slice(k, k + g.cells.length)); k += g.cells.length; }
  });
  return out;
}

// Helvetica (WinAnsi) cannot draw every character; swap the unsupported ones.
function safe(font, s) {
  return [...s].map(ch => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
}

export async function fillPdf(PDFLib, bytes, layout, customer, opts = {}) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.05, 0.1, 0.45); // dark blue ink, as most forms request
  const pages = doc.getPages();
  const boxes = boxChars(layout, customer, opts);
  for (const f of layout) {
    const page = pages[f.page - 1];
    if (!page) continue;
    if (f.type === 'comb') {
      const chars = (boxes.get(f) || []).map(ch => safe(font, ch)); // keep empty boxes (right-aligned numbers)
      if (!chars.some(Boolean)) continue;
      const size = f.size || Math.min(10, Math.max(6, f.h * 0.62));
      chars.forEach((ch, i) => {
        const c = f.cells[i];
        if (!ch || !c) return;
        const w = font.widthOfTextAtSize(ch, size);
        page.drawText(ch, { x: c.x + (c.w - w) / 2, y: f.y + (f.h - size * 0.72) / 2, size, font, color: ink });
      });
      continue;
    }
    const value = safe(font, valueFor(f, customer, opts));
    if (!value) continue;
    if (f.type === 'check') {
      const s = f.size || 9;
      page.drawLine({ start: { x: f.x, y: f.y + s * 0.45 }, end: { x: f.x + s * 0.35, y: f.y + s * 0.1 }, thickness: 1.3, color: ink });
      page.drawLine({ start: { x: f.x + s * 0.35, y: f.y + s * 0.1 }, end: { x: f.x + s, y: f.y + s }, thickness: 1.3, color: ink });
    } else {
      let size = f.size || 9;
      const max = f.w || 300;
      while (size > 5 && font.widthOfTextAtSize(value, size) > max) size -= 0.5;
      page.drawText(value, { x: f.x, y: f.y, size, font, color: ink });
    }
  }
  return doc.save();
}
