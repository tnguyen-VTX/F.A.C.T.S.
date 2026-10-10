// School profile: everything that varies by school lives here, never in code.
// Pure functions (no DOM, no storage) so they run in Node tests.

// Standard segment keys, in the order a UCOA account code lists them. A profile
// may add trailing extra segments (for example Cesar Chavez's unused 5-digit tail).
export const SEGMENT_KEYS = ['fund', 'func', 'obj', 'prog', 'loc', 'job'];
export const SEGMENT_LABELS = {
  fund: 'Fund',
  func: 'Function',
  obj: 'Object',
  prog: 'Program',
  loc: 'Location',
  job: 'Job class',
};
// OBMS BAR upload (spec v2.1.4, Table 27b): Entity Location Code is 3 digits.
export const UPLOAD_LOCATION_LEN = 3;

const seg = (key, len) => ({ key, len, label: SEGMENT_LABELS[key] || key });

export function newProfile(over = {}) {
  return {
    id: '',
    name: '',
    entityName: '',
    reportNames: [], // other spellings of the school name that its reports print
    districtCode: '',
    locationIds: [], // PED Location IDs (3 digits) this school uses; a BAR line elsewhere gets a warning
    accountingSystem: 'aptafund',
    segments: [seg('fund', 5), seg('func', 4), seg('obj', 5), seg('prog', 4), seg('loc', 6), seg('job', 4)],
    // How the 3-digit upload location is taken from the account code's location segment.
    // type 'lastN' keeps the last n digits; 'full' uses the segment as is (must already be 3 digits).
    locationRule: { type: 'lastN', n: UPLOAD_LOCATION_LEN, confirmed: false },
    funds: [], // { code, name, flowthrough, reimbursable }
    donorPriority: [], // function codes, first = take from first
    fteObjects: ['511'], // object prefixes whose BAR lines carry an FTE change (salaries)
    defaultCushion: { type: 'amount', value: 0 },
    contacts: [], // { name, title }: typed by the user, never committed
    ...over,
  };
}

// Built-in starting point for Gilbert L. Sena (the v0.1 workbook). The upload
// location rule is a guess until it is checked against an accepted upload.
export function gilbertPreset() {
  return newProfile({
    id: 'gilbert-l-sena',
    name: 'Gilbert L. Sena Charter High School',
    entityName: 'Gilbert L Sena Charter Hs',
    districtCode: '001',
    locationIds: ['707'],
  });
}

const stdKeys = new Set(SEGMENT_KEYS);

export function validateProfile(p) {
  const errs = [];
  if (!String(p.name || '').trim()) errs.push('Give the school a name.');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(p.id || '')))
    errs.push('The profile id must be lowercase letters, digits and dashes.');
  if (p.districtCode !== '' && !/^\d{1,3}$/.test(String(p.districtCode)))
    errs.push('The district/parent code is 1 to 3 digits.');
  if ((p.locationIds || []).some((x) => !/^\d{3}$/.test(String(x))))
    errs.push('PED location IDs are 3 digits each.');
  const segs = p.segments || [];
  if (!segs.length) errs.push('Add the account code segments.');
  const keys = segs.map((s) => s.key);
  for (const k of SEGMENT_KEYS)
    if (!keys.includes(k)) errs.push(`The account code needs a ${SEGMENT_LABELS[k].toLowerCase()} segment.`);
  if (new Set(keys).size !== keys.length) errs.push('Each segment may appear only once.');
  const std = keys.filter((k) => stdKeys.has(k));
  if (std.join() !== SEGMENT_KEYS.filter((k) => keys.includes(k)).join())
    errs.push('Segments must be in the order fund, function, object, program, location, job class.');
  for (const s of segs)
    if (!Number.isInteger(s.len) || s.len < 1 || s.len > 12)
      errs.push(`The ${s.label || s.key} segment length must be 1 to 12.`);
  const r = p.locationRule || {};
  if (r.type === 'lastN') {
    if (!Number.isInteger(r.n) || r.n < 1 || r.n > UPLOAD_LOCATION_LEN)
      errs.push(`The location rule keeps 1 to ${UPLOAD_LOCATION_LEN} digits.`);
  } else if (r.type !== 'full') errs.push('Choose a location rule.');
  const locLen = segs.find((s) => s.key === 'loc')?.len;
  if (r.type === 'full' && locLen && locLen !== UPLOAD_LOCATION_LEN)
    errs.push(`With "use the segment as is", the location segment must be ${UPLOAD_LOCATION_LEN} digits.`);
  if (r.type === 'lastN' && locLen && r.n > locLen)
    errs.push('The location rule keeps more digits than the segment has.');
  const codes = (p.funds || []).map((f) => f.code);
  if (codes.some((c) => !/^\d{5}$/.test(String(c)))) errs.push('Fund codes are 5 digits.');
  if (new Set(codes).size !== codes.length) errs.push('A fund is listed twice.');
  if ((p.fteObjects || []).some((x) => !/^\d{1,5}$/.test(String(x))))
    errs.push('FTE objects are digits, like 511.');
  if ((p.donorPriority || []).some((c) => !/^\d{4}$/.test(String(c))))
    errs.push('Donor priority lists 4-digit function codes.');
  return errs;
}

export function codePattern(p) {
  return new RegExp('^' + p.segments.map((s) => `\\d{${s.len}}`).join('-') + '$');
}
export function isAccountCode(p, code) {
  return codePattern(p).test(String(code).trim());
}
// Split an account code by the profile's segments. Returns null if it doesn't fit.
// Standard segments come back under their keys; extra segments under `extra`.
export function splitWith(p, code) {
  const c = String(code).trim();
  if (!isAccountCode(p, c)) return null;
  const parts = c.split('-');
  const out = { extra: [] };
  p.segments.forEach((s, i) => {
    if (stdKeys.has(s.key)) out[s.key] = parts[i];
    else out.extra.push(parts[i]);
  });
  return out;
}
// Position-based split with no length check, for sources (cash receipts) that were never
// validated against the code pattern. Missing segments come back as ''.
export function looseSplit(p, code) {
  const parts = String(code).split('-');
  const out = { extra: [] };
  p.segments.forEach((s, i) => {
    if (stdKeys.has(s.key)) out[s.key] = parts[i] || '';
    else out.extra.push(parts[i] || '');
  });
  return out;
}
// Funds are edited as text, one per line: "24101, Title I Part A, F" (F marks flowthrough, R reimbursable).
export function parseFundLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [code = '', name = '', flags = ''] = l.split(',').map((x) => x.trim());
      return {
        code,
        name,
        flowthrough: /f/i.test(flags),
        reimbursable: /r/i.test(flags),
      };
    });
}
export function fundLines(funds) {
  return (funds || [])
    .map((f) =>
      [f.code, f.name, (f.flowthrough ? 'F' : '') + (f.reimbursable ? 'R' : '')]
        .join(', ')
        .replace(/,\s*$/, ''),
    )
    .join('\n');
}
export const parseList = (text) =>
  String(text || '')
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
// The 3-digit Entity Location Code for the OBMS upload, or '' if it can't be derived.
export function uploadLocation(p, locSegment) {
  const s = String(locSegment || '');
  const r = p.locationRule || {};
  const v = r.type === 'lastN' ? s.slice(-r.n) : s;
  return v.length === UPLOAD_LOCATION_LEN && /^\d+$/.test(v) ? v : '';
}
