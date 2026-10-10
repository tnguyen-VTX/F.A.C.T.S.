// One-off: turn PED's school directory export (.xlsx) into src/data/nm-schools.json.
// Usage: node scripts/make-school-directory.mjs path/to/New_Mexico_Schools.xlsx
// Keeps only district and location identifiers; addresses and phone numbers are dropped.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(new URL('../package.json', import.meta.url));
const XLSX = require('xlsx');
const src = process.argv[2];
if (!src) throw new Error('Give the path to the directory export (.xlsx).');
const wb = XLSX.read(fs.readFileSync(src), { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
const head = rows[0].map((h) => String(h).trim());
const col = (name) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`Column "${name}" not found. Found: ${head.join(', ')}`);
  return i;
};
const I = {
  dn: col('District Name'),
  dc: col('District Code'),
  dt: col('District Type'),
  ln: col('Location Name'),
  li: col('Location ID'),
  st: col('Location Status'),
};
const clean = (s) => String(s).replace(/\s+/g, ' ').trim();
const out = rows
  .slice(1)
  .filter((r) => r[I.dc] && r[I.li])
  .map((r) => ({
    dn: clean(r[I.dn]),
    dc: clean(r[I.dc]).padStart(3, '0'),
    dt: clean(r[I.dt]),
    ln: clean(r[I.ln]),
    li: clean(r[I.li]).padStart(3, '0'),
    st: clean(r[I.st]),
  }));
fs.writeFileSync(new URL('../src/data/nm-schools.json', import.meta.url), JSON.stringify(out) + '\n');
console.log(`Wrote ${out.length} locations.`);
