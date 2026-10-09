// Parsed reports kept in the browser (IndexedDB) so a reload does not lose them.
// Only parsed rows are stored, never the original file. Pure helpers; main.js does the I/O.
export const RETAIN_DAYS = 30;
const DAY = 86400000;

export const reportKey = (school, fy, kind, at) => `rpt:${school}:${fy}:${kind}:${at}`;
export function parseReportKey(k) {
  const m = String(k).match(/^rpt:(.+):(\d{4}):(asr|fa):(\d+)$/);
  return m ? { school: m[1], fy: +m[2], kind: m[3], at: +m[4] } : null;
}
export const isReportKey = (k) => parseReportKey(k) !== null;

// The newest saved report of each kind for one school and fiscal year.
export function latestKeys(keys, school, fy) {
  const out = {};
  for (const k of keys) {
    const p = parseReportKey(k);
    if (!p || p.school !== school || p.fy !== fy) continue;
    if (!out[p.kind] || p.at > parseReportKey(out[p.kind]).at) out[p.kind] = k;
  }
  return out;
}
// Loads older than RETAIN_DAYS, except the newest of each kind per school and year.
export function expiredKeys(keys, now = Date.now(), days = RETAIN_DAYS) {
  const parsed = keys.map((k) => ({ k, p: parseReportKey(k) })).filter((x) => x.p);
  const newest = new Map();
  for (const { k, p } of parsed) {
    const g = `${p.school}:${p.fy}:${p.kind}`;
    if (!newest.has(g) || p.at > newest.get(g).at) newest.set(g, { k, at: p.at });
  }
  return parsed
    .filter(({ k, p }) => now - p.at > days * DAY && newest.get(`${p.school}:${p.fy}:${p.kind}`).k !== k)
    .map((x) => x.k);
}

export const packASR = (a) => ({ ...a, funds: [...a.funds.entries()] });
export const unpackASR = (a) => ({ ...a, funds: new Map(a.funds) });

export function makeRecord(result, { school, fy, at }) {
  return {
    kind: result.kind,
    name: result.name,
    school,
    fy,
    at,
    params: result.params || null,
    checks: result.checks,
    data: result.kind === 'asr' ? packASR(result.asr) : result.fa,
  };
}
export function resultFromRecord(rec) {
  const base = { kind: rec.kind, name: rec.name, checks: rec.checks };
  return rec.kind === 'asr'
    ? { ...base, asr: unpackASR(rec.data), params: rec.params }
    : { ...base, fa: rec.data };
}
