// Saved journal entries and their status log (pure). Same ideas as saved BARs (barLog.js).
import { newId } from './barLog.js';
import { r2 } from './format.js';
import { chargeKey } from './reclass.js';

export const JE_STATUSES = ['Prepared', 'Entered in AptaFund', 'Posted', 'Cancelled'];
// Once entered in AptaFund the lines are frozen: they match what was keyed.
const FROZEN = new Set(['Entered in AptaFund', 'Posted']);
export const isJEFrozen = (e) => FROZEN.has(e?.status);

const iso = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));
const clone = (x) => JSON.parse(JSON.stringify(x));

// Save a made entry. src = { kind: 'reclass' | 'bar', je, moves (reclass), docId (bar), vendor (reclass) }.
// A BAR that is already saved (same Doc ID, not cancelled) is refused. Returns { list, entry, error }.
export function saveJE(list, src, now = Date.now()) {
  if (src.kind === 'bar' && src.docId) {
    const dup = list.find((e) => e.kind === 'bar' && e.docId === src.docId && e.status !== 'Cancelled');
    if (dup)
      return {
        list,
        entry: dup,
        error: `A journal entry for BAR ${src.docId} is already saved (${dup.status}).`,
      };
  }
  const entry = {
    id: newId(now),
    kind: src.kind,
    je: clone(src.je),
    moves: clone(src.moves || []),
    docId: src.docId || '',
    vendor: src.vendor || '',
    status: 'Prepared',
    number: '',
    log: [{ status: 'Prepared', date: iso(now), note: '' }],
    createdAt: now,
    updatedAt: now,
  };
  return { list: [...list, entry], entry };
}

// Move to a new status. number is the AptaFund JE number (e.g. T0048612, 00047858), typed by the user.
export function addJEStatus(entry, status, date, note = '', number = '', now = Date.now()) {
  if (!JE_STATUSES.includes(status)) throw new Error(`Unknown status "${status}".`);
  return {
    ...entry,
    status,
    number: String(number || entry.number || ''),
    log: [...entry.log, { status, date: date || iso(now), note: String(note || '') }],
    updatedAt: now,
  };
}

export function removeJE(list, id) {
  const e = list.find((x) => x.id === id);
  if (!e) return { list, error: 'That entry is not in the list.' };
  if (isJEFrozen(e))
    return { list, error: `This entry is ${e.status}, so it cannot be deleted. Cancel it instead.` };
  return { list: list.filter((x) => x.id !== id) };
}

// How much of each charge saved reclass entries already moved: { 'code|date': amount }. Cancelled entries do not count.
export function reclassedMap(list) {
  const m = {};
  for (const e of list)
    if (e.kind === 'reclass' && e.status !== 'Cancelled')
      for (const mv of e.moves || []) {
        const k = chargeKey(mv.from, mv.date);
        m[k] = r2((m[k] || 0) + mv.amount);
      }
  return m;
}
