# Build checklist (plan approved 2026-10-09)

Source plans: `plans/report-import.md`, `plans/bar-csv-builder.md`. Rules and formats: `context/`.
Rule: one piece at a time, smallest first. Run `npm test` after each piece. Update `CLAUDE.md` when the architecture or domain notes change. Never commit real workbooks or exports.

Environment note: `cdn.sheetjs.com` is blocked in the cloud session, so `npm install` fails on `xlsx`. For local testing, deps are installed in the scratchpad (xlsx 0.18.5 from the npm registry) and symlinked as `node_modules`. `package.json` still pins SheetJS 0.20.3.

## Milestone 1: school profile

- [x] 1a. Profile model (pure): segments, code pattern, split, 3-digit upload location, validation. Tests with made-up codes.
- [x] 1b. Profile storage in `localStorage` (per profile id), a built-in Gilbert L. Sena preset, active-profile state.
- [x] 1c. Parsers take a profile (pattern and split) instead of the hard-coded 6-segment `ACCT_RE`; v0.1 results unchanged.
- [x] 1d. Settings screen: list, add, edit, delete profiles with live validation.
- [x] 1e. School picker in the shell (sidebar and import screen); the school name shows in the shell. The fiscal-year picker waits for the import slots (the year comes from the report).

## Milestone 2: report import

- [x] 2a. CSV reader and header-based column finder (pure, tested), with the "missing columns" error.
- [x] 2b. Account Summary slot (.xlsx), header-block read, school/year check.
- [x] 2c. Fund Audit slot (.csv), data checks.
- [x] 2d. Accepted reports kept as parsed rows in IndexedDB (newest per school, year and kind restored on reload; loads older than 30 days pruned). Not built yet: a screen to browse older loads, and as-of date labels beyond the load card.
- [x] 2e. Tie-out of the Account Summary and Fund Audit, tested on the real pair in git-ignored fixtures (compares them to each other and to the Grand Total; no real totals in the repo). The v0.1 Gilbert workbook tie-out still needs fixtures/facts.xlsx.

## Milestone 3: BAR logic (pure first)

- [ ] 3a. Deficit finder (function subtotal Available < 0, per selected fund).
- [ ] 3b. Receiving-line allocation and donor split (nets to exactly 0.00).
- [ ] 3c. BAR model and validation rules for T, T-flowthrough, I, D, M.
- [ ] 3d. FTE proportional calculation.

## Milestone 4: BAR screens and output

- [ ] 4a. Fund picker, New BAR by type, deficit list.
- [ ] 4b. OBMS-style view, justification template, validation panel.
- [ ] 4c. Saved BARs, status log, drafts per school, backup export/import.
- [ ] 4d. CSV generator to spec v2.1.4 (UBH 15 fields, UBL 9 fields), tests with made-up fixtures, including the Maintenance and Increase examples.

## Milestone 5: later

- [ ] Branding tokens, fonts and logos (needs logo files in the repo).
- [ ] Position/FTE slot. Second school (Cesar Chavez) profile test.
- [ ] AI narrative button. Real OBMS test uploads.
