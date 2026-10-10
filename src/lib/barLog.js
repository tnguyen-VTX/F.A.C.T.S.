// Saved BARs, their status log, and the backup file (pure: no DOM, no storage).
// OBMS's own action names (from a BAR's action history), plus Built (FACTS) and the staging result.
export const STATUSES = [
  'Built',
  'Uploaded - Staging Validated',
  'Create Direct BAR',
  'Direct BAR Submit to BM',
  'BM Approved Direct BAR - Submitted to SP',
  'SP Approved Direct BAR - Ready to submit to PED',
  'BM submitted Direct BAR to PED',
  'BA Approval - Submit to BS',
  'BS Approval - PED Approval',
  'Rejected',
  'Cancelled',
];
// Names used before OBMS's own names were adopted; saved logs and backups keep them.
export const LEGACY_STATUSES = ['Uploaded', 'Submitted', 'Approved'];
const KNOWN = new Set([...STATUSES, ...LEGACY_STATUSES]);
// From the first OBMS step on (anything but Built, Rejected, Cancelled) the lines are frozen: they match what OBMS received.
const FROZEN = new Set([
  ...STATUSES.filter((x) => !['Built', 'Rejected', 'Cancelled'].includes(x)),
  ...LEGACY_STATUSES,
]);
export const BACKUP_VERSION = 1;

const iso = (d) => (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10));
const clone = (x) => JSON.parse(JSON.stringify(x));
export const newId = (now) =>
  `bar-${new Date(now).getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const isFrozen = (entry) => FROZEN.has(entry?.status);

// Prior fiscal years stay editable until 10/31 after they end, then lock (the user can unlock).
export const isLocked = (fy, today) => iso(today) > `${fy}-10-31`;

// Save the working BAR into the list. A BAR saved before (bar.savedId) is updated unless it is frozen.
// Returns { list, entry, error }.
export function saveBar(list, bar, basis = null, now = Date.now()) {
  const i = list.findIndex((e) => e.id === bar.savedId);
  if (i >= 0) {
    if (isFrozen(list[i]))
      return { list, entry: list[i], error: `This BAR is ${list[i].status}, so its lines are frozen.` };
    const entry = { ...list[i], bar: { ...clone(bar), savedId: list[i].id }, basis, updatedAt: now };
    return { list: list.map((e, k) => (k === i ? entry : e)), entry };
  }
  const id = newId(now);
  const entry = {
    id,
    bar: { ...clone(bar), savedId: id },
    status: 'Built',
    log: [{ status: 'Built', date: iso(now), note: '' }],
    basis,
    createdAt: now,
    updatedAt: now,
  };
  return { list: [...list, entry], entry };
}

export function addStatus(entry, status, date, note = '', now = Date.now()) {
  if (!KNOWN.has(status)) throw new Error(`Unknown status "${status}".`);
  return {
    ...entry,
    status,
    log: [...entry.log, { status, date: date || iso(now), note: String(note || '') }],
    updatedAt: now,
  };
}

// Backup: profiles, saved BARs, drafts and settings only. Never reports, FTE files or keys.
export function exportBackup({ profiles, store, now = Date.now() }) {
  const schools = {};
  for (const [key, v] of Object.entries(store || {}))
    if (v && (v.bars?.length || v.bbDraft || v.bb))
      schools[key] = clone({ bars: v.bars || [], bbDraft: v.bbDraft || null, bb: v.bb || null });
  return {
    app: 'FACTS',
    version: BACKUP_VERSION,
    exportedAt: iso(now),
    profiles: clone(profiles || []),
    schools,
  };
}

// A saved BAR with the parts the screens read; anything else in a backup is ignored.
export const validEntry = (e) =>
  !!e &&
  typeof e.id === 'string' &&
  !!e.bar &&
  Array.isArray(e.bar.lines) &&
  Array.isArray(e.log) &&
  KNOWN.has(e.status);

export function checkBackup(data) {
  if (!data || data.app !== 'FACTS' || !data.schools || typeof data.schools !== 'object')
    return 'This is not a FACTS backup file.';
  if (data.version > BACKUP_VERSION) return 'This backup is from a newer version of FACTS.';
  return '';
}

// Compare saved BARs already here with those in a backup: added, identical, or conflicting (same id, different content).
export function planRestore(current, incoming) {
  const out = { added: [], same: [], conflicts: [] };
  for (const inc of incoming || []) {
    const cur = (current || []).find((e) => e.id === inc.id);
    if (!cur) out.added.push(inc);
    else if (JSON.stringify(cur) === JSON.stringify(inc)) out.same.push(inc);
    else out.conflicts.push({ id: inc.id, current: cur, incoming: inc });
  }
  return out;
}
