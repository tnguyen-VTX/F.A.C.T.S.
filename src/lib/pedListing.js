// The PED Chart Line Listing (allowable UCOA strings), read as a stream and kept only for the funds asked for (pure).
// Columns: ChartOfAccountsName, AccountType, FundCode, FundName, FunctionCode, FunctionName, ObjectCode, ObjectName,
// ProgramCode, ProgramName, JobClassCode, JobClassName. One row per allowed fund/function/object/program/job class;
// there is no location. A string is kept as `func|obj|prog|job`.

// Split one CSV line into fields (quotes and doubled quotes; no line breaks inside a field).
export function splitLine(line) {
  const out = [];
  let cur = '',
    q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') ((cur += '"'), i++);
        else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') (out.push(cur), (cur = ''));
    else cur += c;
  }
  out.push(cur);
  return out;
}

// A parser fed text in pieces of any size. funds = Set of fund codes to keep (null keeps every fund).
export function createPedParser(funds) {
  const kept = new Map(); // fund -> Set('func|obj|prog|job')
  let tail = '',
    col = null,
    rows = 0;
  const seen = new Set();
  const handle = (line) => {
    if (!line.trim()) return;
    const f = splitLine(line.replace(/^﻿/, ''));
    if (!col) {
      const at = (n) => f.indexOf(n);
      col = {
        fund: at('FundCode'),
        func: at('FunctionCode'),
        obj: at('ObjectCode'),
        prog: at('ProgramCode'),
        job: at('JobClassCode'),
      };
      if (Object.values(col).some((i) => i < 0))
        throw new Error('This does not look like a PED Chart Line Listing: the code columns were not found.');
      return;
    }
    rows++;
    const fund = f[col.fund];
    seen.add(fund);
    if (funds && !funds.has(fund)) return;
    if (!kept.has(fund)) kept.set(fund, new Set());
    kept.get(fund).add(`${f[col.func]}|${f[col.obj]}|${f[col.prog]}|${f[col.job]}`);
  };
  return {
    push(text) {
      const parts = (tail + text).split(/\r?\n/);
      tail = parts.pop();
      for (const l of parts) handle(l);
    },
    finish() {
      if (tail) handle(tail);
      tail = '';
      return { kept, rows, funds: [...seen] };
    },
  };
}

// (code) => true | false | null. map = Map(fund -> Set or array of 'func|obj|prog|job'). null when that fund's listing
// is not loaded, so the caller can say it did not check. Location is ignored. code = 'fund-func-obj-prog-loc-job'
// in the profile's order; segs gives the positions.
export function makePedCheck(map, segs) {
  const idx = (k) => segs.findIndex((s) => s.key === k);
  const at = { fund: idx('fund'), func: idx('func'), obj: idx('obj'), prog: idx('prog'), job: idx('job') };
  const sets = new Map([...map].map(([f, v]) => [f, v instanceof Set ? v : new Set(v)]));
  return (code) => {
    const p = String(code).split('-');
    const s = sets.get(p[at.fund]);
    if (!s) return null;
    return s.has(`${p[at.func]}|${p[at.obj]}|${p[at.prog]}|${p[at.job]}`);
  };
}

// Decode a stream of bytes as text into the parser, chunk by chunk.
export function feedBytes(parser, decoder) {
  return (chunk, final) => parser.push(decoder.decode(chunk, { stream: !final }));
}
