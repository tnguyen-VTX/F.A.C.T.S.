// Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, line breaks inside quotes,
// CRLF or LF records, optional BOM. Pure, so it runs in Node tests.
export function parseCSV(text) {
  let s = String(text ?? '');
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [],
    field = '',
    inQ = false,
    i = 0;
  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };
  while (i < s.length) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQ = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === '') {
      inQ = true;
      i++;
    } else if (ch === ',') {
      endField();
      i++;
    } else if (ch === '\r') {
      endRow();
      i += s[i + 1] === '\n' ? 2 : 1;
    } else if (ch === '\n') {
      endRow();
      i++;
    } else {
      field += ch;
      i++;
    }
  }
  if (field !== '' || row.length) endRow();
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}
