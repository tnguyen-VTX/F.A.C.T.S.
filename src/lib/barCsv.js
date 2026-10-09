// The OBMS BAR upload file (spec v2.1.4, section 3.4.3). Pure; built as a string, never through Excel.
//   UBH header, 15 fields:  UBH, district, budget year, fund, type, first, middle, last,
//                           from, to, scope, carryover, allocation, total, justification
//   UBL line, 9 fields:     UBL, fund, function, object, program, location (3), job class, amount, FTE
// Records end CR LF (also the last one). No BOM. Zero-dollar lines are left out.
import { isRevenueObject, validateBar, canDownload } from './bar.js';
import { uploadLocation } from './profile.js';

const CRLF = '\r\n';
const r2 = (n) => Math.round(n * 100) / 100;
// Whole dollars stay whole (2350); cents get two places (-256945.17).
export const fmtAmount = (n) => (Number.isInteger(r2(n)) ? String(r2(n)) : r2(n).toFixed(2));
export const fmtFte = (n) => (!n ? '0' : Number(n).toFixed(4));
const oneLine = (s) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
const money = (v) => (v === '' || v == null ? '' : String(v).replace(/[$,\s]/g, ''));

// Line order: revenue first for Increase, Initial budget and Decrease (as the spec's example); decreases first
// for Transfer and Maintenance (as the accepted example). Otherwise the user's order is kept.
export function orderLines(bar) {
  const rank = (l) =>
    bar.type === 'T' || bar.type === 'M' ? (l.amount < 0 ? 0 : 1) : isRevenueObject(l.obj) ? 0 : 1;
  return bar.lines
    .map((l, i) => ({ l, i }))
    .sort((a, b) => rank(a.l) - rank(b.l) || a.i - b.i)
    .map((x) => x.l);
}

export function barCsv(bar, { profile, fiscalYear }) {
  const flow = (profile.funds || []).find((f) => f.code === bar.fund)?.flowthrough;
  const ft = bar.flowthrough || {};
  const header = [
    'UBH',
    profile.districtCode,
    fiscalYear,
    bar.fund,
    bar.type,
    oneLine(bar.contact?.first),
    oneLine(bar.contact?.middle),
    oneLine(bar.contact?.last),
    ...(flow
      ? [ft.from, ft.to, ft.scope, money(ft.carryover), money(ft.allocation), money(ft.total)]
      : ['', '', '', '', '', '']),
    oneLine(bar.justification),
  ];
  const lines = orderLines(bar)
    .filter((l) => r2(l.amount) !== 0)
    .map((l) => [
      'UBL',
      l.fund,
      l.func,
      l.obj,
      l.prog,
      uploadLocation(profile, l.loc),
      l.job,
      fmtAmount(l.amount),
      fmtFte(l.fte),
    ]);
  return [header, ...lines].map((r) => r.join(',')).join(CRLF) + CRLF;
}

// Safe file name that names the school, so a file cannot be mistaken for another school's.
export const barFileName = (profile, bar, fiscalYear) =>
  `${profile.id}_${bar.fund}_${bar.type}_FY${fiscalYear}.csv`;

// The file, or the reasons there is none. The file is never made while a check says stop.
export function makeBarFile(bar, { profile, asr, fiscalYear }) {
  const checks = validateBar(bar, { profile, asr });
  if (!canDownload(checks)) return { ok: false, checks, csv: '', name: '' };
  return {
    ok: true,
    checks,
    csv: barCsv(bar, { profile, fiscalYear }),
    name: barFileName(profile, bar, fiscalYear),
  };
}
