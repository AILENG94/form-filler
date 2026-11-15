// Customer data fields, and the form labels each one fills.
// Label patterns are matched against a normalised label: lower case, no dots/colons/asterisks, single spaces.

export const GROUPS = [
  { id: 'owner', title: 'Policyowner / Customer' },
  { id: 'la', title: 'Life Assured / Insured Person (leave blank if same as Policyowner)' },
  { id: 'contact', title: 'Contact & Address' },
  { id: 'policy', title: 'Policy' },
  { id: 'bank', title: 'Bank Account' },
  { id: 'company', title: 'Company / Group (Generali & Group Insurance)' },
  { id: 'claim', title: 'Claim' },
  { id: 'nominee1', title: 'Nominee 1' },
  { id: 'nominee2', title: 'Nominee 2' },
  { id: 'trustee1', title: 'Trustee 1 (if appointed)' },
  { id: 'trustee2', title: 'Trustee 2 (if appointed)' },
  { id: 'agent', title: 'Agent / Witness (enter once - this device remembers it)' },
  { id: 'other', title: 'Other' },
];

function personFields(prefix, title, numbers, nominee) {
  return numbers.flatMap(n => {
    const k = p => `${prefix}${n}${p}`, group = `${prefix}${n}`, who = `${title} ${n}`;
    return [
      { key: k('Name'), label: `${who} Name`, group },
      { key: k('Nric'), label: `${who} NRIC No.`, group },
      { key: k('Dob'), label: `${who} Date of Birth`, group, date: true, placeholder: 'DD/MM/YYYY' },
      { key: k('Gender'), label: `${who} Gender`, group, options: ['', 'Male', 'Female'] },
      { key: k('Relationship'), label: `${who} Relationship to Policyowner`, group },
      ...(nominee ? [{ key: k('Share'), label: `${who} Share (%)`, group }] : []),
      { key: k('Mobile'), label: `${who} Mobile No.`, group, mobile: true },
      { key: k('Nationality'), label: `${who} Nationality`, group, placeholder: 'Malaysian' },
      { key: k('PassportExpiry'), label: `${who} Passport Expiry Date`, group, date: true, placeholder: 'DD/MM/YYYY' },
      { key: k('Address'), label: `${who} Address (line 1)`, group },
      { key: k('Address2'), label: `${who} Address (line 2)`, group },
      { key: k('Address3'), label: `${who} Address (line 3)`, group },
      { key: k('Postcode'), label: `${who} Postcode`, group },
      { key: k('Town'), label: `${who} Town / City`, group },
      { key: k('Country'), label: `${who} Country`, group, placeholder: 'Malaysia' },
    ];
  });
}

export const FIELDS = [
  // Policyowner
  { key: 'ownerName', label: 'Full Name (as per NRIC)', group: 'owner',
    match: ['name of policy ?owner', 'policy ?owner(\'?s)? name', 'name of proposer', 'proposer(\'?s)? name', 'name of applicant', 'applicant(\'?s)? name',
            'name of claimant', 'claimant(\'?s)? name', 'full name', 'name \\(as per (nric|ic|mykad|nric/passport)\\)', 'name of owner',
            'policy ?owner', 'name of policy ?holder', 'customer name', 'name of customer', 'name of contract owner( / payee)?', 'name of payee',
            'name of policy ?owner( / payee)?', 'payee(\'?s)? name', 'name of account holder / payee'],
    generic: ['name'] },
  { key: 'ownerNric', label: 'New NRIC No.', group: 'owner',
    match: ['new nric no', 'new nric', 'nric no of policy ?owner', 'policy ?owner(\'?s)? nric no', 'nric/passport no', 'nric / passport no',
            'nric no/passport no', 'nric no / passport no', 'mykad no', 'identity card no', 'new ic no', 'ic/passport no', 'ic no/passport no',
            'nric no \\(new\\)', 'nric/passport/birth cert no', 'nric no / company registration no', 'nric / company registration no',
            'nric no / business registration no', 'nric/bc/passport no', 'nric/passport/business registration no'],
    generic: ['nric no', 'nric', 'ic no', 'nric number'] },
  { key: 'ownerOldIc', label: 'Old NRIC / Passport No.', group: 'owner',
    match: ['old nric/bc/passport no', 'old nric no', 'old ic no', 'passport no', 'old nric/passport no', 'old nric / passport no'] },
  { key: 'ownerDob', label: 'Date of Birth', group: 'owner', placeholder: 'DD/MM/YYYY', date: true,
    match: ['date of birth', 'dob', 'date of birth \\(dd/mm/yyyy\\)'] },
  { key: 'ownerGender', label: 'Gender', group: 'owner', options: ['', 'Male', 'Female'] },
  { key: 'ownerMarital', label: 'Marital Status', group: 'owner', options: ['', 'Single', 'Married', 'Divorced', 'Widowed'] },
  { key: 'ownerNationality', label: 'Nationality', group: 'owner', placeholder: 'Malaysian', match: ['nationality', 'citizenship'] },
  { key: 'ownerOccupation', label: 'Occupation', group: 'owner', match: ['occupation', 'occupation/job title', 'exact duties', 'job title'] },
  { key: 'ownerEmployer', label: 'Employer / Business Name', group: 'owner', match: ['name of employer', 'employer(\'?s)? name', 'employer'] },

  // Life Assured
  { key: 'laName', label: 'Life Assured Name', group: 'la', fallback: 'ownerName',
    match: ['name of life (to be )?assured', 'life (to be )?assured(\'?s)? name', 'name of (the )?insured( person)?', 'insured person(\'?s)? name',
            'name of patient', 'patient(\'?s)? name', 'name of deceased', 'deceased(\'?s)? name', 'name of (the )?life assured/deceased',
            'name of (insured )?member', 'member(\'?s)? name', 'name of employee', 'employee(\'?s)? name', 'name of insured/member'] },
  { key: 'laNric', label: 'Life Assured NRIC No.', group: 'la', fallback: 'ownerNric',
    match: ['nric no of life (to be )?assured', 'life assured(\'?s)? nric no', 'nric no of (the )?insured( person)?', 'insured(\'?s)? nric no',
            'nric no of patient', 'patient(\'?s)? nric no', 'member(\'?s)? nric no', 'employee(\'?s)? nric no', 'nric no of deceased'] },
  { key: 'laDob', label: 'Life Assured Date of Birth', group: 'la', fallback: 'ownerDob', date: true,
    match: ['date of birth of life (to be )?assured', 'life assured(\'?s)? date of birth', 'patient(\'?s)? date of birth'] },
  { key: 'laGender', label: 'Life Assured Gender', group: 'la', fallback: 'ownerGender', options: ['', 'Male', 'Female'] },
  { key: 'parentRel', label: 'Proposer is a parent (third-party policy)', group: 'la', sources: ['ownerName', 'laName'] },
  { key: 'laAge', label: 'Life Assured Age (from date of birth)', group: 'la', sources: ['laDob', 'ownerDob'] },
  { key: 'relationship', label: 'Relationship to Policyowner', group: 'la',
    match: ['relationship( to policy ?owner)?', 'relationship with policy ?owner', 'relationship to (the )?(life assured|insured|member|employee)'] },

  // Contact
  { key: 'mobile', label: 'Mobile No.', group: 'contact', placeholder: '+60 12-345 6789', mobile: true,
    match: ['mobile( phone)?( no| number)?', 'handphone( no)?', 'h/p( no)?', 'hp no', 'mobile/handphone no', 'contact no', 'contact number',
            'tel no \\(mobile\\)', 'mobile no \\(hp\\)', 'telephone no \\(mobile\\)', 'tel no\\(hp\\)', 'telephone/mobile no'] },
  { key: 'mobileCC', label: 'Mobile: country code (60)', group: 'contact', sources: ['mobile'] },
  { key: 'mobileNoZero', label: 'Mobile without leading 0 (e.g. 123456789)', group: 'contact', sources: ['mobile'] },
  { key: 'mobileCode', label: 'Mobile: prefix (e.g. 012)', group: 'contact', sources: ['mobile'] },
  { key: 'mobilePrefix', label: 'Mobile: network code (e.g. 12)', group: 'contact', sources: ['mobile'] },
  { key: 'mobileRest', label: 'Mobile: number after network code', group: 'contact', sources: ['mobile'] },
  { key: 'homeTel', label: 'Home Tel. No.', group: 'contact',
    match: ['tel no \\(home\\)', 'home( tel)?( no)?', 'telephone no \\(home\\)', 'house( tel)? no', 'tel \\(home\\)', 'home telephone( no)?'] },
  { key: 'officeTel', label: 'Office Tel. No.', group: 'contact',
    match: ['tel no \\(office\\)', 'office( tel)?( no)?', 'telephone no \\(office\\)', 'tel \\(office\\)', 'office telephone( no)?'] },
  { key: 'email', label: 'Email Address', group: 'contact', match: ['e-?mail( address)?', 'e-?mail add'] },
  { key: 'address1', label: 'Address Line 1', group: 'contact',
    match: ['(residential|correspondence|mailing|home|permanent|current) address', 'address( of policy ?owner)?', 'address \\(residential\\)', 'address \\(mailing\\)'] },
  { key: 'address2', label: 'Address Line 2', group: 'contact' },
  { key: 'address3', label: 'Address Line 3', group: 'contact' },
  // Built automatically from the address details (no input box of their own).
  { key: 'fullAddress', label: 'Full address (one line)', group: 'contact', sources: ['address1', 'address2', 'postcode', 'town', 'state'] },
  { key: 'streetLine', label: 'Address lines 1 and 2 (one line)', group: 'contact', sources: ['address1', 'address2'] },
  { key: 'cityLine', label: 'Postcode, town, state', group: 'contact', sources: ['postcode', 'town', 'state'] },
  { key: 'postcode', label: 'Postcode', group: 'contact', match: ['postcode', 'post code', 'postal code', 'poskod'] },
  { key: 'town', label: 'Town / City', group: 'contact', match: ['town', 'city', 'town/city', 'city/town'] },
  { key: 'state', label: 'State', group: 'contact', match: ['state'] },
  { key: 'country', label: 'Country', group: 'contact', placeholder: 'Malaysia', match: ['country'] },

  // Policy
  { key: 'policyNo', label: 'Policy No.', group: 'policy', docMatch: ['p/n', 'p/no', 'pn', 'pol no', 'policy'],
    match: ['policy (no|number)', 'policy no\\(s\\)', 'policy/certificate no', 'certificate (no|number)', 'policy no/certificate no', 'contract no'] },
  { key: 'proposalNo', label: 'Proposal No.', group: 'policy', match: ['proposal (no|number)', 'proposal/policy no'] },
  { key: 'planName', label: 'Plan Name', group: 'policy', match: ['plan name', 'name of plan', 'product name', 'plan type'] },

  // Bank
  { key: 'bankName', label: 'Bank Name', group: 'bank', match: ['(name of )?bank( name)?', 'bank', 'name of bank/financial institution', 'bank/financial institution', '(name of )?beneficiary bank', 'name of bank \\(beneficiary\\)'] },
  { key: 'bankAccNo', label: 'Bank Account No.', group: 'bank', match: ['(bank )?account (no|number)', 'bank a/c no', 'a/c no', 'account no\\.?'] },
  { key: 'bankAccHolder', label: 'Account Holder Name', group: 'bank', fallback: 'ownerName',
    match: ['(name of )?account holder(\'?s)?( name)?', 'account name', 'name of account holder', 'account holder name'] },

  // Company
  { key: 'companyName', label: 'Company Name', group: 'company',
    match: ['(name of )?company( name)?', 'company/business name', 'name of business', 'business name', 'name of policyholder', 'policyholder(\'?s)? name',
            'name of (the )?employer/company', 'name of organisation', 'organisation name', 'name of corporation', 'corporate name'] },
  { key: 'holderName', label: 'Policyholder (company name, else customer name)', group: 'company', sources: ['companyName', 'ownerName'] },
  { key: 'holderId', label: 'Business Reg. No., else NRIC No.', group: 'company', sources: ['companyRegNo', 'ownerNric'] },
  { key: 'companyRegNo', label: 'Company Registration No.', group: 'company',
    match: ['(company |business )?registration no', 'company reg no', 'roc no', 'ssm no', 'business registration no', 'company no', 'registration number'] },
  { key: 'companyAddress', label: 'Company Address', group: 'company', match: ['company address', 'business address', 'address of company', 'office address'] },
  { key: 'contactPerson', label: 'Contact Person', group: 'company', match: ['contact person', 'name of contact person', 'person in charge'] },
  { key: 'staffNo', label: 'Employee / Staff No.', group: 'company', match: ['staff no', 'employee no', 'staff id', 'employee id', 'member(ship)? no', 'staff/employee no'] },

  // Claim
  { key: 'accidentDate', label: 'Date of Accident', group: 'claim', date: true,
    match: ['date of (accident|injury|incident|accident/injury)', 'date and time of accident', 'accident date'] },
  { key: 'accidentPlace', label: 'Place of Accident', group: 'claim', match: ['place of (accident|incident)', 'location of accident'] },
  { key: 'hospital', label: 'Hospital / Clinic', group: 'claim',
    match: ['(name of )?(hospital|clinic)( name)?', 'name of hospital/clinic', 'hospital/clinic( name)?', 'name and address of hospital'] },
  { key: 'admissionDate', label: 'Date of Admission', group: 'claim', date: true, match: ['date of admission', 'admission date'] },
  { key: 'dischargeDate', label: 'Date of Discharge', group: 'claim', date: true, match: ['date of discharge', 'discharge date'] },
  { key: 'diagnosis', label: 'Diagnosis', group: 'claim', match: ['diagnosis', 'nature of illness', 'nature of illness/injury'] },
  { key: 'deathDate', label: 'Date of Death', group: 'claim', date: true, match: ['date of death'] },
  { key: 'causeOfDeath', label: 'Cause of Death', group: 'claim', match: ['cause of death'] },
  { key: 'claimAmount', label: 'Claim Amount (RM)', group: 'claim', match: ['amount claimed', 'claim amount', 'total amount claimed'] },

  // Nominees and trustees (built below)
  ...personFields('nominee', 'Nominee', [1, 2], true),
  ...personFields('trustee', 'Trustee', [1, 2], false),
  // Consent signers on "Trustee / Nominee / Parent" signature blocks: the trustee if appointed, else the nominee.
  ...[1, 2].flatMap(n => ['Name', 'Nric', 'Dob', 'Mobile', 'Relationship'].map(p => ({
    key: `signer${n}${p}`, label: `Trustee (or Nominee) ${n} signing: ${({ Name: 'Name', Nric: 'NRIC No.', Dob: 'Date of Birth', Mobile: 'Mobile No.', Relationship: 'Relationship' })[p]}`, group: `nominee${n}`, pick: [`trustee${n}${p}`, `nominee${n}${p}`],
    sources: [`trustee${n}${p}`, `nominee${n}${p}`],
  }))),

  // Agent
  { key: 'agentName', label: 'Agent Name', group: 'agent',
    match: ['agent(\'?s)? name', 'name of agent', 'servicing agent(\'?s)? name', 'name of (servicing )?(agent|advisor|intermediary)'] },
  { key: 'agentCode', label: 'IAC / Agent ID', group: 'agent', match: ['agent(\'?s)? code', 'agent no', 'agent id', 'iac no', 'iac', 'agency code', 'intermediary code', 'advisor code'] },
  { key: 'agentNric', label: 'Agent NRIC No.', group: 'agent' },
  { key: 'agentDob', label: 'Agent Date of Birth', group: 'agent', date: true },
  { key: 'agentMobile', label: 'Agent Mobile No.', group: 'agent', mobile: true, match: ['agent(\'?s)? (contact|mobile|tel)( no)?'] },
  { key: 'agentAddress', label: 'Agent Address (line 1)', group: 'agent' },
  { key: 'agentAddress2', label: 'Agent Address (line 2)', group: 'agent' },
  { key: 'agentAddress23', label: 'Agent Address (lines 2 and 3 on one line)', group: 'agent', sources: ['agentAddress2', 'agentCityLine'] },
  { key: 'agentPostcode', label: 'Agent Postcode', group: 'agent' },
  { key: 'agentTown', label: 'Agent Town', group: 'agent' },
  { key: 'agentCountry', label: 'Agent Country', group: 'agent' },
  { key: 'agentCityLine', label: 'Agent Address (line 3)', group: 'agent' },

  // Other
  { key: 'signDate', label: 'Signing Date', group: 'other', date: true, placeholder: 'DD/MM/YYYY (leave blank to sign by hand)' },
  { key: 'remarks', label: 'Remarks / Other Changes', group: 'other', match: ['other changes', 'remarks', 'others \\(please specify\\)'] },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map(f => [f.key, f]));

// Generic labels ("Name", "NRIC No", "Date") are resolved by the nearest heading that mentions a role.
export const CONTEXT_RULES = [
  { re: /witness|agent|intermediary|advisor/, map: { name: 'agentName', nric: 'agentNric', date: null, tel: 'agentMobile' } },
  { re: /trustee|nominee|assignee|guardian|parent|doctor|physician|bank officer|authori[sz]ed|signatory|spouse|beneficiar(?!y bank)|employer|officer|company stamp|interpreter|translator|next of kin/,
    map: { name: null, nric: null, date: null, tel: null } },
  { re: /policy ?owner|life (to be )?assured|proposer|claimant|insured|applicant|patient|member|employee|customer/, map: null },
];

export function normaliseLabel(s) {
  return s.toLowerCase()
    .replace(/[\u2019`]/g, "'")
    .replace(/\((mandatory|compulsory|optional|if any|if applicable|required)\)/g, ' ')
    .replace(/[.:*_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const compiled = FIELDS.flatMap(f => (f.match || []).map(p => ({ key: f.key, re: new RegExp('^' + p.replace(/ /g, ' ?') + '$') })));
const genericKind = { 'name': 'name', 'nric no': 'nric', 'nric': 'nric', 'ic no': 'nric', 'nric number': 'nric', 'date': 'date',
  'tel no': 'tel', 'telephone no': 'tel', 'contact no': 'tel' };
const PERSONAL = new Set(['owner', 'contact']);
const genericDefault ={ name: 'ownerName', nric: 'ownerNric', date: 'signDate', tel: 'mobile' };

// Returns { key } for a label, or null. `context` lists nearby texts, nearest first.
export function matchLabel(text, context = []) {
  const n = normaliseLabel(text);
  if (!n || n.length > 70) return null;
  const kind = genericKind[n];
  if (kind) {
    for (const t of context) {
      const rule = CONTEXT_RULES.find(r => r.re.test(t));
      if (!rule) continue;
      if (!rule.map) break; // the customer's own block
      return rule.map[kind] ? { key: rule.map[kind] } : null;
    }
    return { key: genericDefault[kind] };
  }
  const hit = compiled.find(c => c.re.test(n));
  if (!hit) return null;
  // Personal details inside a witness / nominee / doctor block belong to that person, not the customer.
  if (PERSONAL.has(FIELD_BY_KEY[hit.key].group)) {
    for (const t of context) {
      if (t.heading) continue; // only labels close by, not page/section titles
      const rule = CONTEXT_RULES.find(r => r.re.test(t));
      if (rule) return rule.map ? null : { key: hit.key };
    }
  }
  return { key: hit.key };
}
