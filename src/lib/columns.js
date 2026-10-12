// Find report columns by header name, never by position. Pure.
// spec: { key: { names: ['Header', 'Alias'], required: true } }
const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function findColumns(headerRow, spec) {
  const heads = (headerRow || []).map(norm);
  const map = {};
  const missing = [];
  for (const [key, def] of Object.entries(spec)) {
    const i = heads.findIndex((h) => def.names.some((n) => norm(n) === h));
    if (i >= 0) map[key] = i;
    else if (def.required) missing.push(def.names[0]);
  }
  return { map, missing, found: (headerRow || []).map((h) => String(h ?? '').trim()).filter(Boolean) };
}

// The message shown when a required column is missing. Nothing is loaded; no column is guessed.
export function missingColumnsMessage(reportName, missing, found) {
  return `${reportName} is missing ${missing.length === 1 ? 'this column' : 'these columns'}: ${missing.join(', ')}. Columns found: ${found.join(', ') || '(none)'}. Run the report again with those columns included.`;
}

// Index of the header row: the first row that contains every required header name.
export function findHeaderRow(rows, spec, maxScan = 30) {
  const need = Object.values(spec).filter((d) => d.required);
  for (let i = 0; i < Math.min(rows.length, maxScan); i++) {
    const heads = (rows[i] || []).map(norm);
    if (need.every((d) => d.names.some((n) => heads.includes(norm(n))))) return i;
  }
  return -1;
}
