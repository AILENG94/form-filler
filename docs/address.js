// Address and nominee text helpers, shared by the policy lookup (server) and the document reader (browser).

// "76, TAMAN PULASAN, JALAN ALOR MENGKUDU, 05400 ALOR SETAR" -> up to 3 address lines + postcode + town (+ state)
const STATES = /\b(JOHOR|KEDAH|KELANTAN|MELAKA|NEGERI SEMBILAN|PAHANG|PERAK|PERLIS|PULAU PINANG|PENANG|SABAH|SARAWAK|SELANGOR|TERENGGANU|KUALA LUMPUR|LABUAN|PUTRAJAYA)\b/i;
export function splitAddress(raw) {
  const out = { address1: '', address2: '', address3: '', postcode: '', town: '', state: '' };
  let s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return out;
  const m = s.match(/(\d{5})\s+([^,]*?)\s*(?:,\s*(.*))?$/);
  if (m) {
    out.postcode = m[1]; out.town = m[2].trim();
    s = s.slice(0, m.index).replace(/[,\s]+$/, '');
    if (m[3] && STATES.test(m[3])) out.state = m[3].trim();
  }
  let parts = s.split(/\s*,\s*/).filter(Boolean);
  // a trailing state before the postcode ("..., PULAU PINANG, 11950 ...") is the state, not part of the street
  if (!out.state && parts.length && STATES.test(parts.at(-1)) && parts.at(-1).split(' ').length <= 3) out.state = parts.pop();
  const lines = [''];
  for (const part of parts) {
    const cur = lines.at(-1);
    if (cur && (cur + ', ' + part).length > 34 && lines.length < 3) {
      if (part.length > 34) {
        // one part too long for a line on its own: wrap the rest of the address by words
        const words = ((cur ? cur + ', ' : '') + part).split(' '), wrapped = [''];
        for (const w of words) {
          if (wrapped.at(-1) && (wrapped.at(-1) + ' ' + w).length > 34) wrapped.push(w); else wrapped[wrapped.length - 1] = wrapped.at(-1) ? wrapped.at(-1) + ' ' + w : w;
        }
        lines.splice(lines.length - 1, 1, ...wrapped.slice(0, 3 - (lines.length - 1)));
      } else lines.push(part);
    } else lines[lines.length - 1] = cur ? cur + ', ' + part : part;
  }
  [out.address1, out.address2, out.address3] = [lines[0] || '', lines[1] || '', lines[2] || ''];
  return out;
}

// "Mother / CHAN PEOI FUN / Father / TAN TEIK CHUAN" -> [{ relationship, name }, …]
export function splitNominees(raw) {
  const t = String(raw || '').split(/\s*\/\s*/).map(x => x.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 1 < t.length; i += 2) out.push({ relationship: t[i], name: t[i + 1] });
  return out;
}

