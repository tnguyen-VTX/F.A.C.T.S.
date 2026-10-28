# FACTS web app

FACTS (Financial Analysis & Control Tracking System) is a web app for a business manager serving several
New Mexico charter schools. It replaces the Excel workbooks used to track fund budgets, spending, journal
entries, budget adjustment requests (BARs), requests for reimbursement (RfRs), cash receipts, and capital
outlay projects. Anything that varies by school (district/parent code, account code format, report layouts,
funds, contacts) belongs in a school profile, never in code. One school's data must never mix with another's.
The current fiscal year is FY2027 (7/1/2026 to 6/30/2027).

## Planning

When I ask to plan a feature, read PLANNING_PARTNER.md and follow it. Draft plans live in `plans/`.
Do not write code until I say "Plan approved."

## How it works today (v0.1)

Version 0.1 was built from the Gilbert L. Sena Charter High School workbook and assumes its 6-segment account
codes. Other schools (e.g. Cesar Chavez Community School, 7-segment codes) need school profiles before they work.

The user drops the FACTS workbook (.xlsx) into the page. Everything is parsed **in the browser** with
SheetJS; nothing is uploaded. The last workbook is cached in IndexedDB. User-entered data (JE list, BAR
settings and notes) lives in `localStorage` under `facts.v1`, keyed by fiscal cycle (e.g. `FY2027`).

The app reads only these five raw sheets. Every pivot, slicer, and formula in the workbook is rebuilt in code.

| Sheet | Source system export | Parser | Used by |
|---|---|---|---|
| Account Summary Report | Account Summary, subtotaled by Fund, Function | `parseASR` | Budget by fund, BAR Builder |
| Fund Audit Report | Fund audit / transaction detail (table `Fund`) | `parseFA` | Transactions, Journal entries |
| RfR Summary Report | RfR summary (table `Table3`) | `parseRfR` | Reimbursements |
| Cash Receipts Journal Report | Cash receipts journal (table `Table1`) | `parseCR` | Cash receipts, Reimbursements |
| Capital Outlay Projects | Hand-maintained | `parseCap` | Capital outlay |

### Workbook sheet to screen mapping

- **Account Summary Report** side panel (fund subtotals, % Expensed / % Planned / % Encumbrance) → `views/budget.js`
- **Fund Audit Detail** pivot + slicers (Fund, Function, Object, Job Class, Program, Name, Detail) → `views/transactions.js`
- **JE Worksheet** pivot (Job Class filter; Account > Detail > Date; manual "Reclass" notes) → `views/journal.js`
- **BAR Worksheet** (share of a fund's lines × BAR amount, `ROUND(...,0)`, Transfer vs Increase) → `views/bar.js`
- **RfR Tracker** (monthly COUNTIFS/SUMIF by PeriodDateTo; cash received per RfR fund, objects `4*`) → `views/reimbursements.js`
- **Cash Receipts Pivot Table** (Fund > TransactionDate, sum of CreditAmount) → `views/cashReceipts.js`
- **Capital Outlay Projects** → `views/capitalOutlay.js`

## Schools and profiles (added after v0.1)

Everything that varies by school lives in a profile (`src/lib/profile.js`), edited on the Schools screen. The active
school is chosen in the sidebar. User entries (`S()`) are keyed `<school id>/<cycle>`; v0.1 data keyed by cycle alone is
migrated to Gilbert on first read. The cached workbook is stored per school (`workbook:<id>` in IndexedDB), so switching
schools never shows another school's file. Parsers take a profile; with none they use the Gilbert 6-segment default.
The OBMS upload location is 3 digits (spec v2.1.4); each profile's `locationRule` says how to derive it and is marked
unconfirmed until checked against an accepted upload (the PED school directory, `src/data/nm-schools.json`, agrees for the two schools seen: location segment = district code + Location ID). The Schools screen can search that directory to fill the district code and PED location ID(s); a BAR line at another location gets a warning. See `plans/` and `context/` for the approved plans, OBMS formats and
business rules, and `plans/build-checklist.md` for build progress.

## Load reports (added after v0.1)

The Load reports screen takes the AptaFund Account Summary (.xlsx) and Fund Audit (.csv) one file at a time, for the
selected school and fiscal year. Each file is checked before it loads (`lib/reportCheck.js`): a wrong school or a layout
that does not fit the school's account code stops it; a wrong year, a short date range, a filtered report or a Fund Audit
that does not tie to the Account Summary (fund by fund) asks the user to confirm. Some Fund Audit exports (Gilbert's) have zero in every Budget row: then only actuals and encumbrances are tied out and the Transactions screen hides Budget and Available. The v0.1 whole-workbook import is still
available under "Or load the whole FACTS workbook". The Fund Audit CSV has no Src column, so Source is derived from the
Number prefix and Detail (`deriveSource` in `lib/parse.js`: Reg → PR payroll register, Inv → IN invoice, Rec → RF fee within
a cash receipt, `J/E:` → JE, otherwise EN encumbrance). Report cycle `FY26-27` and `FY2027` both mean fiscal year 2027.
Accepted reports are kept as parsed rows (not the original file) in IndexedDB under `rpt:<school>:<fy>:<kind>:<time>`; the newest
of each kind is restored on reload, and loads older than 30 days are pruned (`lib/reportStore.js`). The Load reports screen lists earlier loads (30 days) for the school and year, and "Use this load" makes one current.
Real exports go in `fixtures/` (git-ignored: `*.xlsx`, `*.csv`); tests that use them are skipped when absent.

## BAR logic (added after v0.1; screen: BAR Builder)

`barLogic.js` finds deficits (a function within a fund whose subtotal Available is negative) and builds a balanced transfer:
over-budget lines first, then donors from other functions of the same fund. OBMS rejects a Transfer between functions of one series (first digit; `Same Func Xfer`) but accepts the same move as a Maintenance BAR, so a Transfer takes donors from other series only (`kind: 'T'`) and "Build a maintenance BAR" takes same-series donors (`kind: 'M'`). There is no object rule on Transfer and
Maintenance BARs. A function never gives more than its Available. `bar.js` checks a BAR before download: balance by type,
code layout, one fund, never over budget, flowthrough fields, justification and contact limits. Amounts are whole dollars. Salary lines (profile `fteObjects`, default `511`) get a Line FTE box; the FTE adj is amount / the line's budget (or its actuals + encumbrances when it has no budget) x Line FTE (`suggestFte`), and a salary line with no FTE gets a warning because OBMS rejected them ("Missing projected FTE"). Saved BARs live in `S().bars` (school and year); a BAR is frozen once it reaches an OBMS status (Uploaded - Staging Validated or later; statuses use OBMS's own action names).
The backup file (profiles, saved BARs, drafts, settings only) restores with a per-BAR comparison; nothing is replaced silently.

## Journal Entry Maker (added after v0.1; screen: Journal Entry Maker)

Makes the debits and credits to key into AptaFund (nothing is sent anywhere); rules in `context/journal-entries.md`, plan in
`plans/journal-entry-maker.md`. It is its own suite page (`npm run build:jem`) and also a screen in the full app. Two kinds: **reclass of actuals** (filter the Fund Audit by any account code parts (each optional, matched by its start), a name/vendor dropdown and a detail text; a "Sum of actuals" table of what matches, grouped by two levels you choose (account code, date, month, fund, function, object, program, location, job class, detail, name) and sorted by name or amount (`summarize` in `reclass.js`); per account code type only the
segments that change, then amounts per charge; an entry per month and fund pair, dated the last day of the month; reclasses
between funds go through each fund's bank account, set on the Schools screen as a pattern with per-fund overrides) and **the Budget
entry for an approved BAR** (PED's approved BAR report as Excel; decrease = credit, increase = debit; dated the last signature).
Every code is checked against the school's AptaFund Chart Of Accounts report (loaded per school and year, kept in IndexedDB as
`chart:<school>:<fy>`); codes missing there are listed as strings to add in AptaFund. Codes are also checked against the PED Chart Line Listing (zip or CSVs, read as a stream and kept only for the funds the school uses, stored as `ped:<fy>`; no location in it; bank lines are skipped because the listing has object 11111, not 11011). Saved entries live in `S().jes` and the backup. Encumbrance entries are out of scope (AptaFund makes them).

## Hosting (ledgersandlearning.com)

The built app is static files for the ledgerandlearning.com suite (facts.ledgerandlearning.com). Decisions: no sign-in and no
separate subdomain, so the page is public and shares a browser origin with the site's other tools (storage names start with
`barbuilder`; nothing is stored on a server). It loads nothing from other hosts: fonts are in `src/fonts`, and `vite.config.js` adds a Content-Security-Policy to the
built page and builds with relative paths. See `context/hosting.md` and `DEPLOY.md`.

## Domain notes

- Account code format: `FFFFF-NNNN-OOOOO-PPPP-LLLLLL-JJJJ` = Fund-Function-Object-Program-Location-JobClass,
  e.g. `11000-1000-51100-1010-001707-1411`. `splitCode()` in `lib/format.js` splits it.
- Account Summary rows are account lines, `Subtotal of Element: [Function] ...`, `Subtotal of Element: [Fund] ...`,
  `Subtotal of Element: Expenditure`, and `Grand Total`. The sheet has **two** Grand Total rows with different
  encumbrance; the parser stops at the first. Fund totals come from the `[Fund]` subtotal rows.
- Available = Budget − Actual − Encumbrance. Negative available = over budget (shown red).
- Fund Audit `Src` codes: DE deductions, PO purchase orders, JO jobs, IN vouchers, JE journal entries, CR cash receipts.
- RfR status classification (`rfrState`): contains "disapproved" → disapproved; "paid" → paid; "approved" → approved;
  else in review. This intentionally differs from the workbook, whose formula only counted statuses starting with
  "RfR Approved" and would have put "DC RfR Approved" under In review.
- BAR rounding matches Excel `ROUND` (half away from zero, `roundAway`). Optional: rounding remainder goes on the
  largest line. The workbook's BARs cover a subset of lines (e.g. benefits, objects `52xxx`); the builder supports
  an object-prefix filter and per-line include checkboxes.
- Reimbursements "by fund" includes funds with RfRs plus grant/state capital funds (24000–27999, 31200, 31400)
  that have revenue receipts. This list mirrors the RfR Tracker's hand-typed fund list; consider making it configurable.
- Dates arrive as Excel serial numbers and are converted with `serialToISO` (UTC, no timezone drift).

## Layout

```
index.html            Vite entry
vite.config.js        Relative base path and the build-time Content-Security-Policy
src/main.js           App shell, navigation, event delegation (data-act = clicks, data-in = inputs), file loading
src/mode.js           Suite page builds: barOnly() is true for --mode bar-builder and --mode jem; pageTitle(), pageScreens()
src/state.js          D (parsed data), UI (view state), PF (school profiles), S()/saveStore (localStorage), loadBuffer()
src/lib/parse.js      Sheet parsers (pure; also run in Node tests). Account codes are read through a school profile
src/lib/profile.js    School profile model: segments, code pattern, 3-digit OBMS upload location rule, validation (pure)
src/lib/profileStore.js  Saves/loads profiles (localStorage key facts.profiles.v1); first run seeds the Gilbert preset
src/lib/csv.js        CSV reader (quoted fields, line breaks inside quotes)
src/lib/columns.js    Find report columns by header name (aliases, missing-column message)
src/lib/reportCheck.js  School/year/parameter checks and the Fund Audit vs Account Summary tie-out (pure)
src/lib/reportStore.js  Keys, pruning and records for parsed reports kept in IndexedDB (pure)
src/lib/importReport.js Reads a dropped .xlsx/.csv report for a school and runs the checks (pure)
src/lib/barLogic.js   Deficit finder, whole-dollar spreading, receiving lines and donor split for transfers (pure)
src/lib/bar.js        BAR model, totals and validation for T, M, I, IB, D (stop/warn checks before download) (pure)
src/lib/justify.js    Rule-based justification wording per BAR type (no commas, quotes or pipes; max 255) (pure)
src/lib/barCsv.js     OBMS BAR upload file (UBH 15 fields, UBL 9, CRLF) and its name (SCHOOL_-_OBMS_UPLOAD_-_FUND_FUNCTION_TYPE.csv, editable per BAR); none is made while a check says stop (pure)
src/lib/barLog.js     Saved BARs, status log, freeze/lock rules, backup export and restore planning (pure)
src/lib/narrativeTemplates.js  Longer-narrative wording for every BAR type (Transfer negative/positive function, Maintenance, separate Initial Budget and Increase, Decrease; same for all schools), the Transfer suggestion and the stale-text check (pure; never in the upload file)
src/lib/je.js         AptaFund journal entries: reclass of actuals (Type Actual, bank lines across funds, dated the last day of the charge's month) and Budget entries for approved BARs; balance checks (pure)
src/lib/reclass.js    Vendor charges grouped by account code then date, what is left to reclass, reclass choices to entries (pure)
src/lib/barReport.js  Reads PED's approved Budget Adjustment Request Report (.xlsx): lines, Doc ID, signature dates, checks (pure)
src/lib/chartOfAccounts.js  The school's AptaFund Chart Of Accounts report and the "add this string in AptaFund" check (pure)
src/lib/pedListing.js  PED Chart Line Listing stream parser (kept per fund as func|obj|prog|job) and the allowed-string check (pure)
src/lib/pedZip.js     Reads the listing from a CSV or zip byte stream, a piece at a time (fflate)
src/lib/jeLog.js      Saved journal entries, status log (Prepared, Entered in AptaFund, Posted, Cancelled), what is already reclassed (pure)
src/lib/fte.js        FTE change for salary lines (proportional to dollars; assumption to confirm) (pure)
src/lib/format.js     Formatting, math, and account-code helpers
src/lib/idb.js        IndexedDB cache for the last workbook
src/views/*.js        One module per screen (help.js = How to use, about.js = About and privacy) (barBuilder.js = BAR Builder: fund picker, deficits, OBMS-style view, download); each renders HTML strings into #main (schools.js = profile editor, import.js = Load reports)
src/styles.css        Design tokens (light/dark), DM Sans and Red Hat Display (src/fonts), layout
test/                 Vitest: parser checks against real totals + jsdom smoke test of every screen
fixtures/             Put facts.xlsx here to run the data tests (git-ignored)
```

Views render HTML strings. Always pass user or workbook text through `esc()`. Events use delegation: add a
handler to `ACT` (clicks on `[data-act]`) or `IN` (inputs on `[data-in]`) in `main.js`.

## Commands

- `npm install`, `npm run dev`, `npm run build`, `npm test`
- `npm run build:bar` / `npm run dev:bar`: BAR Builder-only build (`src/mode.js`; five screens, no FACTS header) for the ledgerandlearning.com suite page. Browser storage names start with `barbuilder`.
- `npm run build:jem` / `npm run dev:jem`: the Journal Entry Maker as its own suite page (`--mode jem`: Load reports, Journal Entry Maker, Schools, How to use, About). It shares the browser storage (profiles, stored reports) with the BAR Builder page.
- Data tests are skipped unless `fixtures/facts.xlsx` exists. `EXPECTED` in `test/parse.test.js` holds totals
  from the 9/29/2026 workbook; update them when the fixture changes.

## Rules

- Never commit real workbooks or exports. They contain employee names and payroll.
- Keep parsing client-side unless the user decides otherwise; if a backend is added, treat payroll data as sensitive.
- Verify numbers against the workbook's pivots before changing any calculation.

## Open questions / likely next steps

1. Data source: keep importing the whole workbook, or import each raw export (Account Summary, Fund Audit,
   RfR Summary, Cash Receipts) directly so the workbook is no longer needed?
2. Single user vs. business-office team: if shared, JE list, BAR notes, and capital outlay entries need a
   shared store with auth instead of localStorage.
3. Capital outlay projects are read-only from the sheet; they should become editable in the app.
4. The JE Worksheet and BAR Worksheet in the workbook hold hand-typed notes ("Posted 09/15/2026",
   "Submitted 09/09/2026") that are not imported yet.
5. Possible move to TypeScript and a component framework once the data model settles.
