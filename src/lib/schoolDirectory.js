// Look-up in PED's school directory (src/data/nm-schools.json): district code and location ID.
// Pure; the data is passed in so tests can use made-up rows.
const norm = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
const OPEN = new Set(['OPEN', 'NEW', 'REOPENED']);

// Every word typed must appear in the district or location name. Open locations come first.
export function findSchools(dir, query, limit = 15) {
  const words = norm(query).split(' ').filter(Boolean);
  if (!words.length) return [];
  return dir
    .filter((e) => {
      const hay = `${norm(e.dn)} ${norm(e.ln)}`;
      return words.every((w) => hay.includes(w));
    })
    .sort(
      (a, b) =>
        Number(OPEN.has(b.st)) - Number(OPEN.has(a.st)) ||
        norm(a.ln).localeCompare(norm(b.ln)) ||
        a.li.localeCompare(b.li),
    )
    .slice(0, limit);
}

// What a chosen directory row tells us about a school profile.
export const entryToProfileFields = (e) => ({
  districtCode: e.dc,
  locationId: e.li,
  districtName: e.dn,
  locationName: e.ln,
});

// Add a location ID to a profile's list (no duplicates, kept sorted).
export const addLocationId = (ids, id) => [...new Set([...(ids || []), id])].sort();
