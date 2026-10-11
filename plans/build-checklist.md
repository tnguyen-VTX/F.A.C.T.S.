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
- [x] 2d. Accepted reports kept as parsed rows in IndexedDB (newest per school, year and kind restored on reload; loads older than 30 days pruned). Earlier loads can be listed and reused from the Load reports screen.
- [x] 2e. Tie-out of the Account Summary and Fund Audit, tested on the real pair in git-ignored fixtures (compares them to each other and to the Grand Total; no real totals in the repo). The v0.1 Gilbert workbook tie-out still needs fixtures/facts.xlsx.

## Milestone 3: BAR logic (pure first)

- [x] 3a. Deficit finder (function subtotal Available < 0, per selected fund).
- [x] 3b. Receiving-line allocation and donor split (`src/lib/barLogic.js`; nets to 0 or reports a shortfall). User decision: no object rule on Transfer and Maintenance, so any object may fund any other. On the real Cesar Chavez file 6 of 10 over-budget functions can be fully covered by other functions in the same fund (the rest have no function with enough room).
- [x] 3c. BAR model and validation rules (`src/lib/bar.js`): T, T on a flowthrough fund, I, IB, D, M. Tests include the user's accepted Maintenance BAR (made-up contact) and the spec's Increase example; on the real file the allocator's output passes validation when covered and is stopped when short.
- [x] 3d. FTE proportional calculation (`src/lib/fte.js`); salary objects are a profile setting (default 511). Formula is an assumption until checked against an accepted BAR; no screen to edit the setting yet.

## Milestone 4: BAR screens and output

- [x] 4a. Fund picker, New BAR by type, deficit list (`src/views/barBuilder.js`; the working BAR is kept as a draft in `S().bbDraft`).
- [x] First real OBMS upload (Gilbert, T): file, district 001 and location 707 imported fine; OBMS flagged `Missing projected FTE` (now a warning in the BAR Builder) and `Same Func Xfer` (not understood yet; see `context/obms-formats.md` rejection log).
- [x] OBMS series rule (`Same Func Xfer`): a Transfer between functions of one series (first digit) is rejected, the same move as a Maintenance BAR is accepted (Test M, and Test E in fund 24101). The builder takes Transfer donors only from other series (`kind: 'T'`), has a "Build a maintenance BAR" button for same-series donors (`kind: 'M'`), and `bar.js` stops a same-series Transfer in the 2000 series (warns for other series) and warns on a Maintenance across series. Untested: series other than 2000, Maintenance across series.
- [x] Upload file name in the accepted example's style, editable per BAR; short school name on the Schools screen.
- [x] Longer narrative templates (`src/lib/narrativeTemplates.js`): first template is Transfer (negative function), wording from the user. More templates are added as the user supplies wording.
- [x] Award cap: Increase, Initial Budget and Decrease BARs take an optional award amount; expenditure above it stops the file, less than it warns with the amount left.
- [x] 4b. OBMS-style view, justification template (`src/lib/justify.js`), validation panel. Checked in the browser.
- [x] 4c. Saved BARs with status log (`src/lib/barLog.js`; status names are OBMS's own action names (Uploaded - Staging Validated, Create Direct BAR, ... BS Approval - PED Approval), old names still load; frozen from the first OBMS step on; prior year locks after 10/31 with an unlock), drafts per school and year, backup export and restore with a per-BAR comparison. Checked in Chromium with the real Cesar Chavez files: 10 over-budget functions listed, a transfer built, draft and saved BAR survive a reload, no CSP problems. The file stayed blocked because that profile has no district/parent code (the check works); a real OBMS upload is still the only proof of the file.
- [x] 4d. CSV generator to spec v2.1.4 (`src/lib/barCsv.js`: UBH 15 fields, UBL 9 fields, CRLF, no BOM; never made while a check says stop). Tests: the accepted Maintenance BAR byte for byte (made-up contact), the PED spec's Increase example, and, with the real accepted file in git-ignored fixtures, the same lines apart from its padding commas. Still unproven until a real OBMS upload.
- [x] FTE for salary lines: a Line FTE box (the position's current FTE, typed once); FTE adj = amount / the line's budget x Line FTE (`suggestFte`), hand-typed FTE adj is kept. A Line FTE typed once is remembered per account (school and year, in the backup) and fills the FTE adj of later BARs on build and add line. A line with no budget uses its actuals + encumbrances as the base, and each salary line shows which base was used (or that none exists). Formula unconfirmed until an accepted BAR matches it (Title I example 2,073.00 gives 0.0400).
- [x] Narrative templates for every BAR type (`plans/narrative-templates.md`): Transfer negative/positive function, Maintenance, Increase/Initial Budget, Decrease; the list opens on the suggested Transfer template; a warning when the BAR's lines change after the narrative was filled.

## Journal Entry Maker (plan: `plans/journal-entry-maker.md`)

- [x] 1. `src/lib/je.js`: entry model, reclass and BAR lines, bank lines across funds, month-end dating, balance checks.
- [x] 2. `src/lib/reclass.js`: vendor charges (account code, then date), what is left, reclass choices to entries.
- [x] 3. `src/lib/barReport.js`: approved BAR report (Excel) reader with school, year and net-zero checks; tested on a made-up sheet and the real report.
- [x] 4. `src/lib/chartOfAccounts.js`: school chart reader and the "add in AptaFund" check. [ ] PED Chart Line Listing check (waiting for the file).
- [x] 5. Bank account setting on the school profile (pattern and per-fund override).
- [x] 6. `src/lib/jeLog.js`: saved entries with status and AptaFund number; charges already reclassed are not offered twice.
- [x] 7. Journal Entry Maker screen (reclass, entry for an approved BAR, saved entries, copy and Excel download); saved entries are in the backup.
- [ ] 8. Open: PED Chart Line Listing file; the suite page's new name; wording of same-fund reclass comments; a Chromium look.

## Milestone 5: later

- [x] Brand colors as tokens (Vertex Blue on primary buttons, focus, headings). [x] Logos and favicon: reversed wordmark on a Vertex Blue band, mountain icon favicon (checked in Chromium, light and dark, no outside requests). Repository is public; user accepted the logos in it.
- [-] Position/FTE slot dropped (no such export exists; FTE stays manual). [x] Second school: a 7-segment profile test with made-up data (location 3 digits, nothing from Gilbert).
- [-] AI narrative button: built, then removed at the user's request (needed personal API keys). [ ] Real OBMS test uploads.

- [x] Fund Audit with no budget amounts (Gilbert): tie-out compares actuals and encumbrances only and says so; Transactions hides Budget and Available.
- [x] PED school directory: `src/data/nm-schools.json` (from the user's export), search on the Schools screen fills district code and location IDs, BAR warning for other locations. Gilbert preset now has district 001, location 707.

## Hosting prep (ledgersandlearning.com)

- [x] Fonts self-hosted (DM Sans body, Red Hat Display headlines), Google Fonts removed.
- [x] Build-time Content-Security-Policy; relative base path; verified in a browser from a sub-folder with real files, no outside requests, no violations.
- [x] Site facts from the user: suite on facts.ledgerandlearning.com (shared origin), no sign-in yet, no site-wide scripts, site owner deploys. Done: BAR Builder-only build (`npm run build:bar`), storage names prefixed `barbuilder`. User decided: no sign-in and no separate subdomain. Still open: the final path (site owner).
- [x] A How to use screen (`src/views/help.js`, seven steps for business managers).
- [x] An About, privacy and limits page inside the app (`src/views/about.js`); contact for reporting problems: tim.nguyen@vertexeducation.com.
- [x] Stored data is versioned (`src/lib/migrate.js`, key `facts.dataVersion`); newer or unreadable data is never overwritten. Saved report records carry a version too and newer ones are skipped, not deleted.

