import fs from 'fs';
let s = fs.readFileSync('public/extract.js', 'utf8');
const rep = (a, b) => { if (!s.includes(a)) throw new Error('nf: ' + a.slice(0, 50)); s = s.replace(a, () => b); };
rep("  if (/Name$|^town$|^state$|^country$|Nationality$/.test(key))", "  if (/Nationality$/.test(key) && /^(malaysia|malaysian|warganegara|wn)\b/i.test(v)) return 'Malaysian';\n  if (/Name$|^town$|^state$|^country$|Nationality$/.test(key))");
rep("mobile: 'Mobile', address1: 'Address', postcode: 'Postcode', town: 'Town', share: 'Share' };", "mobile: 'Mobile', address1: 'Address', postcode: 'Postcode', town: 'Town', share: 'Share', ownerNationality: 'Nationality' };");
const marker = "  if (!out.ownerGender) { if (/\bLELAKI\b/.test(all)) out.ownerGender = 'Male'; else if (/\bPEREMPUAN\b/.test(all)) out.ownerGender = 'Female'; }\n  return out;";
rep(marker, marker.replace("  return out;", `  // "Address: same with life assured" for a nominee / trustee: not an address, but a request to copy the customer's own
  for (const k of Object.keys(out)) {
    if (/^(nominee|trustee)\dAddress$/.test(k) && /^(address\s*)?\(?\s*(same\s+(as|with)|sama\s+dengan)\b/i.test(out[k])) { delete out[k]; out[k.replace(/Address$/, 'SameAddress')] = 'Yes'; }
  }
  return out;`));
fs.writeFileSync('public/extract.js', s);
let a = fs.readFileSync('public/app.js', 'utf8');
const old = "  for (const k of keys) applyDerived(k);\n  writeFields(); redraw();\n  const skipped = all.length - keys.length;";
if (!a.includes(old)) throw new Error('app');
a = a.replace(old, () => `  for (const k of keys) applyDerived(k);
  // "Address: same with life assured" -> copy the customer's own address into that nominee / trustee
  let sameNote = '';
  for (const k of all.filter(k => /SameAddress$/.test(k))) {
    const p = k.replace(/SameAddress$/, ''), c = state.customer;
    if (!(c.address1 || c.postcode)) { sameNote += ' The address is "same as life assured", but no customer address is filled in yet — fill that in first, then click Populate details again.'; continue; }
    const copy = { Address: c.address1, Address2: c.address2, Address3: c.address3, Postcode: c.postcode, Town: c.town, Country: c.country || 'Malaysia' };
    for (const [part, v] of Object.entries(copy)) if (v && state.used.has(p + part)) state.customer[p + part] = v;
  }
  writeFields(); redraw();
  const skipped = all.filter(k => !/SameAddress$/.test(k)).length - keys.length;`);
a = a.replace("const keys = state.form ? all.filter(k => state.used.has(k)) : all;", "const keys = (state.form ? all.filter(k => state.used.has(k)) : all).filter(k => !/SameAddress$/.test(k));");
a = a.replace("const note = skipped ? ` ${skipped} other detail(s) not used on this form were ignored.` : '';", () => "const note = (skipped > 0 ? ` ${skipped} other detail(s) not used on this form were ignored.` : '') + sameNote;");
fs.writeFileSync('public/app.js', a);
