export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export const num = (v) => {
  if (v == null || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isFinite(n) ? n : 0;
};
export const r2 = (n) => Math.round(n * 100) / 100;
export const roundAway = (n) => Math.sign(n) * Math.round(Math.abs(n));
export const fmtM = (n) => {
  n = r2(n);
  const s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${s})` : s;
};
export const money = (n) => `<span class="num${r2(n) < 0 ? ' neg' : ''}">${fmtM(n)}</span>`;
export const dollars = (n) => {
  n = r2(n);
  const s = '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return n < 0 ? `(${s})` : s;
};
export const pctS = (a, b) => (b ? ((a / b) * 100).toFixed(1) + '%' : '—');
export const serialToISO = (v) => {
  if (v == null || v === '') return '';
  if (typeof v === 'number') {
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return s.slice(0, 10);
};
export const fmtD = (iso) =>
  iso && /^\d{4}-\d\d-\d\d/.test(iso)
    ? `${+iso.slice(5, 7)}/${+iso.slice(8, 10)}/${iso.slice(0, 4)}`
    : iso || '';
export const monthName = (ym) =>
  new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
export const ACCT_RE = /^\d{5}-\d{4}-\d{5}-\d{4}-\d{6}-\d{4}$/;
export const splitCode = (c) => {
  const p = String(c).split('-');
  return {
    fund: p[0] || '',
    func: p[1] || '',
    obj: p[2] || '',
    prog: p[3] || '',
    loc: p[4] || '',
    job: p[5] || '',
  };
};
export const sumBy = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
export const T0 = () => ({ budget: 0, actual: 0, enc: 0, avail: 0 });
export const addT = (t, x) => {
  t.budget += x.budget;
  t.actual += x.actual;
  t.enc += x.enc;
  t.avail += x.avail;
  return t;
};
export const missingMsg = (s) =>
  `<div class="panel empty">This workbook has no “${esc(s)}” sheet, so there is nothing to show here yet.</div>`;
