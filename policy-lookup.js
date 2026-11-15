// Looks a policy up in the "Individual Policy Summary" workbook (GE ePartner export), by policy number.
// The file is read on this computer only and re-read whenever it changes.
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { splitAddress, splitNominees } from './public/address.js';

// Where the policy workbook is: the POLICY_FILE environment variable, else the first line of policy-file.txt (local only, not published).
const fileSetting = () => { try { return fs.readFileSync(new URL('./policy-file.txt', import.meta.url), 'utf8').split('\n')[0].trim(); } catch { return ''; } };
const CONFIGURED = process.env.POLICY_FILE || fileSetting() || 'Individual Policy Summary.xlsx';

// The newest "Individual Policy Summary - ....xlsx" in the same folder is used, so a freshly exported file is picked up automatically.
const NAME = /^Individual Policy Summary - .*\.xlsx$/i;
function newestPolicyFile() {
  try {
    const dir = path.dirname(CONFIGURED);
    const files = fs.readdirSync(dir)
      .filter(f => NAME.test(f) && !/UPDATED/i.test(f))
      .map(f => ({ file: path.join(dir, f), t: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    return files.length ? files[0].file : CONFIGURED;
  } catch { return CONFIGURED; }
}
export let POLICY_FILE = newestPolicyFile();

let cache = null; // { file, mtime, byPolicy: Map, gender: Map }

const val = v => (v && typeof v === 'object' && 'result' in v ? v.result : v);
const text = v => { v = val(v); return v == null ? '' : String(v).trim(); };
const fmtDate = v => {
  v = val(v);
  if (v instanceof Date) return `${String(v.getUTCDate()).padStart(2, '0')}/${String(v.getUTCMonth() + 1).padStart(2, '0')}/${v.getUTCFullYear()}`;
  return text(v);
};

async function load() {
  POLICY_FILE = newestPolicyFile();
  const stat = fs.statSync(POLICY_FILE);
  if (cache && cache.file === POLICY_FILE && cache.mtime === stat.mtimeMs) return cache;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(POLICY_FILE)); // a copy in memory, so Excel can keep the file open
  const sheetRows = (name, headerRow = 1) => {
    const ws = wb.getWorksheet(name);
    if (!ws) throw new Error(`The sheet "${name}" is not in the policy file.`);
    const head = ws.getRow(headerRow).values.slice(1).map(text);
    const rows = [];
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const vals = ws.getRow(r).values.slice(1);
      if (!vals.some(v => text(v))) continue;
      rows.push(Object.fromEntries(head.map((h, i) => [h, vals[i]])));
    }
    return rows;
  };
  const byPolicy = new Map();
  for (const r of sheetRows('Policy Summary')) {
    const no = text(r['Policy No']);
    if (no) byPolicy.set(no, r);
  }
  const gender = new Map(); // "NAME|dd/mm/yyyy" -> Male / Female
  for (const r of sheetRows('Individual Summary', 4)) {
    const g = text(r['Gender']);
    if (g) gender.set(`${text(r['Life Assured']).toUpperCase()}|${fmtDate(r['Date of Birth'])}`, g);
  }
  cache = { file: POLICY_FILE, mtime: stat.mtimeMs, byPolicy, gender };
  return cache;
}

const cap = s => s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());

export async function lookupPolicy(policyNo) {
  const no = String(policyNo || '').replace(/\D/g, '');
  const { byPolicy, gender } = await load();
  const r = byPolicy.get(no);
  if (!r) return null;
  const dob = text(r['LA DOB (key)']);
  const la = text(r['Life Assured']), holder = text(r['Policyholder']);
  const addr = splitAddress(text(r['Address']));
  const nominees = splitNominees(text(r['Nominee']));
  const c = {
    policyNo: no, planName: text(r['Plan Name']),
    laName: la, laDob: dob, laGender: gender.get(`${la.toUpperCase()}|${dob}`) || '',
    ownerName: holder,
    mobile: text(r['Mobile']), ...addr, country: addr.postcode ? 'Malaysia' : '',
    bankName: text(r['Direct Credit Bank']) || '',
    carReg: text(r['Car Registration No']),
  };
  // the policyholder is the life assured: same person, same date of birth / gender
  if (holder.toUpperCase() === la.toUpperCase()) { c.ownerDob = dob; c.ownerGender = c.laGender; }
  nominees.slice(0, 2).forEach((n, i) => { c[`nominee${i + 1}Name`] = n.name; c[`nominee${i + 1}Relationship`] = cap(n.relationship); });
  for (const k of Object.keys(c)) if (c[k] === '') delete c[k];
  return {
    customer: c,
    info: { commencement: fmtDate(r['Commencement']), premiumStatus: text(r['Premium Status']), paymentMethod: text(r['Payment Method']),
      nominees: text(r['Nominee']), source: POLICY_FILE },
  };
}
