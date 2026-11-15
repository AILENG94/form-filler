// Per-form corrections on top of auto-detection, used by tools/build-layouts.js to write layouts/*.json.
// Row (R#) and line (L#) numbers come from `node tools/list.js <form>` / `node tools/review.js <form>`.
// See tools/layout-kit.js for the meaning of each entry.

// A "Signature of Trustee / Nominee / Parent" block: signer n (trustee n if appointed, else nominee n).
// lines = [name, nric, extra] line numbers; extra is the block's Date / Tel / Date of Birth line.
const signer = (page, n, [name, nric, extra], extraKey = 'signDate') => [
  { page, line: name, key: `signer${n}Name` },
  { page, line: nric, key: `signer${n}Nric` },
  ...(extra != null ? [{ page, line: extra, key: extraKey === 'signDate' ? 'signDate' : `signer${n}${extraKey}` }] : []),
];
// The witness block next to it: the agent.
const witness = (page, [name, nric, tel]) => [
  { page, line: name, key: 'agentName' }, { page, line: nric, key: 'agentNric' },
  ...(tel != null ? [{ page, line: tel, key: 'agentMobile' }] : []),
];

// Nomination form (NBZ-FNOMI): nominee, trustee and witness blocks. Row numbers from `node tools/list.js "NOMINATION FORM" <page>`.
// Blocks for people the app holds details for (Nominee 1-2, Trustee 1-2) fill from those details; every other block
// (Nominee 3-4, witnesses, the consent table) is a list of form items to type in.
function nominationPeople() {
  const first = rows => (rows[0] && rows[0].span ? rows[0] : { row: rows[0] });
  // ---- details held in the app
  const person = (page, kind, n, r, relY) => {
    const key = p => `${kind}${n}${p}`;
    const addr = ['Address', 'Address2', 'Address3'];
    return {
      rows: [
        { page, ...first(r.name), key: key('Name') }, ...r.name.slice(1).map(row => ({ page, row, key: key('Name'), cont: true })),
        { page, row: r.nric, key: key('Nric') }, { page, row: r.expiry, key: key('PassportExpiry') }, { page, row: r.dob, key: key('Dob') },
        ...(r.share != null ? [{ page, row: r.share, key: key('Share'), right: true }] : []),
        ...r.addr.map((row, i) => ({ page, row, key: key(addr[i]) })),
        { page, row: r.postcode, key: key('Postcode') }, { page, row: r.town, key: key('Town') }, { page, row: r.country, key: key('Country') },
        { page, row: r.nat + 2, key: key('Nationality'), skipIf: 'malaysian' },
        ...(r.tel != null ? [{ page, row: r.tel, key: key('Mobile') }] : []),
      ],
      ticks: [
        { page, row: r.male, key: key('Gender'), when: 'Male' }, { page, row: r.male + 1, key: key('Gender'), when: 'Female' },
        { page, row: r.nat, key: key('Nationality'), when: 'Malaysian' }, { page, row: r.nat + 1, key: key('Nationality'), when: '!Malaysian' },
        ...(relY ? relationTicks(page, key('Relationship'), relY) : []),
        ...(r.hp != null ? [{ page, row: r.hp, key: key('Mobile'), when: '*' }] : []),
      ],
      text: relY ? [{ page, key: key('Relationship'), x: 506, y: relY - 1, w: 52, size: 7, skipIf: RELATIONS.join('|').toLowerCase() }] : [],
    };
  };
  // ---- blocks typed in by hand
  const block = (page, who, r, relY) => {
    const L = t => `${who} – ${t}`;
    return {
      itemRows: [
        { page, ...first(r.name), label: L('Full Name (line 1)') }, ...r.name.slice(1).map((row, i) => ({ page, row, label: L(`Full Name (line ${i + 2})`) })),
        { page, row: r.nric, label: L('NRIC / Passport No.') }, { page, row: r.expiry, label: L('Passport Expiry Date') },
        ...(r.dob != null ? [{ page, row: r.dob, label: L('Date of Birth') }] : []),
        ...(r.share != null ? [{ page, row: r.share, label: L('% of Share'), right: true }] : []),
        ...(r.nat != null ? [{ page, row: r.nat + 2, label: L('Nationality – others (please state)') }] : []),
        ...r.addr.map((row, i) => ({ page, row, label: L(`Mailing Address (line ${i + 1})`) })),
        { page, row: r.postcode, label: L('Postcode') }, { page, row: r.town, label: L('Town') }, { page, row: r.country, label: L('Country') },
      ],
      itemTicks: [
        ...(r.male != null ? [{ page, row: r.male, label: L('Gender'), when: 'Male' }, { page, row: r.male + 1, label: L('Gender'), when: 'Female' }] : []),
        ...(r.nat != null ? [{ page, row: r.nat, label: L('Nationality'), when: 'Malaysian' }, { page, row: r.nat + 1, label: L('Nationality'), when: 'Others' }] : []),
        ...(relY ? [...RELATIONS, 'Others'].map((rel, i) => ({ page, label: L('Relationship'), when: rel, x: REL_X[i] - 14, y: relY - 2.5, w: 9, h: 9 })) : []),
      ],
      itemText: relY ? [{ page, x: 506, y: relY - 1, w: 52, size: 7, label: L('Relationship – others (please state)') }] : [],
    };
  };
  const parts = [
    person(1, 'nominee', 1, { name: [{ span: [16, 17] }, 18, 19], nric: 21, expiry: 22, share: 23, male: 25, dob: 27, nat: 29, addr: [32, 33, 34], postcode: 35, town: 36, country: 37 }, 151.9),
    person(2, 'nominee', 2, { name: [7, 8, 9], nric: 11, expiry: 12, share: 13, male: 15, dob: 17, nat: 19, addr: [22, 23, 24], postcode: 25, town: 26, country: 27 }, 613.4),
    person(4, 'trustee', 1, { name: [6, 7, 8], nric: 9, expiry: 10, dob: 11, male: 12, nat: 14, tel: 20, hp: 23, addr: [26, [27, 28], 29], postcode: 30, town: 31, country: 32 }),
    person(4, 'trustee', 2, { name: [33, 34, 35], nric: 36, expiry: 37, dob: 40, male: 38, nat: 41, tel: 47, hp: 50, addr: [53, 54, 55], postcode: 56, town: 57, country: 58 }),
    person(2, 'nominee', 3, { name: [28, 29, 30], nric: 32, expiry: 33, share: 34, male: 36, dob: 38, nat: 40, addr: [43, 44, 45], postcode: 46, town: 47, country: 48 }, 372.6),
    person(2, 'nominee', 4, { name: [49, 50, 51], nric: 53, expiry: 54, share: 55, male: 57, dob: 59, nat: 61, addr: [73, 74, 75], postcode: 76, town: 77, country: 78 }, 144.6),
    block(3, "Witness to Proposer's declaration", { name: [9, 10], nric: 11, expiry: 12, dob: 14, addr: [15, 16, 17], postcode: 18, town: 19, country: 20 }),
    block(5, 'Witness to consent', { name: [6, 7], nric: 8, expiry: 9, dob: 10, addr: [11, 12, 13], postcode: 14, town: 15, country: 16 }),
    // trustee extras: country of birth and the telephone type (Handphone is ticked automatically)
    ...[[1, 17, 22], [2, 44, 49]].map(([n, cob, tel]) => ({
      itemTicks: [
        { page: 4, row: cob, label: `Trustee ${n} – Country of Birth`, when: 'Malaysian' }, { page: 4, row: cob + 1, label: `Trustee ${n} – Country of Birth`, when: 'Others' },
        { page: 4, row: tel, label: `Trustee ${n} – Tel No. is a House number`, when: 'Yes' }, { page: 4, row: tel + 2, label: `Trustee ${n} – Tel No. is an Office number`, when: 'Yes' },
      ],
      itemRows: [{ page: 4, row: cob + 2, label: `Trustee ${n} – Country of Birth – others (please state)` }],
    })),
    // page 1: "Do you have any children?" (No / Yes) and how many
    { itemTicks: [{ page: 1, x: 396, y: 708, w: 9, h: 9, label: 'Do you have any children?', when: 'No' }, { page: 1, x: 436, y: 708, w: 9, h: 9, label: 'Do you have any children?', when: 'Yes' }],
      itemRows: [{ page: 1, row: 15, label: 'Number of children' }] },
    // consent signature dates, one per signer
    { itemRows: [17, 18, 19, 20].map((row, i) => ({ page: 5, row, label: `Consent signature date – Signer ${i + 1}` })) },
  ];
  // the consent table on page 5: one column per signer, the witness being the agent in the first column
  const grids = [{
    page: 5, cols: [125.8, 235.8, 344.8, 453.4, 562.8], heads: ['Signer 1', 'Signer 2', 'Signer 3', 'Signer 4'],
    rows: [
      { top: 443.5, bottom: 417.0, label: 'Consent – Name' }, { top: 417.0, bottom: 390.9, label: 'Consent – NRIC / Passport No.' },
      { top: 301.5, bottom: 271.4, label: 'Consent witness – Name', map: { 0: 'agentName' } },
      { top: 271.4, bottom: 240.9, label: 'Consent witness – IAC No.', map: { 0: 'agentCode' } },
      { top: 229.2, bottom: 204.1, label: 'Consent witness – NRIC / Passport No.', map: { 0: 'agentNric' } },
      { top: 204.1, bottom: 180.2, label: 'Consent witness – Date of Birth', map: { 0: 'agentDob' } },
      { top: 180.2, bottom: 147.6, label: 'Consent witness – Passport Expiry Date' },
      { top: 147.6, bottom: 123.9, label: 'Consent witness – Address', map: { 0: ['agentAddress', 'agentAddress2'] }, size: 6.8 },
      { top: 123.9, bottom: 101.2, label: 'Consent witness – Postcode', map: { 0: 'agentPostcode' } },
      { top: 101.2, bottom: 80.2, label: 'Consent witness – Town', map: { 0: 'agentTown' } },
      { top: 80.2, bottom: 58.0, label: 'Consent witness – Country', map: { 0: 'agentCountry' } },
    ],
  }];
  const all = k => parts.flatMap(p => p[k] || []);
  return {
    rows2: all('rows'), ticks2: all('ticks'), text2: all('text'), itemRows: all('itemRows'), itemTicks: all('itemTicks'), itemText: all('itemText'), grids,
    lines2: [{ page: 4, line: 109, key: 'trustee1Name', x: 202 }, { page: 4, line: 110, key: 'trustee2Name', x: 334 }],
  };
}

const REL_X = [122.8, 172.3, 211.2, 248.4, 299.3, 343.2, 388.2, 434.3, 476.4];

const RELATIONS = ['Husband', 'Wife', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister'];
// Relationship tick boxes ("Husband … Sister, Others ____") on the nominee blocks. y = baseline of the labels.
const relationTicks = (page, key, y, xs = [122.8, 172.3, 211.2, 248.4, 299.3, 343.2, 388.2, 434.3, 476.4]) => [
  ...RELATIONS.map((r, i) => ({ page, key, when: r, x: xs[i] - 14, y: y - 2.5, size: 9 })),
  { page, key, when: '!' + RELATIONS.join('|'), x: xs[8] - 14, y: y - 2.5, size: 9 },
];

// Partial-withdrawal fund table of the two Discharge Vouchers: per fund a tick (ticked automatically) plus Amount (RM) and Units.
const ROWS_T = [[631.4, 608.0], [608.0, 587.0], [587.0, 564.4], [564.4, 541.6], [541.6, 518.4], [518.4, 495.9], [495.9, 474.0], [474.0, 452.0], [452.0, 411.3], [411.3, 370.0]];
const TICK_Y = [618, 597, 575, 552, 529, 505, 483, 462, 438, 398];
function fundTable(page, prefix, left, right, rows = ROWS_T, geo = { l: [181.3, 243.4, 299.0], r: [442.4, 504.8, 567.8], tl: 29.5, tr: 303.5 }, tickY = TICK_Y) {
  const mk = (list, cols) => ({ page, cols, heads: ['Amount (RM)', 'Units'], size: 8.5,
    rows: list.map((name, i) => ({ top: rows[i][0], bottom: rows[i][1], label: `${prefix}${name}` })) });
  const ticks = (list, x) => list.flatMap((name, i) => ['Amount (RM)', 'Units'].map(h => ({
    page, x, y: tickY[i] - 0.5, size: 8.5, key: itemKey(`${prefix}${name} – ${h}`), when: '*' })));
  return { grids: [mk(left, geo.l), mk(right, geo.r)], ticks: [...ticks(left, geo.tl), ...ticks(right, geo.tr)] };
}
const FUNDS_L = ['F01 Lion Balanced Fund (L)', 'F02 Lion Growth Fund* (L)', 'F03 Dana Restu* (L)', 'F04 Lion Fixed Income Fund (L)', 'F05 Lion Progressive Fund (L)',
  'F06 Dana Sejati (L)', 'F09 Lion Strategic Fund** (L)', 'F21 Lion Advanced Strategic Fund (L)', 'F27 Lion Equity Global Sustainability Fund (F)', 'F29 Lion Dividend Fund (RM-Unhedged) (F)'];
const FUNDS_R = ['F10 Lion US-i Fund (F)', 'F11 Lion UK-i Fund (F)', 'F12 Lion AU-i Fund (F)', 'F16 Lion Asia Pac Fund (F)', 'F17 Lion Enhanced Equity Fund (L)',
  'F18 Dana Gemilang (L)', 'F22 Lion Small Mid Cap (L)', 'F26 Lion ASEAN Fund (L)', 'F28 Lion Physical Gold Fund (F)'];

// ILP Application for Amendment (CSD-PSF06A): every part spelled out so each box has a clear name, in the form's order.
// Row numbers come from `node tools/list.js "ILP APPLICATION" <page>`.
const slug = s => {
  const t = s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (t.length <= 40) return t;
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return t.slice(0, 32) + '_' + h.toString(36); // long labels keep a short fingerprint so similar ones stay apart
};
const itemKey = label => 'q_' + slug(label);
function ilpFix() {
  // ---- A. fund table (page 1): one percentage box per fund, ticked automatically when a percentage is typed
  const LEFT = [['F01 Lion Balanced Fund (L)', 509.7, 490.2], ['F02 Lion Growth Fund* (L)', 490.2, 470.5], ['F03 Dana Restu* (L)', 470.5, 452.4],
    ['F04 Lion Fixed Income Fund (L)', 452.4, 433.3], ['F05 Lion Progressive Fund (L)', 433.3, 413.8], ['F06 Dana Sejati (L)', 413.8, 394.2],
    ['F09 Lion Strategic Fund** (L)', 394.2, 374.2], ['F21 Lion Advanced Strategic Fund (L)', 374.2, 354.6],
    ['F27 Lion Equity Global Sustainability Fund (F)', 354.6, 334.6], ['F29 Lion Dividend Fund (RM-Unhedged) (F)', 334.6, 315.0]];
  const RIGHT = [['F10 Lion US-i Fund (F)', 509.7, 490.2], ['F11 Lion UK-i Fund (F)', 490.2, 470.5], ['F12 Lion AU-i Fund (F)', 470.5, 452.4],
    ['F16 Lion Asia Pac Fund (F)', 452.4, 433.3], ['F17 Lion Enhanced Equity Fund (F)', 433.3, 413.8], ['F18 Dana Gemilang (F)', 413.8, 394.2],
    ['F22 Lion Small Mid Cap (F)', 394.2, 374.2], ['F26 Lion ASEAN Fund (F)', 374.2, 354.6], ['F28 Lion Physical Gold Fund (F)', 354.6, 334.6]];
  const grid = (cols, list) => ({ page: 1, cols, heads: ['Percentage (%)'], size: 9,
    rows: list.map(([name, top, bottom]) => ({ top, bottom, label: `A. ${name}` })) });
  const fundTicks = (list, x, size) => list.map(([name, top, bottom]) =>
    ({ page: 1, x, y: (top + bottom) / 2 - size / 2, size, key: itemKey(`A. ${name} – Percentage (%)`), when: '*' }));

  // ---- 2(b) occupation table (page 2)
  const occupation = { page: 2, cols: [123.2, 345.6, 564.6], heads: ['Life Assured', 'Policyowner / Assured'], size: 9, rows: [
    { top: 370.0, bottom: 349.9, label: 'C. 2(b)(i) Occupation' }, { top: 349.9, bottom: 323.2, label: 'C. 2(b)(ii) Exact nature of work' },
    { top: 323.2, bottom: 296.7, label: 'C. 2(b)(iii) Nature of Business' },
    { top: 296.7, bottom: 274.2, label: 'C. 2(b)(iv) Employer / Business name & address (line 1)' },
    { top: 274.2, bottom: 251.8, label: 'C. 2(b)(iv) Employer / Business name & address (line 2)' }] };
  const INCOME = ['No Income', '8,000', '15,000', '30,000', '50,000', '75,000', '100,000', '200,000'];
  const income = (who, rows1, rows2, other, amounts) => [
    ...[...rows1, ...rows2].map((row, i) => ({ page: 2, row, label: `C. 2(b)(v) Annual Earned Income (RM) up to – ${who}`, when: INCOME[i] })),
    { page: 2, row: other, label: `C. 2(b)(v) Annual Earned Income (RM) up to – ${who}`, when: 'Other amount' },
  ];

  const tickLabelsE1 = ['Employment related income e.g. salary, commission, bonus, EPF, pension', 'Business income e.g. profits',
    'Investment income e.g. shares, bonds, unit trust, rental income', 'Savings or deposit', 'Policy claims, maturity or surrender',
    'Others e.g. inheritance, gift, allowance, loan etc.'];

  return {
    finder: false, // everything below is spelled out; no guessing from the printed text
    itemRows: [
      { page: 1, row: 6, label: 'Old NRIC / BC / Passport No. (Life Assured)' },
      // B. Switching of funds
      { page: 2, row: 6, label: 'B. Switch 1 – From Fund Type (F)' },
      { page: 2, row: [7, 8], right: true, label: 'B. Switch 1 – Amount (boxes before "units / RM")' },
      { page: 2, row: [9, 10], right: true, label: 'B. Switch 1 – Amount (boxes after "units / RM")' },
      { page: 2, row: 11, label: 'B. Switch 1 – To Fund Type (F)' },
      { page: 2, row: 12, label: 'B. Switch 2 – From Fund Type (F)' },
      { page: 2, row: [13, 14], right: true, label: 'B. Switch 2 – Amount (boxes before "units / RM")' },
      { page: 2, row: [15, 16], right: true, label: 'B. Switch 2 – Amount (boxes after "units / RM")' },
      { page: 2, row: 17, label: 'B. Switch 2 – To Fund Type (F)' },
      // C. single premium top-up
      { page: 2, row: 20, label: 'C. 2(a) Top-up 1 – Fund Type (F)' }, { page: 2, row: [21, 22], right: true, label: 'C. 2(a) Top-up 1 – Amount (RM)' },
      { page: 2, row: 23, label: 'C. 2(a) Top-up 2 – Fund Type (F)' }, { page: 2, row: [24, 25], right: true, label: 'C. 2(a) Top-up 2 – Amount (RM)' },
      { page: 2, row: 26, label: 'C. 2(a) Top-up 3 – Fund Type (F)' }, { page: 2, row: [27, 28], right: true, label: 'C. 2(a) Top-up 3 – Amount (RM)' },
      { page: 2, row: [29, 30], right: true, label: 'C. 2(a) Total Addition (RM)' },
      { page: 2, row: [49, 50], right: true, label: 'C. 2(b)(v) Other annual income amount (RM) – Life Assured' },
      { page: 2, row: [51, 52], right: true, label: 'C. 2(b)(v) Other annual income amount (RM) – Policyowner / Assured' },
      // D. Great Saver Rider without waiver
      { page: 2, row: 54, right: true, label: 'D. Inclusion of GSR Yearly Premium – RM' }, { page: 2, row: 55, label: 'D. Inclusion of GSR Yearly Premium – sen' },
      { page: 2, row: 58, right: true, label: 'D. Cancellation of GSR Yearly Premium – RM' }, { page: 2, row: 59, label: 'D. Cancellation of GSR Yearly Premium – sen' },
    ],
    itemText: [{ page: 1, x: 246, y: 231, w: 50, size: 9, label: 'A. Total (%) – must add up to 100' }],
    itemTicks: [
      { page: 1, row: 27, label: 'A. Dividend Disbursement method (F29)', when: 'Payout' }, { page: 1, row: 28, label: 'A. Dividend Disbursement method (F29)', when: 'Reinvest' },
      { page: 2, row: 4, label: 'B. Switching applies to account', when: 'IPA & ILES' }, { page: 2, row: 5, label: 'B. Switching applies to account', when: 'TUPA' },
      { page: 2, row: 18, label: 'B. Dividend Disbursement method (Lion Dividend Fund RM-Unhedged)', when: 'Payout' },
      { page: 2, row: 19, label: 'B. Dividend Disbursement method (Lion Dividend Fund RM-Unhedged)', when: 'Reinvest' },
      ...income('Life Assured', [31, 32, 33, 34], [39, 40, 41, 42], 47),
      ...income('Policyowner / Assured', [35, 36, 37, 38], [43, 44, 45, 46], 48),
      { page: 2, row: 53, label: 'D. Inclusion of Great Saver Rider (GSR) Yearly Premium', when: 'Yes' },
      { page: 2, x: 39, y: 110, w: 8.5, h: 8.5, label: 'D. Inclusion of GSR – purpose', when: 'Medical Repricing' },
      { page: 2, row: 56, label: 'D. Inclusion of GSR – purpose', when: 'Policy Sustainability' },
      { page: 2, row: 57, label: 'D. Cancellation of Great Saver Rider (GSR) Yearly Premium', when: 'Yes' },
      { page: 2, row: 60, label: 'D. Cancellation of GSR – purpose', when: 'Medical Repricing' },
      { page: 2, row: 61, label: 'D. Cancellation of GSR – purpose', when: 'Policy Sustainability' },
      ...tickLabelsE1.map((t, i) => ({ page: 3, row: 4 + i, label: `E.1 Source of funds for the premium – ${t}`, when: 'Yes' })),
      ...tickLabelsE1.map((t, i) => ({ page: 3, row: 10 + i, label: `E.2 How your wealth was accumulated – ${t}`, when: 'Yes' })),
    ],
    grids: [grid([243.7, 298.3], LEFT), grid([483.5, 532.9], RIGHT), occupation],
    ticks: [...fundTicks(LEFT, 66, 9), ...fundTicks(RIGHT, 305, 8.5)],
  };
}

export default {
  // ---------------- NEW BUSINESS ----------------
  'AMENDMENET - NBZ-FRQAM': {
    // The address boxes are not filled from the customer's details on this form: they stay blank as typed-in items.
    drop: [{ page: 1, key: 'signDate' }, ...['address1', 'address2', 'address3', 'postcode', 'town', 'state', 'country', 'cityLine'].map(key => ({ page: 1, key }))], // signDate box is "Change Commencement Date"
    lines: [{ page: 1, line: 12, key: 'ownerName', ifDiff: 'laName' }],
    rows: [{ page: 1, row: 29, key: 'signDate' }],
  },
  'CLINICAL ABSTRACT': {
    // Parent / guardian block (patient under 18): the policyowner, only when not the patient.
    drop: [{ page: 1, key: 'ownerName' }, { page: 1, key: 'relationship' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [
      { page: 1, line: 13, key: 'address2' },
      { page: 1, line: 14, key: 'cityLine' },
      { page: 1, line: 9, key: 'signDate' },
      // Witness block (the agent): address lines 1 and 2
      { page: 1, line: 30, key: 'agentAddress' },
      { page: 1, line: 31, key: 'agentAddress2' },
      { page: 1, line: 32, key: 'agentCityLine' },
      // Patient's parent / guardian: filled with the proposer when the policy is a third-party one (proposer is not the patient)
      { page: 1, line: 22, key: 'ownerName', x: 400, ifDiff: 'laName' },
      { page: 1, line: 23, key: 'ownerNric', x: 400, ifDiff: 'laNric' },
      { page: 1, line: 24, key: 'parentRel', x: 400 },
    ],
    dropItems: [/^Dear Sir/, /^Address \(line [23]\)$/, /^Relationship$/, /^Name$/, /^Yours Faithfully/, /^(From|to)$/i, /^Patient's parent/],
    // The period of treatment
    extraItems: [
      { page: 1, line: 17, label: 'Period of treatment – From', x: 150 },
      { page: 1, line: 18, label: 'Period of treatment – To', x: 327 },
    ],
  },
  'MEDICAL REPORT REQUEST': {
    // Part 2 (who collects the report) is a choice the customer makes; Part 3 is the agent as witness.
    drop: [{ page: 1, key: 'agentName' }, { page: 1, key: 'agentNric' }, { page: 1, key: 'agentMobile' }],
    text: [
      { page: 1, key: 'laName', x: 47, y: 635, w: 315 },
      { page: 1, key: 'laNric', x: 445, y: 635, w: 110 },
    ],
    lines: [
      { page: 1, line: 34, key: 'agentName', x: 365 },
      { page: 1, line: 35, key: 'agentCode', x: 365 },
    ],
    rows: [{ page: 1, row: 12, key: 'signDate' }],
    // Part 2 (soft copy via ICM): "Agent's Name" and "Agent's Contact No." are always the agent's own details.
    mapItems: [
      { page: 1, label: /^Agent's Name \(column 2/, key: 'agentName' },
      { page: 1, label: /^I hereby authorise my agent/, key: 'agentMobile' },
    ],
    dropItems: [
      /^I hereby authorise the below person/, /^Agent ID$/, /^Agent's Name \(column 1/,
      { page: 1, label: /^Agent ID: \(if by agent\)/, maxY: 400 }, // really the authorised person's Contact No. (added below)
    ],
    extraItems: [{ page: 1, line: 20, label: 'Authorised person – Contact No.' }],
  },
  // ---------------- CUSTOMER SERVICE ----------------
  // Header on these forms (Policy No. / New NRIC / Old NRIC / Name of Life Assured) identifies the Life Assured.
  'CONTRACTUAL CHANGES': {
    finder: false,
    itemTicks: [
      ...['Annually', 'Half Yearly', 'Quarterly', 'Monthly'].map((t, i) => ({ page: 1, row: 7 + i, label: 'Mode of Payment', when: t })),
      ...['Cheque', 'GIRO', 'Credit Card', "Banker's Order"].map((t, i) => ({ page: 1, row: 11 + i, label: 'Method of Payment', when: t })),
      { page: 1, row: 15, label: 'Partial Conversion – Balance of the Sum Assured forfeited', when: 'Yes' },
      { page: 1, row: 16, label: 'Partial Conversion – Balance of the Sum Assured remains (balance forfeited if below the minimum)', when: 'Yes' },
      { page: 2, row: 4, label: 'Reduction of Sum Assured – Rider(s)', when: 'Yes' }, { page: 2, row: 5, label: 'Reduction of Sum Assured – Supplementary Benefit(s)', when: 'Yes' },
      { page: 2, row: 6, label: 'Reduction of Sum Assured – Reduce Basic Sum Assured', when: 'Yes' },
      { page: 2, row: 7, label: 'Reduction of Regular Premium – Basic Investment Premium (BIP)', when: 'Yes' },
      { page: 2, row: 8, label: 'Reduction of Regular Premium – Great Saver Rider (GSR) with waiver', when: 'Yes' },
      { page: 2, row: 9, label: 'Reduction of Regular Premium – Great Saver Rider (GSR) without waiver', when: 'Yes' },
      { page: 2, row: 10, label: 'Cancellation – Rider(s)', when: 'Yes' }, { page: 2, row: 11, label: 'Cancellation – Supplementary Benefit(s)', when: 'Yes' },
      { page: 2, row: 12, label: 'Conversion of Paid-Up Assurance / Extended Term Assurance', when: 'Paid-Up Assurance' },
      { page: 2, row: 13, label: 'Conversion of Paid-Up Assurance / Extended Term Assurance', when: 'Extended Term Assurance' },
      { page: 2, row: 14, label: 'Vesting Clause', when: 'Inclusion of Vesting Clause' }, { page: 2, row: 15, label: 'Vesting Clause', when: 'Cancellation of Vesting Clause' },
      { page: 2, row: 16, label: 'Change of Policy Commencement Date', when: 'Backdate to' }, { page: 2, row: 18, label: 'Change of Policy Commencement Date', when: 'Redate to' },
    ],
    itemText: [{ page: 2, x: 350, y: 500, w: 66, label: 'Reduction of Regular Premium – GSR without waiver – amount (RM) per year' }],
    itemRows: [
      { page: 1, row: 6, label: 'Old NRIC / Birth Certificate / Passport No. (Life Assured)' },
      { page: 2, row: 17, label: 'Change of Policy Commencement Date – Backdate to (date)' }, { page: 2, row: 19, label: 'Change of Policy Commencement Date – Redate to (date)' },
      { page: 2, row: 20, label: 'B. Car Registration No.' },
    ],
    extraItems: [
      { page: 1, line: 33, label: 'Term of Assurance – From' }, { page: 1, line: 34, label: 'Term of Assurance – To' },
      { page: 1, line: 36, label: 'Conversion of Rider / Term Policy – Policy No. / Rider – From' }, { page: 1, line: 37, label: 'Conversion of Rider / Term Policy – Policy No. – To' },
      { page: 1, line: 38, label: 'Conversion of Rider / Term Policy – Sum Assured – From' }, { page: 1, line: 39, label: 'Conversion of Rider / Term Policy – Sum Assured – To' },
      { page: 2, line: 7, label: 'Reduction of Sum Assured – Rider(s) – From' }, { page: 2, line: 8, label: 'Reduction of Sum Assured – Rider(s) – To' },
      { page: 2, line: 10, label: 'Reduction of Sum Assured – Supplementary Benefit(s) – From' }, { page: 2, line: 11, label: 'Reduction of Sum Assured – Supplementary Benefit(s) – To' },
      { page: 2, line: 12, label: 'Reduction of Sum Assured – Basic Sum Assured – From' }, { page: 2, line: 13, label: 'Reduction of Sum Assured – Basic Sum Assured – To' },
      { page: 2, line: 15, label: 'Reduction of Regular Premium – BIP – amount (RM) per year' },
      { page: 2, line: 16, label: 'Reduction of Regular Premium – GSR with waiver – amount (RM) per year' },
      { page: 2, line: 18, label: 'Cancellation – Rider(s) – details' }, { page: 2, line: 19, label: 'Cancellation – Supplementary Benefit(s) – details' },
      { page: 2, line: 47, label: 'C. Others (line 1)' }, { page: 2, line: 48, label: 'C. Others (line 2)' },
      { page: 3, line: 17, label: 'Life Assured – Tel No.' },
    ],
    drop: [{ page: 1, key: 'ownerOldIc' }, { page: 3, key: 'ownerName' }, { page: 3, key: 'ownerNric' }, { page: 3, key: 'mobile' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [
      { page: 3, line: 10, key: 'ownerName' }, { page: 3, line: 13, key: 'ownerNric' }, { page: 3, line: 16, key: 'mobile' },
      { page: 3, line: 11, key: 'laName', ifDiff: 'ownerName' }, { page: 3, line: 14, key: 'laNric', ifDiff: 'ownerNric' },
      // E. Consent: trustee / nominee signers and the agent as witness
      ...signer(3, 1, [37, 39, 43]), ...signer(3, 2, [35, 40, 41]), ...witness(3, [36, 38, 42]),
    ],
  },
  'DIRECT CREDIT - CSD-FDCFF': {
    finder: false,
    drop: [{ page: 3, key: 'address1' }],
    rows: [
      { page: 1, row: 7, key: 'policyNo' }, { page: 2, row: 4, key: 'policyNo' }, { page: 3, row: 4, key: 'policyNo' },
      { page: 1, row: 5, key: 'ownerName', cont: true },
      // policy numbers 2-4 repeat on pages 2 and 3 from the first page
      ...[2, 3].flatMap(page => [{ page, row: page === 2 ? 6 : 6, key: 'q_policy_no_2' }, { page, row: 5, key: 'q_policy_no_3' }, { page, row: 7, key: 'q_policy_no_4' }]),
    ],
    lines: [{ page: 3, line: 18, key: 'agentAddress' }, { page: 3, line: 19, key: 'agentAddress23' }],
    itemRows: [
      { page: 1, row: 9, label: 'Policy No. 2' }, { page: 1, row: 8, label: 'Policy No. 3' }, { page: 1, row: 10, label: 'Policy No. 4' },
      { page: 3, row: 9, label: 'For Office Use – Bank Code' }, { page: 3, row: 10, label: 'For Office Use – Branch Code' },
    ],
    extraItems: [{ page: 3, line: 24, label: 'For Office Use – Reject Reason' }],
    itemTicks: [{ page: 1, x: 180, y: 242, w: 8.5, h: 8.5, label: 'Account Type', when: 'Single Account' }, { page: 1, x: 294, y: 242, w: 8.5, h: 8.5, label: 'Account Type', when: 'Joint Account' }],
  },
  'DISCHARGE VOUCHER (ILP)': {
    finder: false,
    ...(() => {
      const rows = [[647.0, 625.2], [625.2, 604.3], [604.3, 581.6], [581.6, 558.6], [558.6, 535.4], [535.4, 513.3], [513.3, 491.6], [491.6, 469.0], [469.0, 429.6], [429.6, 384.9]];
      const t = fundTable(2, 'A. ', FUNDS_L, FUNDS_R, rows, { l: [179.9, 242.3, 298.0], r: [449.6, 508.4, 571.2], tl: 27.5, tr: 302.5 }, [635, 614, 592, 568, 545, 522, 500, 478, 456, 416]);
      // B. Regular partial withdrawal: one percentage per fund
      const prow = [[573.7, 553.3], [553.3, 533.7], [533.7, 513.3], [513.3, 492.7], [492.7, 472.4], [472.4, 448.8], [448.8, 427.9], [427.9, 405.0], [405.0, 364.9], [364.9, 324.3]];
      const pg = (list, cols) => ({ page: 3, cols, heads: ['Percentage (%)'], size: 9, rows: list.map((n, i) => ({ top: prow[i][0], bottom: prow[i][1], label: `B. ${n}` })) });
      const ptick = (list, x) => list.map((n, i) => ({ page: 3, x, y: [562, 542, 522, 501, 481, 459, 437, 414, 391, 353][i] - 0.5, size: 8.5, key: itemKey(`B. ${n} – Percentage (%)`), when: '*' }));
      return { grids: [...t.grids, pg(FUNDS_L, [175.4, 293.8]), pg(FUNDS_R, [445.7, 575.2])], ticks: [...t.ticks, ...ptick(FUNDS_L, 23.5), ...ptick(FUNDS_R, 297.5)] };
    })(),
    itemTicks: [
      { page: 2, row: 4, label: 'A. Partial Withdrawal – I would like to effect a partial withdrawal', when: 'Yes' },
      { page: 2, row: 5, label: 'A. Partial Withdrawal applies to account', when: 'Insurance Premium Account (IPA)' },
      { page: 2, row: 6, label: 'A. Partial Withdrawal applies to account', when: 'Top-Up Premium Account (TUPA)' },
      { page: 2, row: 7, label: 'A. Partial Withdrawal applies to account', when: 'IL EduSaver (ILES)' },
      { page: 2, row: 27, label: 'B. Regular Partial Withdrawal – I would like to effect a regular partial withdrawal', when: 'Yes' },
      ...['Yearly', 'Half Yearly', 'Quarterly', 'Monthly'].map((t, i) => ({ page: 3, row: 4 + i, label: 'B. Regular Partial Withdrawal – Withdrawal mode', when: t })),
      { page: 3, row: 12, label: 'B. Regular Partial Withdrawal amount in the form of', when: 'Withdraw proportionately to total fund value of respective fund(s)' },
      { page: 3, row: 13, label: 'B. Regular Partial Withdrawal amount in the form of', when: 'Indicate the % in the table below (Min 10%, Max 100%)' },
      { page: 3, row: 32, label: 'B. I would like to cancel the Regular Partial Withdrawal (RPW) feature for my policy', when: 'Yes' },
      { page: 4, row: 4, label: 'C. Full Surrender – I would like to surrender my policy in full', when: 'Yes' },
      ...[[11, 'Financial Difficulties'], [12, 'Heavy commitments'], [13, 'Cashing in for other investments'], [14, 'Policy / plan not meeting insurance needs'],
        [15, "Agent's service"], [16, 'Returns of Investment Funds not meeting expectations'], [17, 'Purchase policy from another Insurance Company']]
        .map(([row, t]) => ({ page: 4, row, label: `C. Reason for Full Surrender – ${t}`, when: 'Yes' })),
    ],
    extraItems: [
      { page: 2, line: 44, label: 'B. Regular Partial Withdrawal amount (RM) – minimum RM100, maximum subject to availability of TIV' },
      { page: 2, line: 46, label: 'B. Regular Partial Withdrawal tenure (years)' }, { page: 2, line: 48, label: 'B. With effect from' },
    ],
    drop: [{ page: 1, key: 'ownerOldIc' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [
      { page: 4, line: 15, key: 'ownerName' }, { page: 4, line: 17, key: 'ownerNric' }, { page: 4, line: 19, key: 'mobile' },
      { page: 4, line: 14, key: 'agentName' }, { page: 4, line: 16, key: 'agentNric' }, { page: 4, line: 18, key: 'agentMobile' },
      ...signer(5, 1, [7, 9, 11]), ...witness(5, [6, 8, 10]), ...signer(5, 2, [15, 17, 19]), ...witness(5, [14, 16, 18]),
    ],
  },
  'DISCHARGE VOUCHER (TRAD)': {
    finder: false,
    ...(() => { const t = fundTable(2, 'B. ', FUNDS_L, FUNDS_R); return { grids: t.grids, ticks: t.ticks }; })(),
    itemTicks: [
      { page: 1, row: 10, label: 'A. Reduction of Basic Premium – I would like to apply to reduce my Basic Premium', when: 'Yes' },
      { page: 2, row: 5, label: 'B. Partial Withdrawal – I would like to effect a partial withdrawal of the Total Investment Value', when: 'Yes' },
      { page: 2, row: 6, label: 'B. Partial Withdrawal applies to account', when: 'Insurance Premium Account (IPA)' },
      { page: 2, row: 7, label: 'B. Partial Withdrawal applies to account', when: 'Top-Up Premium Account (TUPA)' },
      { page: 2, row: 8, label: 'B. Partial Withdrawal applies to account', when: 'IL EduSaver (ILES)' },
      { page: 2, row: 30, label: 'C. Full Surrender – I would like to surrender my policy in full', when: 'Yes' },
      ...[[6, 'Financial Difficulties'], [7, 'Heavy commitments'], [8, 'Cashing in for other investments'], [9, 'Policy / plan not meeting insurance needs'],
        [10, "Agent's service"], [11, 'Returns of Investment Funds not meeting expectations'], [12, 'Purchase policy from another Insurance Company']]
        .map(([row, t]) => ({ page: 3, row, label: `C. Reason for Full Surrender – ${t}`, when: 'Yes' })),
    ],
    extraItems: [
      { page: 1, line: 33, label: 'A. Reduction of Basic Premium – From (RM)' }, { page: 1, line: 32, label: 'A. Reduction of Basic Premium – To (RM)' },
    ],
    drop: [{ page: 1, key: 'ownerOldIc' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [
      { page: 3, line: 19, key: 'ownerName' }, { page: 3, line: 21, key: 'ownerNric' }, { page: 3, line: 23, key: 'mobile' },
      { page: 3, line: 18, key: 'agentName' }, { page: 3, line: 20, key: 'agentNric' }, { page: 3, line: 22, key: 'agentMobile' },
      ...signer(4, 1, [5, 7, 9]), ...witness(4, [4, 6, 8]), ...signer(4, 2, [13, 15, 17]), ...witness(4, [12, 14, 16]),
    ],
  },
  'ECONNECT CHANGE SIGNATURE': {
    finder: false,
    drop: [{ page: 1, key: 'policyNo' }],
    rows: [{ page: 1, row: 6, key: 'policyNo' }],
    itemRows: [7, 8, 9, 10].map((row, i) => ({ page: 1, row, label: `Policy No. (${['ii', 'iii', 'iv', 'v'][i]})` })),
    lines: [{ page: 1, line: 17, key: 'signDate' }],
  },
  'GREAT ID - CSD-PSF38': {
    finder: false,
    // Policy owner's own login; mobile number goes into +[60]-[12]-[3456789].
    lines: [{ page: 1, line: 25, key: 'ownerNric' }],
    text: [
      { page: 1, type: 'static', text: '60', x: 290, y: 643, w: 20, size: 11 },
      { page: 1, key: 'mobilePrefix', x: 335, y: 643, w: 25, size: 11 },
      { page: 1, key: 'mobileRest', x: 385, y: 643, w: 170, size: 11 },
    ],
  },
  'LETTER OF CONSENT - CSD-PSF04': {
    finder: false,
    itemRows: [{ page: 1, row: 7, label: 'Old NRIC / BC / Passport No. (Life Assured)' }],
    itemTicks: [
      ...[[8, 'Policy Loan Value / Part Surrender Value / Total Surrender Value'], [9, 'Surrender Value of Bonus'], [10, 'Others']]
        .map(([row, t]) => ({ page: 1, row, label: `Values payable to the Policy Owner – ${t}`, when: 'Yes' })),
      ...[[11, 'Upgrading or Downgrading of Benefits (Investment-Linked / Non-Investment-Linked Plan)'], [12, 'Paid-up / Extended Term Assurance'],
        [13, 'Revocation of all existing nominees'], [14, 'Assignment of policy'], [15, 'Change of Cash Bonus / Lion Option'], [17, 'Others']]
        .map(([row, t]) => ({ page: 1, row, label: `Consent given for – ${t}`, when: 'Yes' })),
    ],
    extraItems: [{ page: 1, line: 28, label: 'Values payable to the Policy Owner – Others (please state)', x: 95 }, { page: 1, line: 39, label: 'Consent given for – Others (please state)', x: 84 }],
    // Signed by the trustees (or nominees); the agent witnesses.
    drop: [{ page: 1, key: 'ownerOldIc' }, { page: 1, key: 'agentName' }, { page: 1, key: 'agentMobile' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [
      ...signer(1, 1, [57, 59, 61], 'Dob'), { page: 1, line: 64, key: 'signDate' }, ...witness(1, [56, 58, 62]),
      ...signer(1, 2, [74, 76, 80], 'Dob'), { page: 1, line: 81, key: 'signDate' }, ...witness(1, [73, 75, 78]),
    ],
  },
  'HEALTH DECLARATION - CSD-PSF02': {
    ...(() => {
      // I. Personal details: Section A (Life Assured) and B (Assured, if different) on page 4, Section C (spouse) on page 5.
      const col = (page, who, r, key) => ({
        rows: [
          ...(key ? [{ page, row: r.name[0], key: key.name }, ...r.name.slice(1).map(row => ({ page, row, key: key.name, cont: true })), { page, row: r.nric, key: key.nric }] : []),
        ],
        itemRows: [
          ...(key ? [] : [...r.name.map((row, i) => ({ page, row, label: `I. ${who} – Full Name (line ${i + 1})` })), { page, row: r.nric, label: `I. ${who} – New NRIC No.` }]),
          { page, row: r.birth, label: `I. ${who} – Birth Certificate / Passport / ROC No.` },
          ...r.occ.map((row, i) => ({ page, row, label: `I. ${who} – Occupation (line ${i + 1})` })),
          ...r.work.map((row, i) => ({ page, row, label: `I. ${who} – Exact Nature of Work${r.work.length > 1 ? ` (line ${i + 1})` : ''}` })),
          ...r.biz.map((row, i) => ({ page, row, label: `I. ${who} – Nature of Business${r.biz.length > 1 ? ` (line ${i + 1})` : ''}` })),
          ...r.emp.map((row, i) => ({ page, row, label: `I. ${who} – Employer / Business name & address (line ${i + 1})` })),
          { page, row: r.rm, label: `I. ${who} – Annual Earned Income – Others: RM` },
          { page, row: r.height, label: `I. ${who} – Height (cm)` },
          { page, row: r.weight, label: `I. ${who} – Weight (kg) – whole number` }, { page, row: r.dec, label: `I. ${who} – Weight (kg) – decimal` },
        ],
        itemTicks: [
          { page, row: r.inc0, label: `I. ${who} – Annual Earned Income – No income`, when: 'Yes' },
          { page, row: r.inc1, label: `I. ${who} – Annual Earned Income – Others`, when: 'Yes' },
        ],
      });
      const A = col(4, 'Section A – Life Assured', { name: [5, 7, 9], nric: 11, birth: 13, occ: [15, 17, 19], work: [21, 23], biz: [25], emp: [28, 30, 32, 34, 36], rm: 42, height: 44, weight: 46, dec: 47, inc0: 38, inc1: 40 }, { name: 'laName', nric: 'laNric' });
      const B = col(4, 'Section B – Assured', { name: [6, 8, 10], nric: 12, birth: 14, occ: [16, 18, 20], work: [22, 24], biz: [26, 27], emp: [29, 31, 33, 35, 37], rm: 43, height: 45, weight: 48, dec: 49, inc0: 39, inc1: 41 });
      const C = col(5, 'Section C – Spouse of Assured', { name: [5, 6, 7], nric: 8, birth: 9, occ: [10, 11], work: [12], biz: [13], emp: [14, 15, [16, 17], 18], rm: 21, height: 22, weight: 23, dec: 24, inc0: 19, inc1: 20 });
      const E = (page, rows, head) => ['Employment related income e.g. salary, commission, bonus, EPF, pension', 'Business income e.g. profits', 'Investment income e.g. shares, bonds, unit trust, rental income',
        'Savings or deposit', 'Policy claims, maturity or surrender', 'Others e.g. inheritance, gift, allowance, loan etc.'].map((t, i) => ({ page, row: rows[i], label: `${head} – ${t}`, when: 'Yes' }));
      const all = k => [A, B, C].flatMap(x => x[k] || []);
      return {
        rows2: all('rows'),
        itemRows: [...all('itemRows'), { page: 10, row: 10, label: 'VII. 11(a) Child – gestational period (weeks)' }, { page: 10, row: 11, label: 'VII. 11(b) Child – birth weight (kg)' }],
        itemTicks: [...all('itemTicks'), ...E(5, [25, 26, 27, 28, 29, 30], 'II.1 Source of funds used to pay the premium'), ...E(6, [5, 6, 7, 8, 9, 10], 'II.2 How did you accumulate your wealth')],
        dropItems: [{ page: 1, kind: 'text' }, { page: 15 }, { page: 16 }, { page: 17 }, { page: 18 },
          /^(Gastrik|Jaundis|Batu karang|Sifilis|Sebarang penyakit|Pernahkah|Adakah anda|MASA KINI|Jika ada|Jika "YA"|Usia Kandungan|Akaun|Saya|Inggeris|NOTIS|Sindrom|Kesihatan)/,
          { page: 4 }, { page: 5 }, { page: 6, kind: 'choice', maxY: 700 }, { page: 6, minX: 400 }, { page: 7, minX: 400 }, { page: 8, minX: 400 }, { page: 9, minX: 400 }, { page: 10 }],
        extraItems: [33, 34, 35, 36, 37, 38, 39, 40].map((line, i) => ({ page: 10, line, label: `VI–VII. Details of any "Yes" answer – question no. and details (line ${i + 1})` })),
      };
    })(),
    healthRows: { pages: [6, 7, 8, 9, 10], minX: 400, cols: [428, 452, 478, 502, 526, 549], persons: ['Life Assured', 'Assured', 'Spouse of Assured'], prefix: 'V. ' },
    drop: [{ page: 13, key: 'ownerNric' }, { page: 13, key: 'agentNric' }, { page: 14, key: 'agentName' }, { page: 14, key: 'agentNric' },
           { page: 14, key: 'ownerNric' }, { page: 14, key: 'bankAccNo' }],
    rows: [{ page: 13, row: 5, key: 'signDate' }],
    lines: [
      { page: 13, line: 11, key: 'ownerName' }, { page: 13, line: 13, key: 'ownerNric' }, { page: 13, line: 15, key: 'mobile' },
      { page: 13, line: 10, key: 'laName', ifDiff: 'ownerName' }, { page: 13, line: 12, key: 'laNric', ifDiff: 'ownerNric' },
      { page: 13, line: 25, key: 'agentName' }, { page: 13, line: 26, key: 'agentNric' }, { page: 13, line: 27, key: 'agentMobile' },
      ...signer(14, 1, [18, 20, 24], 'Mobile'), ...signer(14, 2, [19, 21, 25], 'Mobile'), ...witness(14, [17, 22, 23]),
    ],
  },
  'ILP APPLICATION FOR AMENDMENT': {
    ...ilpFix(),
    drop: [{ page: 1, key: 'ownerOldIc' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [
      { page: 4, line: 5, key: 'ownerName' }, { page: 4, line: 7, key: 'ownerNric' }, { page: 4, line: 9, key: 'mobile' },
      { page: 4, line: 6, key: 'agentName' },
      ...signer(4, 1, [27, 30, 33]), ...signer(4, 2, [28, 31, 34]), ...witness(4, [26, 29, 32]),
    ],
  },
  'PERSON CHANGES - CSD-PSF01A': {
    finder: false,
    // Header = Life Assured. A. Change of address / contact comes from the customer's details; B. and C. are ticked / typed in.
    drop: [{ page: 1, key: 'ownerOldIc' }, { page: 1, key: 'officeTel' }, { page: 1, key: 'ownerDob' },
           { page: 1, key: 'ownerName' }, { page: 1, key: 'ownerNationality' }, { page: 1, key: 'postcode' }, { page: 1, key: 'town' },
           { page: 1, key: 'country' }, { page: 1, key: 'email' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    rows: [
      { page: 1, row: 7, key: 'address1' }, { page: 1, row: 8, key: 'address2' }, { page: 1, row: 9, key: 'address3' },
      { page: 1, row: 10, key: 'postcode' }, { page: 1, row: 11, key: 'town' }, { page: 1, row: 12, key: 'country' },
      { page: 1, row: 20, key: 'email' },
      { page: 1, row: 21, from: 0, n: 6, key: 'mobileCode' }, { page: 1, row: 21, from: 6, n: 8, key: 'mobileRest' },
      { page: 4, row: 4, key: 'signDate' },
    ],
    lines: [{ page: 4, line: 17, key: 'agentDob' }],
    itemRows: [
      { page: 1, row: 6, label: 'Old NRIC / Birth Certificate / Passport No. (Life Assured)' },
      { page: 1, row: 14, label: 'A. Residential Address (line 1)' }, { page: 1, row: 15, label: 'A. Residential Address (line 2)' }, { page: 1, row: 16, label: 'A. Residential Address (line 3)' },
      { page: 1, row: 17, label: 'A. Residential Address – Postcode' }, { page: 1, row: 18, label: 'A. Residential Address – Town' }, { page: 1, row: 19, label: 'A. Residential Address – Country' },
      { page: 1, row: 22, label: 'A. Office Tel No.' },
    ],
    itemTicks: [
      { page: 1, row: 13, label: 'A. Residential Address – same as Mailing Address', when: 'Yes' },
      ...['Assured', 'Life Assured', 'Nominee / Trustee / Assignee'].map((t, i) => ({ page: 1, row: 24 + i, label: 'B(i). Particulars to update belong to', when: t })),
      ...['Name', 'Date of Birth', 'NRIC / BC / Passport No. / Business Registration No.', 'Sex', 'Title', 'Country of Birth', 'Nationality']
        .map((t, i) => ({ page: 1, row: 28 + i, label: `B(i). Change of ${t}`, when: 'Yes' })),
    ],
    extraItems: [
      { page: 1, line: 51, label: 'A. House / H/P Tel No. – name of country' }, { page: 1, line: 56, label: 'A. Office Tel No. – name of country' },
      ...[24, 25, 26, 27].map((line, i) => ({ page: 2, line, label: `D. Others (line ${i + 1})` })),
      { page: 4, line: 6, label: 'H. Dated at' },
    ],
    // B(i): the new value, one box per kind of person
    grids: [{ page: 1, cols: [232.8, 325.8, 438.0, 563.8], heads: ['Assured', 'Life Assured', 'Nominee / Trustee / Assignee'], size: 8.5, rows: [
      { top: 313.9, bottom: 293.4, label: 'B(i). New Name' }, { top: 293.4, bottom: 272.7, label: 'B(i). New Date of Birth' },
      { top: 272.7, bottom: 242.1, label: 'B(i). New NRIC / Passport No. / Business Reg. No.' }, { top: 242.1, bottom: 220.3, label: 'B(i). New Sex' },
      { top: 220.3, bottom: 196.5, label: 'B(i). New Title' }, { top: 196.5, bottom: 174.2, label: 'B(i). New Country of Birth' },
      { top: 174.2, bottom: 151.3, label: 'B(i). New Nationality' }] }],
    // B(ii): TIN and SST numbers
    tables: [{ page: 2, name: 'B(ii)', cols: [61, 293, 525], heads: ['Tax Identification No. (TIN)', 'SST Registration No.'], rows: [749.5, 698.2] }],
  },
  'TAX RESIDENCY - CSD-PSF43': {
    finder: false,
    itemRows: [
      { page: 1, row: 6, label: '1(c) Passport Expiry Date' }, { page: 1, row: 10, label: '1(f) Place of birth' }, { page: 1, row: 13, label: '1(g) Country of birth' },
      { page: 1, row: 20, label: '1(j) Mailing Address (line 1)' }, { page: 1, row: 21, label: '1(j) Mailing Address (line 2)' }, { page: 1, row: 22, label: '1(j) Mailing Address (line 3)' },
      { page: 1, row: 23, label: '1(j) Mailing Address – Postcode' }, { page: 1, row: 24, label: '1(j) Mailing Address – Town' }, { page: 1, row: 25, label: '1(j) Mailing Address – Country' },
    ],
    itemTicks: [
      { page: 2, row: 5, label: 'Part 2(i) Are you currently a tax resident outside Malaysia?', when: 'No – solely a tax resident in Malaysia' },
      { page: 2, row: 6, label: 'Part 2(i) Are you currently a tax resident outside Malaysia?', when: 'Yes – tax resident in the countries listed below' },
      ...[0, 1, 2, 3, 4].flatMap(i => ['A', 'B', 'C'].map((t, j) => ({ page: 2, row: 8 + i * 3 + j, label: `Part 2 – Country ${i + 1}: reason if TIN is unavailable`, when: t }))),
      ...['Student at an educational institution in the country of residential / mailing address / telephone numbers',
        'Working in that country for less than 6 months', 'On an educational or cultural exchange visitor program there (less than 6 months)',
        'Regular travel between countries / jurisdictions for work and home', 'Others'].map((t, i) => ({ page: 2, row: 23 + i, label: 'Part 3 – Reason for different country of address / telephone', when: t })),
    ],
    extraItems: [{ page: 2, line: 34, label: 'Part 3 – Others – please state', x: 205 }],
    tables: [
      { page: 2, name: 'Part 2', cols: [45.7, 181.1, 405.4], heads: ['Country of Tax Residence', 'TIN'], rows: [678.1, 661.9, 645.8, 629.8, 613.3, 595.8] },
      { page: 2, name: 'Part 2 – Reason B explanation', cols: [45.1, 560.6], heads: ['why unable to obtain a TIN'], rows: [575.0, 558.7, 542.7, 526.2, 509.2, 492.7] },
    ],
    // Account holder = policy owner. Mailing address only if different, so left blank.
    drop: [{ page: 1, key: 'postcode' }, { page: 1, key: 'town' }, { page: 1, key: 'country' }, { page: 3, key: 'ownerNric' }],
    rows: [
      { page: 1, row: 5, key: 'ownerName' }, { page: 1, row: 7, key: 'ownerNric' }, { page: 1, row: 9, key: 'ownerDob' },
      { page: 1, row: 8, from: 0, n: 6, key: 'mobileCode' }, { page: 1, row: 8, from: 6, n: 8, key: 'mobileRest' },
      { page: 1, row: 14, key: 'address1' }, { page: 1, row: 15, key: 'address2' }, { page: 1, row: 16, key: 'address3' },
      { page: 1, row: 17, key: 'postcode' }, { page: 1, row: 18, key: 'town' }, { page: 1, row: 19, key: 'country' },
    ],
    lines: [
      { page: 1, line: 30, key: 'country' },
      { page: 3, line: 10, key: 'ownerName' }, { page: 3, line: 11, key: 'ownerNric' },
    ],
    ticks: [{ page: 1, row: 11, key: 'ownerGender', when: 'Male' }, { page: 1, row: 12, key: 'ownerGender', when: 'Female' }],
  },
  // ---------------- CLAIM ----------------
  "CLAIMANT'S STATEMENT-CLM-ACFAC": {
    // Section A is the accident victim (Life Assured). Section C: Life Assured signs; claimant block only if a different person.
    drop: [{ page: 1, key: 'ownerOldIc' }, { page: 4, key: 'mobile' }],
    rekey: [
      { page: 1, key: 'ownerNric', to: 'laNric' }, { page: 1, key: 'ownerName', to: 'laName' },
      { page: 4, key: 'ownerName', to: 'laName' }, { page: 4, key: 'ownerNric', to: 'laNric' },
    ],
    rows: [
      { page: 1, row: 12, key: 'address1' }, { page: 1, row: 13, key: 'address2' },
      { page: 1, row: 27, key: 'ownerOccupation' }, { page: 1, row: 36, key: 'ownerEmployer' },
      { page: 2, row: 4, key: 'accidentDate' },
      { page: 4, row: 9, key: 'signDate' },
      { page: 4, row: 10, key: 'ownerName', ifDiff: 'laName' }, { page: 4, row: 12, key: 'ownerNric', ifDiff: 'laNric' },
      { page: 4, row: 17, key: 'agentName' }, { page: 4, row: 19, key: 'agentNric' }, { page: 4, row: 20, key: 'signDate' },
      { page: 4, row: 21, key: 'agentMobile' },
    ],
    ticks: [{ page: 1, row: 25, key: 'ownerNationality', when: 'Malaysian' }, { page: 1, row: 18, key: 'address1', when: '*' }],
    lines: [{ page: 2, line: 8, key: 'accidentPlace' }, { page: 3, line: 32, key: 'ownerName' }],
    text: [
      { page: 2, key: 'diagnosis', x: 180, y: 622, w: 375 },
      { page: 2, key: 'hospital', x: 253, y: 244, w: 222, size: 8 },
      { page: 2, key: 'admissionDate', x: 482, y: 244, w: 72, size: 8 },
      { page: 3, key: 'agentName', x: 172, y: 315, w: 160 },
      { page: 3, key: 'agentCode', x: 140, y: 306, w: 190 },
    ],
  },
  // Doctor statements: only the patient's identity at the top; the rest is for the doctor.
  "ATTENDING PHYSICIAN'S STATEMENT - CLM-ACAPS": {
    keep: [{ page: 1, key: 'policyNo' }, { page: 1, key: 'ownerNric' }, { page: 1, key: 'laName' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
  },
  'DEATH CLAIM DOCTOR STATEMENT': {
    keep: [{ page: 1, key: 'policyNo' }, { page: 1, key: 'ownerNric' }, { page: 1, key: 'laName' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
  },
  'DOCTOR STATEMENT - HSD-HSAPS': {
    keep: [{ page: 1, key: 'policyNo' }, { page: 1, key: 'ownerNric' }, { page: 1, key: 'laName' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
  },
  'LETTER OF AUTHORISATION CONSENT (DEATH)': {
    // Page 1: the deceased (Life Assured). Page 2: the claimant (entered as Policyowner / Customer).
    drop: [{ page: 1, key: 'ownerOldIc' }, { page: 2, key: 'address1' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [{ page: 2, line: 5, key: 'streetLine', x: 322 }, { page: 2, line: 6, key: 'cityLine' }],
  },
  // ---------------- GENERALI ----------------
  'Credit Card Debit Authorisation': {
    // Card number / expiry are never filled in by the app.
    drop: [{ page: 1, key: 'laName' }, { page: 1, key: 'policyNo' }],
    text: [
      { page: 1, key: 'ownerName', x: 207, y: 543, w: 340 },
      { page: 1, key: 'agentName', x: 147, y: 598, w: 150 },
      { page: 1, key: 'agentCode', x: 300, y: 598, w: 65 },
      { page: 1, key: 'holderName', x: 55, y: 342, w: 185 },
      { page: 1, key: 'policyNo', x: 436, y: 342, w: 120 },
    ],
  },
  'Non Motor Endorsement': {
    drop: [{ page: 1, key: 'ownerName' }],
    text: [
      { page: 1, key: 'signDate', x: 76, y: 639, w: 118 },
      { page: 1, key: 'policyNo', x: 440, y: 639, w: 130 },
      { page: 1, key: 'holderName', x: 170, y: 616, w: 400 },
      { page: 1, key: 'holderId', x: 170, y: 593, w: 152 },
      { page: 1, key: 'bankName', x: 125, y: 412, w: 445 },
      { page: 1, key: 'bankAccNo', x: 125, y: 387, w: 445 },
      { page: 1, key: 'email', x: 221, y: 361, w: 350 },
    ],
    lines: [{ page: 1, line: 81, key: 'holderName' }, { page: 1, line: 83, key: 'mobile' }],
  },
  'Epaymentauth': {
    // Beneficiary = the policyholder (company if given). Bank code / SWIFT / IBAN are left for the customer.
    keep: [{ page: 1, key: 'bankAccNo' }, { page: 1, key: 'postcode' }],
    rows: [
      { page: 1, span: [2, 4], key: 'holderName' }, { page: 1, span: [5, 7], key: 'holderName', cont: true },
      { page: 1, row: [8, 9, 10, 11], key: 'ownerNric' },
      { page: 1, span: [12, 14], key: 'companyRegNo' },
      { page: 1, span: [15, 19], key: 'address1' }, { page: 1, span: [20, 24], key: 'address2' },
      { page: 1, span: [25, 27], key: 'town' }, { page: 1, span: [29, 34], key: 'state' },
      { page: 1, span: [35, 39], key: 'email' }, { page: 1, span: [40, 44], key: 'email', cont: true },
      { page: 2, span: [0, 2], key: 'email' }, { page: 2, span: [3, 5], key: 'email', cont: true },
      { page: 2, row: 6, key: 'mobile' },
    ],
    lines: [{ page: 1, line: 59, key: 'ownerName' }, { page: 1, line: 60, key: 'signDate' }],
  },
  'Multi Biz Protector': {
    // p5 proposer (person), p6 the business premises; questionnaire tables are left for the customer.
    drop: [{ page: 2 }, { page: 5 }, { page: 6 }, { page: 9 }],
    rows: [
      { page: 5, row: 0, key: 'ownerName' }, { page: 5, row: 1, key: 'ownerName', cont: true },
      { page: 5, row: 4, key: 'homeTel' }, { page: 5, row: 5, key: 'mobile' }, { page: 5, row: 6, key: 'ownerNric' },
      { page: 5, row: 7, key: 'ownerMarital' }, { page: 5, row: 8, key: 'ownerDob' }, { page: 5, row: 9, key: 'ownerNationality' },
      { page: 5, row: 10, key: 'email' },
      { page: 5, row: 11, key: 'address1' }, { page: 5, row: 12, key: 'address2' }, { page: 5, row: 13, key: 'town' },
      { page: 5, row: 14, key: 'state' }, { page: 5, row: 18, key: 'postcode' },
      { page: 6, row: 0, key: 'companyName' }, { page: 6, row: 1, key: 'companyName', cont: true },
      { page: 6, row: 3, key: 'companyRegNo' }, { page: 6, row: 4, key: 'officeTel' },
      { page: 6, row: 5, key: 'companyAddress' }, { page: 6, row: 6, key: 'companyAddress', cont: true },
      { page: 6, row: 7, key: 'companyAddress', cont: true },
    ],
    text: [
      { page: 9, key: 'signDate', x: 291, y: 230, w: 60 },
      { page: 9, key: 'signDate', x: 299, y: 123, w: 60 },
      { page: 9, key: 'agentName', x: 44, y: 86, w: 220 },
      { page: 9, key: 'agentCode', x: 321, y: 86, w: 80 },
    ],
  },
  // ---------------- GROUP ----------------
  'GE DIRECT CREDIT FORM': {
    drop: [{ page: 1, key: 'postcode' }, { page: 1, key: 'town' }, { page: 1, key: 'mobile' }],
    rows: [
      { page: 1, row: 5, key: 'ownerName', cont: true },
      { page: 1, row: 13, key: 'address2' }, { page: 1, row: 14, key: 'state' },
      { page: 1, row: 15, key: 'postcode' }, { page: 1, row: 16, key: 'town' },
      { page: 1, row: 20, from: 2, n: 2, key: 'mobileCC' }, { page: 1, row: 20, from: 5, key: 'mobileNoZero' },
    ],
  },
  'GE HB Claim Form': {
    // Same layout as the accident claimant's statement: Section A / C signer = Life Assured; claimant block only if different.
    drop: [{ page: 1, key: 'ownerOldIc' }, { page: 3, key: 'mobile' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }, { page: 3, key: 'ownerName', to: 'laName' }, { page: 3, key: 'ownerNric', to: 'laNric' }],
    rows: [
      { page: 1, row: 11, key: 'address1' }, { page: 1, row: 12, key: 'address2' },
      { page: 3, row: 9, key: 'signDate' },
      { page: 3, row: 10, key: 'ownerName', ifDiff: 'laName' }, { page: 3, row: 12, key: 'ownerNric', ifDiff: 'laNric' },
    ],
    ticks: [{ page: 1, row: 24, key: 'ownerNationality', when: 'Malaysian' }, { page: 1, row: 17, key: 'address1', when: '*' }],
    text: [
      { page: 1, key: 'admissionDate', x: 47, y: 267, w: 70, size: 8 },
      { page: 1, key: 'dischargeDate', x: 123, y: 267, w: 72, size: 8 },
      { page: 1, key: 'hospital', x: 201, y: 267, w: 138, size: 8 },
      { page: 1, key: 'diagnosis', x: 344, y: 267, w: 184, size: 8 },
      { page: 2, key: 'agentName', x: 172, y: 313, w: 160 },
      { page: 2, key: 'agentCode', x: 141, y: 305, w: 195 },
    ],
    lines: [{ page: 2, line: 32, key: 'ownerName' }],
  },
  'GMBIS-NOMINEE': {
    // Proposer details + contract no.; nominee / trustee pages stay blank; agent witnesses.
    manualOnly: true,
    rows: [
      ...[1, 2, 3, 4].map(page => ({ page, row: 5, key: 'policyNo' })),
      { page: 1, row: 6, key: 'ownerName' }, { page: 1, row: 7, key: 'ownerNric' },
      { page: 4, row: 6, key: 'signDate' }, { page: 4, row: 8, key: 'signDate' },
    ],
    ticks: [
      { page: 1, row: 8, key: 'ownerMarital', when: 'Single' }, { page: 1, row: 9, key: 'ownerMarital', when: 'Married' },
      { page: 1, row: 10, key: 'ownerMarital', when: 'Divorced' }, { page: 1, row: 11, key: 'ownerMarital', when: 'Widowed' },
    ],
    lines: [{ page: 4, line: 22, key: 'agentName' }, { page: 4, line: 23, key: 'agentNric' },
      { page: 4, line: 10, key: 'signer1Name' }, { page: 4, line: 12, key: 'signer1Nric' },
      { page: 4, line: 11, key: 'signer2Name' }, { page: 4, line: 13, key: 'signer2Nric' }],
    // Nominee 1 and 2 on page 2 (nominees 3 and 4 on page 3 are left blank).
    ...(() => {
      const block = (n, r, othersLine) => ({
        rows: [
          { page: 2, row: r.name, key: `nominee${n}Name` }, { page: 2, row: r.nric, key: `nominee${n}Nric` },
          { page: 2, row: r.dob, key: `nominee${n}Dob` }, { page: 2, row: r.share, key: `nominee${n}Share`, right: true },
          { page: 2, row: r.addr[0], key: `nominee${n}Address` }, ...r.addr.slice(1).map(row => ({ page: 2, row, key: `nominee${n}Address`, cont: true })),
          { page: 2, row: r.postcode, key: `nominee${n}Postcode` }, { page: 2, row: r.town, key: `nominee${n}Town` },
        ],
        ticks: [
          { page: 2, row: r.male, key: `nominee${n}Gender`, when: 'Male' }, { page: 2, row: r.male + 1, key: `nominee${n}Gender`, when: 'Female' },
          ...[...RELATIONS, '!' + RELATIONS.join('|')].map((when, i) => ({ page: 2, row: r.rel + i, key: `nominee${n}Relationship`, when })),
        ],
        lines: [{ page: 2, line: othersLine, key: `nominee${n}Relationship`, skipIf: RELATIONS.join('|').toLowerCase() }],
      });
      const a = block(1, { name: 17, nric: 18, dob: [22, 23], share: 24, male: 31, rel: 35, addr: [44, 45, 46], postcode: 47, town: 48 }, 24);
      const b = block(2, { name: 61, nric: 62, dob: [66, 67], share: 68, male: 75, rel: 79, addr: [88, 89, 90], postcode: 91, town: 92 }, 57);
      return { rows2: [...a.rows, ...b.rows], ticks2: [...a.ticks, ...b.ticks], lines2: [...a.lines, ...b.lines] };
    })(),
  },
  'TOKIO MARINE - E-Payment': {
    // Individual payee by default; business registration lines fill only when a company is entered.
    manualOnly: true,
    rows: [{ page: 1, row: 0, key: 'bankAccNo' }, { page: 1, row: 5, key: 'ownerNric' }],
    lines: [
      { page: 1, line: 2, key: 'bankAccHolder' }, { page: 1, line: 3, key: 'fullAddress' },
      { page: 1, line: 5, key: 'ownerNric' }, { page: 1, line: 9, key: 'companyRegNo' },
      { page: 1, line: 14, key: 'contactPerson' },
      { page: 1, line: 15, key: 'homeTel' }, { page: 1, line: 16, key: 'mobile' },
      { page: 1, line: 17, key: 'email' }, { page: 1, line: 18, key: 'email' },
      { page: 1, line: 19, key: 'bankName', x2: 210 },
    ],
    text: [
      { page: 1, key: 'bankAccHolder', x: 66, y: 235, w: 190 },
      { page: 1, key: 'signDate', x: 62, y: 211, w: 190 },
    ],
  },
  'TOKIO MARINE - Health Care Claim': {
    // Part 1 = the insured (Policyowner / Customer); Part 2 = the patient when someone else (Life Assured), else blank.
    drop: [{ page: 1, key: 'laName' }, { page: 1, key: 'ownerDob' }, { page: 1, key: 'companyName' }, { page: 3, key: 'ownerNric' }],
    lines: [
      { page: 1, line: 3, key: 'ownerName' },
      { page: 1, line: 6, key: 'companyName' },
      { page: 1, line: 7, key: 'laName', ifDiff: 'ownerName' },
      { page: 1, line: 8, key: 'laNric', ifDiff: 'ownerNric' },
      { page: 1, line: 9, key: 'relationship' },
      { page: 3, line: 5, key: 'laName', ifDiff: 'ownerName' },
      { page: 3, line: 6, key: 'laNric', ifDiff: 'ownerNric' },
    ],
  },
  'TOKIO MARINE - DOCTOR': {
    // No readable text layer, so nothing is auto-detected; the patient (Life Assured) lines are placed here. The doctor completes the rest.
    manualOnly: true,
    lines: [{ page: 1, line: 3, key: 'laName' }, { page: 1, line: 4, key: 'laAge' }, { page: 1, line: 5, key: 'laNric' }],
    ticks: [{ page: 1, row: 0, key: 'laGender', when: 'Male' }, { page: 1, row: 1, key: 'laGender', when: 'Female' }],
  },
  // Medical questionnaires are answered by the Life to be Assured.
  'GASTRIC & STOMACH': {
    drop: [{ page: 1, key: 'ownerOldIc' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    // Witness (the agent) address, page 3
    lines: [{ page: 3, line: 15, key: 'agentAddress' }, { page: 3, line: 16, key: 'agentAddress2' }, { page: 3, line: 17, key: 'agentCityLine' }],
    // The questionnaire's answers: write-in lines under the questions, the two tables, and the Yes/No boxes.
    dropItems: [{ page: 3, label: /^Address/ }, /^If you are in any doubt/,{ kind: 'choice', label: /^(Yes|No)$/ }, { kind: 'text', label: /^(Vomiting of blood|Passing out blood)/ },
      { kind: 'choice', label: /^(Histopathology|Have you ever been hospitalised)/ }],
    extraChoices: [
      { page: 1, label: '5(b). Passing out blood in stool', boxes: [{ x: 184, y: 252, when: 'Yes' }, { x: 223, y: 252, when: 'No' }] },
      { page: 2, label: '7. Have you ever had any tests or investigations done?', boxes: [{ row: 6, when: 'Yes' }, { row: 7, when: 'No' }] },
      { page: 2, label: '8. Have you ever been hospitalised or admitted to hospital for this condition?', boxes: [{ row: 10, when: 'Yes' }, { row: 11, when: 'No' }] },
    ],
    extraItems: [
      ...[33, 34, 35].map((line, i) => ({ page: 1, line, label: `1. Nature of the condition (line ${i + 1})` })),
      ...[[10, 11, 12, '7. Details of the tests done and the results'], [22, 23, 24, '9. Further treatment or investigation – details'],
        [27, 28, 29, '10. Current treatment or medication – details'], [32, 33, 34, '11. Operation – nature of surgery'],
        [37, 38, 39, '12. Other underlying disease – diagnosis, treatment etc.']]
        .flatMap(([a, b, c, t]) => [a, b, c].map((line, i) => ({ page: 2, line, label: `${t} (line ${i + 1})` }))),
    ],
    tables: [
      { page: 1, name: '6. Doctors / specialists seen', cols: [45, 253, 338, 549], heads: ['Doctor, hospital or clinic', 'Date of consultation', 'Treatment prescribed'], rows: [165.7, 138.4, 111.2, 83.7] },
      { page: 2, name: '8. Hospital admissions', cols: [41, 218, 292, 365, 546], heads: ['Doctor, hospital or clinic', 'Date of admission', 'Duration of admission', 'Treatment prescribed'], rows: [579.3, 550.3, 521.1, 491.6] },
    ],
    renameItems: {
      'Did you seek any medical advice for this condition?': '6. Did you seek any medical advice for this condition?',
      'Has any further treatment or investigation been discussed or contemplated?': '9. Has any further treatment or investigation been discussed or contemplated?',
      'Are you currently receiving any kind of treatment or medication?': '10. Are you currently receiving any kind of treatment or medication?',
      'Did you undergo any operation or were you being advised to do so?': '11. Did you undergo any operation or were you being advised to do so?',
      'Is there any other underlying disease and/or new medical conditions been told Dr.?': '12. Is there any other underlying disease and/or new medical conditions been told Dr.?',
      'When did you first experience symptoms?': '2. When did you first experience symptoms?',
      'When was the last attack?': '3. When was the last attack?',
      'How many attacks (pain) have you had in a year?': '4. How many attacks (pain) have you had in a year?',
      'Vomiting of blood': '5(a). Vomiting of blood',
    },
  },
  'HYPERTENSION': {
    extraItems: [{ page: 1, line: 41, label: 'Others (complications – please state)' }],
    // Witness address on page 2 is the agent's.
    mapItems: [{ page: 2, label: /^Address$/, key: 'agentAddress' }, { page: 2, label: /^Address \(line 2\)$/, key: 'agentAddress2' }, { page: 2, label: /^Address \(line 3\)$/, key: 'agentCityLine' }],
    dropItems: [/^If you are in any doubt/, /^Age( \(line 2\))?$/, { page: 1, kind: 'text', label: /^My blood pressure.*at or$/ }],
    drop: [{ page: 1, key: 'ownerOldIc' }],
    rekey: [{ page: 1, key: 'ownerNric', to: 'laNric' }],
    lines: [{ page: 1, line: 26, key: 'laAge', x: 72, size: 9 }],
    ticks: [
      { page: 1, row: 9, key: 'laGender', when: 'Male' },
      { page: 1, row: 10, key: 'laGender', when: 'Female' },
    ],
  },
  'NFTF FORM': {
    drop: [{ page: 2, key: 'ownerName' }, { page: 2, key: 'agentCode' }],
    // Section 6 signature blocks: Spouse of Proposer and Agency Leader (year-1 agents only) have no detail of their own here.
    extraItems: [
      { page: 2, line: 23, label: 'Spouse of Proposer – Name' },
      { page: 2, line: 25, label: 'Spouse of Proposer – New NRIC / Passport No.' },
      { page: 2, line: 27, label: 'Agency Leader – Name' },
      { page: 2, line: 28, label: 'Agency Leader – IAC No.' },
      { page: 2, line: 29, label: 'Agency Leader – Rank' },
    ],
    // the small "X" boxes beside signature lines, heading underlines and date-box pieces are not answers
    dropItems: [/^I hereby declare that I have deleted/, /^Based on the information provided/, /^(Name|New NRIC|Rank|Option 3)$/,
      { page: 2, kind: 'choice', maxY: 390 }, { page: 2, maxY: 70 }],
    lines2: [{ page: 2, line: 24, key: 'agentCode', x: 385 }],
    lines: [
      { page: 2, line: 16, key: 'laName', x: 372 },
      { page: 2, line: 18, key: 'laNric', x: 470 },
      { page: 2, line: 17, key: 'ownerName', x: 85, ifDiff: 'laName' },
      { page: 2, line: 19, key: 'ownerNric', x: 175, ifDiff: 'laNric' },
    ],
    rows: [{ page: 2, row: 15, key: 'signDate' }],
  },
  'NOMINATION FORM - NBZ-FNOMI': {
    // Proposer (p1 top), Nominee 1 (p1 bottom), Nominee 2 (p2 first block), Trustee 1 and 2 (p4).
    // The 2nd/3rd nominee blocks on p2 and the non-agent witness block on p3 stay blank.
    ...nominationPeople(),
    leftovers: false,
    // Page 5 witness block: the witness is always the agent, so the address is always filled in
    mapItems: [
      { page: 5, label: /^Witness to consent – Mailing Address \(line 1\)/, key: 'agentAddress' },
      { page: 5, label: /^Witness to consent – Mailing Address \(line 2\)/, key: 'agentAddress2' },
      { page: 5, label: /^Witness to consent – Postcode/, key: 'agentPostcode' },
      { page: 5, label: /^Witness to consent – Town/, key: 'agentTown' },
      { page: 5, label: /^Witness to consent – Country/, key: 'agentCountry' },
    ],
    // everything on the people / witness / table blocks is built explicitly above, so the generic finder's guesses there are dropped
    dropItems: [
      { page: 1, kind: 'text' }, { page: 1, label: /^(Nominee|Trustee|Blank)/ },
      { page: 2 }, { page: 3, kind: 'text' }, { page: 4 }, { page: 5 }, { page: 6 },
    ],
    drop: [
      { page: 1, key: 'postcode' }, { page: 1, key: 'town' }, { page: 1, key: 'country' },
      { page: 2 }, { page: 5 },
      { page: 3, key: 'postcode' }, { page: 3, key: 'town' }, { page: 3, key: 'country' },
      { page: 4, key: 'postcode' }, { page: 4, key: 'town' }, { page: 4, key: 'country' },
    ],
    rows: [
      { page: 1, row: 5, key: 'proposalNo' }, { page: 1, row: 6, key: 'policyNo' },
      { page: 1, row: 7, key: 'ownerName' }, { page: 1, row: 10, key: 'ownerNric' },
      ...[2, 3, 4, 5].flatMap(page => [{ page, row: 4, key: 'proposalNo' }, { page, row: 5, key: 'policyNo' }]),
    ],
    ticks: [
      { page: 1, row: 11, key: 'ownerMarital', when: 'Married' },
      { page: 1, row: 12, key: 'ownerMarital', when: 'Single' },
      { page: 1, row: 13, key: 'ownerMarital', when: 'Divorced' },
      { page: 1, row: 14, key: 'ownerMarital', when: 'Widowed' },
    ],
    text: [
      { page: 3, key: 'agentCode', x: 298, y: 483, w: 75 },
      { page: 4, key: 'agentName', x: 462, y: 77, w: 90 },
      { page: 4, key: 'agentCode', x: 500, y: 59, w: 50 },
    ],
  },
};
