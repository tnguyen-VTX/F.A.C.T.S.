// Reads an OBMS BAR upload file (UBH header + UBL lines) back into a draft BAR the user can edit and rebuild. Pure.
// The file carries a 3-digit location; the school's account codes use a longer location segment (district + location),
// so the segment is rebuilt from the profile. Nothing is guessed: a file for another district is refused.
import { parseCSV } from './csv.js';
import { BAR_TYPES, barLine, newBar } from './bar.js';
import { awardCode } from './awardLetter.js';

const UPLOAD_LEN = 3;
const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
};
const same = (a, b) => String(parseInt(a, 10)) === String(parseInt(b, 10));

// The location segment for a 3-digit upload location: the segment itself when it is 3 long, else the district code
// (left padded) followed by the location, as the school's own codes show (001 + 707 = 001707). '' if it cannot be made.
export function locationSegment(profile, loc3) {
  const len = profile?.segments?.find((s) => s.key === 'loc')?.len;
  if (!len || !/^\d{3}$/.test(String(loc3))) return '';
  if (len === UPLOAD_LEN) return String(loc3);
  const dist = String(profile.districtCode || '').padStart(len - UPLOAD_LEN, '0');
  return dist.length + UPLOAD_LEN === len ? dist + loc3 : '';
}

// Returns { bar, warnings, errors }. With errors there is no bar.
export function parseBarCsv(text, profile, fiscalYear) {
  const errors = [],
    warnings = [];
  const rows = parseCSV(text)
    .map((r) => r.map((c) => String(c).trim()))
    .filter((r) => r.some((c) => c !== ''));
  const heads = rows.filter((r) => r[0] === 'UBH');
  if (heads.length !== 1)
    return { errors: [heads.length ? 'The file has more than one UBH header line.' : 'This does not look like an OBMS BAR upload file: there is no UBH header line.'], warnings };
  const h = heads[0];
  if (h.length < 15) errors.push(`The UBH header has ${h.length} fields; an OBMS header has 15.`);
  const [, district, year, fund, type] = h;
  if (!BAR_TYPES[type]) errors.push(`The BAR type "${type}" is not one of ${Object.keys(BAR_TYPES).join(', ')}.`);
  if (!/^\d{5}$/.test(fund || '')) errors.push(`The fund "${fund}" is not 5 digits.`);
  if (profile?.districtCode && district && !same(district, profile.districtCode))
    errors.push(
      `This file is for district ${district}, but the selected school (${profile.name}) is district ${profile.districtCode}. Choose the right school on Schools first.`,
    );
  if (fiscalYear && year && String(year) !== String(fiscalYear))
    warnings.push(`The file's budget year is ${year}, not ${fiscalYear}. The new file will use ${fiscalYear}.`);
  const lines = [];
  let n = 0;
  for (const r of rows) {
    if (r[0] === 'UBH') continue;
    n++;
    if (r[0] !== 'UBL') {
      warnings.push(`Record ${n + 1} starts with "${r[0]}", not UBL, and was skipped.`);
      continue;
    }
    if (r.length < 9) {
      errors.push(`Line ${n + 1}: a UBL line has 9 fields, this one has ${r.length}.`);
      continue;
    }
    const [, f, func, obj, prog, loc, job, amt, fte] = r;
    const seg = locationSegment(profile, loc);
    const code = seg ? awardCode(profile, { fund: f, func, obj, prog, loc: seg, job }) : null;
    const amount = num(amt);
    if (!code) errors.push(`Line ${n + 1}: ${f}-${func}-${obj}-${prog}-${loc}-${job} does not fit this school's account code layout.`);
    else if (!Number.isFinite(amount)) errors.push(`Line ${n + 1}: the amount "${amt}" is not a number.`);
    else {
      const l = barLine(profile, code, amount, Number.isFinite(num(fte)) ? num(fte) : 0);
      if (l.fte) l.fteManual = true; // the file's FTE is kept until the user changes it
      lines.push(l);
    }
  }
  if (!lines.length && !errors.length) errors.push('The file has a header but no UBL lines.');
  if (errors.length) return { errors, warnings };
  const bar = newBar(type, fund);
  bar.contact = { first: h[5] || '', middle: h[6] || '', last: h[7] || '' };
  bar.flowthrough = { scope: h[10] || '', from: h[8] || '', to: h[9] || '', carryover: h[11] || '', allocation: h[12] || '', total: h[13] || '' };
  bar.justification = h.slice(14).join(',');
  bar.lines = lines;
  return { bar, warnings, errors };
}
