import { $, esc } from '../lib/format.js';
import {
  SEGMENT_KEYS,
  SEGMENT_LABELS,
  UPLOAD_LOCATION_LEN,
  fundLines,
  newProfile,
  uploadLocation,
  validateProfile,
} from '../lib/profile.js';
import { addLocationId, entryToProfileFields, findSchools } from '../lib/schoolDirectory.js';
import { makeProfileId } from '../lib/profileStore.js';
import { PF, UI } from '../state.js';

// PED's directory loads only when someone searches it.
let DIR = null;
const dirData = async () => (DIR ??= (await import('../data/nm-schools.json')).default);
export async function scDirSearch(q) {
  const el = $('#scdir');
  if (!el) return;
  const found = findSchools(await dirData(), q);
  if (UI.sc) UI.sc.dirFound = found;
  el.innerHTML = !String(q).trim()
    ? ''
    : found.length
      ? `<ul class="plain">${found
          .map(
            (e, i) =>
              `<li>${esc(e.ln)} (${esc(e.dn)}) · district code <b>${esc(e.dc)}</b> · location <b>${esc(e.li)}</b>${e.st === 'OPEN' ? '' : ` · ${esc(e.st.toLowerCase())}`} <button class="btn" data-act="scDirPick" data-i="${i}">Use this</button></li>`,
          )
          .join('')}</ul>`
      : '<p class="muted">No match in the PED directory.</p>';
}
export function scDirPick(i) {
  const e = UI.sc?.dirFound?.[i];
  if (!e) return;
  const f = entryToProfileFields(e);
  const d = UI.sc.draft;
  d.districtCode = f.districtCode;
  d.locationIds = addLocationId(d.locationIds, f.locationId);
  if (!d.name) d.name = f.locationName;
  UI.sc.dirFound = [];
  scForm();
}

const EXTRA = 'tail';
const clone = (o) => JSON.parse(JSON.stringify(o));

// Open the form for a saved school (id) or a new one (no id).
export function scOpen(id) {
  const base = id ? clone(PF.profiles[id]) : newProfile({ name: '' });
  UI.sc = {
    isNew: !id,
    draft: base,
    fundsText: fundLines(base.funds),
    priorityText: base.donorPriority.join(', '),
    errors: [],
  };
}
export function scDraftErrors() {
  const d = UI.sc?.draft;
  if (!d) return [];
  const probe = { ...d, id: d.id || makeProfileId(d.name, PF.profiles) };
  return validateProfile(probe);
}
const seg = (d, k) => d.segments.find((s) => s.key === k);
const field = (label, inner, hint = '') =>
  `<label class="fld"><span>${label}</span>${inner}${hint ? `<span class="muted hint">${hint}</span>` : ''}</label>`;

export function viewSchools() {
  const main = $('#main');
  const rows = Object.values(PF.profiles)
    .map(
      (
        p,
      ) => `<tr><td><b>${esc(p.name)}</b>${p.id === PF.active ? ' <span class="muted">(in use)</span>' : ''}<br><span class="muted">${esc(p.entityName)}</span></td>
    <td class="num">${esc(p.districtCode || '—')}</td><td class="num">${p.segments.length} segments</td>
    <td class="r"><button class="btn" data-act="scUse" data-id="${esc(p.id)}"${p.id === PF.active ? ' disabled' : ''}>Use</button>
    <button class="btn" data-act="scEdit" data-id="${esc(p.id)}">Edit</button>
    <button class="btn" data-act="scDelete" data-id="${esc(p.id)}">Delete</button></td></tr>`,
    )
    .join('');
  main.innerHTML = `<header class="ph"><h1>Schools</h1><p class="sub">Everything that differs by school lives here: district code, account code layout, how the 3-digit upload location is taken, funds, donor order. Each school's reports, journal entries and BARs are kept apart in this browser.</p></header>
  <section class="panel"><div class="scroll"><table class="t"><thead><tr><th>School</th><th>District code</th><th>Account code</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="toolbar" style="margin-top:12px"><button class="btn" data-act="scNew">Add a school</button></div></section>
  <div id="scform"></div>`;
  scForm();
}
export function scForm() {
  const el = $('#scform');
  if (!el) return;
  const sc = UI.sc;
  if (!sc) {
    el.innerHTML = '';
    return;
  }
  const d = sc.draft;
  const extra = seg(d, EXTRA);
  const r = d.locationRule;
  const loc = seg(d, 'loc');
  const sample = loc ? '0'.repeat(Math.max(0, loc.len - 3)) + '707' : '';
  el.innerHTML = `<section class="panel"><h2>${sc.isNew ? 'New school' : 'Edit ' + esc(d.name || 'school')}</h2>
  <div class="fld"><label><span>Find your school in the PED directory</span><input type="text" data-in="scDirQ" placeholder="Start typing the school's name"></label>
  <span class="muted hint">Fills the district/parent code and location ID. You can still edit them.</span><div id="scdir"></div></div>
  <div class="grid2">
  ${field('School name', `<input type="text" data-in="sc" data-k="name" value="${esc(d.name)}">`)}
  ${field('Entity name in OBMS', `<input type="text" data-in="sc" data-k="entityName" value="${esc(d.entityName)}">`, 'As the OBMS BAR screen shows it.')}
  ${field('Names as reports print them', `<textarea rows="2" data-in="scNames" placeholder="One per line, if reports spell the school differently">${esc((d.reportNames || []).join('\n'))}</textarea>`, 'Reports are checked against this school name and the OBMS entity name too.')}
  ${field('District / parent code', `<input type="text" inputmode="numeric" size="5" data-in="sc" data-k="districtCode" value="${esc(d.districtCode)}">`, 'The code PED uses in the BAR upload header.')}
  ${field('Short name for file names', `<input type="text" size="8" maxlength="12" data-in="sc" data-k="abbrev" value="${esc(d.abbrev || '')}">`, "Starts the upload file name, for example GSC. Empty uses the school name's initials.")}
  ${field('PED location ID(s)', `<input type="text" data-in="scLocIds" size="12" value="${esc((d.locationIds || []).join(', '))}">`, '3 digits each, separated by commas. A BAR line at any other location gets a warning.')}
  </div>
  <h3>Bank account for journal entries</h3>
  <p class="muted">A reclass between funds goes through each fund's bank account. Leave the pattern empty to use the fund, function 0000, object 11011 and zeros in the other segments. {fund} stands for the fund code.</p>
  <div class="grid2">
  ${field('Bank account pattern', `<input type="text" size="34" data-in="scBank" value="${esc(d.bankAccount?.pattern || '')}" placeholder="{fund}-0000-11011-0000-000000-0000">`)}
  ${field(
    'Bank account for particular funds',
    `<textarea rows="2" data-in="scBankFunds" placeholder="One per line: fund code, then the full account code">${esc(
      Object.entries(d.bankAccount?.byFund || {})
        .map(([f, c]) => `${f}, ${c}`)
        .join('\n'),
    )}</textarea>`,
    'Only for funds that do not follow the pattern.',
  )}
  </div>
  <h3>Account code segments</h3>
  <p class="muted">Digits in each segment, in order. The code looks like ${d.segments.map((s) => '9'.repeat(Math.min(s.len, 12))).join('-')}.</p>
  <div class="filters">${SEGMENT_KEYS.map((k) => `<label>${SEGMENT_LABELS[k]}<input type="number" min="1" max="12" size="3" data-in="scSeg" data-k="${k}" value="${seg(d, k)?.len ?? ''}"></label>`).join('')}
  <label>Extra trailing segment<input type="number" min="0" max="12" data-in="scSeg" data-k="${EXTRA}" value="${extra ? extra.len : 0}"></label></div>
  <h3>Upload location</h3>
  <p class="muted">The OBMS upload takes a ${UPLOAD_LOCATION_LEN}-digit location. Set how it comes from the account code's location segment.</p>
  <div class="filters"><label>Rule<select data-in="scLoc" data-k="type"><option value="lastN"${r.type === 'lastN' ? ' selected' : ''}>Keep the last digits</option><option value="full"${r.type === 'full' ? ' selected' : ''}>Use the segment as is</option></select></label>
  <label>Digits<input type="number" min="1" max="${UPLOAD_LOCATION_LEN}" data-in="scLoc" data-k="n" value="${r.n ?? UPLOAD_LOCATION_LEN}"${r.type === 'full' ? ' disabled' : ''}></label>
  <label class="chk"><input type="checkbox" data-in="scLoc" data-k="confirmed"${r.confirmed ? ' checked' : ''}> Checked against an accepted OBMS upload</label></div>
  <p class="muted">Example: location <span class="code">${esc(sample)}</span> becomes <span class="code">${esc(uploadLocation(d, sample) || '(not valid)')}</span>.${r.confirmed ? '' : ' This rule is not yet confirmed.'}</p>
  <h3>Funds</h3>
  <label class="fld"><span>One per line: code, name, then F for flowthrough and R for reimbursable</span><textarea rows="6" data-in="scFunds" placeholder="24101, Title I Part A, F">${esc(sc.fundsText)}</textarea></label>
  <h3>BAR defaults</h3>
  <div class="grid2">${field('Donor function order', `<input type="text" data-in="scPriority" value="${esc(sc.priorityText)}" placeholder="2600, 2100, 1000">`, 'Functions to take from first, separated by commas.')}
  ${field('Cushion added to each deficit', `<input type="number" min="0" data-in="sc" data-k="cushion" value="${d.defaultCushion.value || 0}">`, 'Dollars. You can change it on each BAR.')}</div>
  <div id="scerr">${scErrors()}</div>
  <div class="toolbar"><button class="btn" data-act="scSave">Save school</button><button class="btn" data-act="scCancel">Cancel</button></div></section>`;
}
export function scErrors() {
  const errs = scDraftErrors();
  return errs.length
    ? `<div class="warn"><b>To fix before saving:</b><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
    : '<p class="muted">Looks good.</p>';
}
