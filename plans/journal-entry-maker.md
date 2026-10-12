# Journal Entry Maker (JEM)

Status: plan approved 10/11/2026; building. Context: `context/journal-entries.md`.

**Problem.** Where the BAR Builder adjusts budget, journal entries (JEs) in AptaFund adjust the books. Today the business manager keys two kinds into AptaFund by hand: (1) reclasses of Actuals, decided in an Excel pivot (filter a Name/Vendor, see every account code charged, mark where each amount should go, typed notes "Reclass to 11000-2600"); (2) a Budget JE for each approved BAR, typed from the BAR printout. Hand keying risks wrong account codes, unbalanced entries, wrong months, and doing a reclass twice.

**Who / where.** The business manager (and a backup manager), as a new tool on the suite page beside the BAR Builder (same loaded Account Summary and Fund Audit, school profiles, saved items). The suite's page name must become more general than "BAR Builder" (name to confirm). The existing v0.1 "Journal entries" screen (pivot, flags) stays in the full app.

**Scope.** Two JE types only. Encumbrance JEs are out (AptaFund makes them automatically).

**1. Actual JE (reclass).**
- Pick a Name/Vendor (Fund Audit `Name` column). FACTS lists every expenditure line charged under it, grouped by account code, then by transaction date (same shape as the pivot).
- For each line the user enters how much of the actual to move and where. The new code is the old code with only the named segments changed (fund, function, object, program, job class, location, any combination); unnamed segments are copied.
- Same-fund reclass: credit the old expense account, debit the new one. Different-fund reclass: each fund balances through its own bank account line (AptaFund example: 27901 expense credit, 11000 expense debit, 27901 bank debit, 11000 bank credit; line sequence 1 old expense, 2 new expense, 3 old fund bank, 4 new fund bank).
- Transaction date = the last day of the month of the original charge (so the JE is always in the same month). A JE holds one reclass target per month, covering all of that account code's charges in that month.
- Comment: "To reclass expenditures from [old fund] to [new fund]" (wording to confirm for same-fund reclasses).
- The bank account code is not hard-coded: the school profile holds a default bank account pattern with an optional per-fund override (it varies by school and fund).

**2. Budget JE (approved BAR).**
- Source: the approved BAR report in Excel (PED's "Budget Adjustment Request Report", `.xlsx`; cells hold Doc ID, fiscal year, entity, fund, adjustment type, and one row per line with fund, function, object, program, location, job class, present budget, adj amount (text like `$(17,800.00)`), adj budget, FTE, plus the signature dates). PDF is not used (no PDF library). A saved FACTS BAR may be added later.
- Lines: decrease = credit, increase = debit, in the BAR's own line order, with the account description. Account code = fund-function-object-program-location-job class in the school's layout. No bank line. Debits must equal credits; the BAR's DOC. TOTAL must be $0.00.
- Type = Budget. Comment = "BAR [Doc ID] Fund [fund] [Transfer / Increase / ...]". Transaction date = the PED approval date, the last signature date on the report (10/7/2026 in the example); editable.
- Checks: school and fiscal year match the selected school (entity name, location in the code), Doc ID not already saved, every line's account exists in the chart.

**3. Chart checks (both JE types).** Every account code in a JE is checked two ways: (a) against the PED Chart Line Listing (allowed UCOA strings; the user will upload the file, layout not yet seen, kept in the browser like a report), and (b) against the school's AptaFund Chart of Accounts report (`Chart_Of_Accounts_Report.XLSX`, columns Account Code, Description, Account Type Name, Enabled, Active, Account Group Type, Cycle Name, one row per code per fiscal year, about 27,000 rows for Gilbert). A code allowed by PED but missing from the school's chart (or not Enabled for the cycle) is flagged "add this account string in AptaFund first" and listed in one place. A code not allowed by PED is a stop.

**4. Output.** On screen, each JE as a table in AptaFund's layout (Sequence, Account Code, Description, Comment, Debit, Credit, per-fund subtotals and a JE total), a copy button per line and per JE, and an Excel download of the same layout. Names and payroll detail never appear in the JE output (account codes, amounts and the standard comment only).

**5. Saved JEs with status (like saved BARs).** Each JE saved per school and fiscal year with a status (Prepared, Entered in AptaFund, Posted), the AptaFund JE number (e.g. `T0048623`, `00047858`) and date typed by the user; frozen once Entered or later; included in the backup file with the same restore comparison. Charges already reclassed are marked on the vendor view so they are not reclassed twice; the remaining actual on a line is what is still available to reclass (shown, never allowed to exceed what the Fund Audit shows).

**What varies by school (profile).** Bank account pattern and per-fund overrides; account code layout (already); the chart files (loaded per school and year, never shared between schools); location rule (already).

**Data.** Account Summary and Fund Audit (already loaded; the CSV has a `Name` column and `Number`/`Detail`), Chart of Accounts report (new, per school and year), PED Chart Line Listing (new, statewide, per year), approved BAR Excel (new, per BAR). All parsed in the browser; nothing uploaded. Chart files are large (about 30,000 rows): keep them in IndexedDB as parsed records like the reports, versioned.

**Fixed rules, not AI.** All of it. A person reviews each entry before keying it into AptaFund.

**Risks and controls.** Wrong school or year (checked as with reports); a JE that does not balance or a fund that does not net to zero (stop); reclass amount larger than the remaining actual (stop); a date outside the month of the charge (stop); code not in PED listing (stop) or not in the school's chart (warning that lists the strings to add); duplicate BAR Doc ID (warning); payroll detail kept out of outputs and out of tests (made-up names and round numbers only); the posting period may be closed in AptaFund (FACTS cannot know; a note on the screen).

**Proof.** The two real AptaFund examples become tests with made-up amounts matching their shape: the cross-fund reclass (4 lines, both funds net to zero) and the 16-line BAR JE ($22,750.00 debits = credits, decreases as credits, sequence order kept). Tests: segment-change building (fund only, object only, combinations), same-fund vs cross-fund lines, month-end dating (including leap-year February and year end), grouping by account then date, chart parsing (Enabled/Active, cycle filter, wrong school), PED listing check, BAR Excel parsing (text amounts with `$(...)`, signature date from Excel serial), status/freeze, backup round trip, a jsdom screen test, and a real-file check when the fixtures are present (git-ignored).

**Build steps (smallest first, tests after each, after "Plan approved").**
1. Pure `src/lib/je.js`: JE model, debit/credit rules, balance and per-fund net checks, month-end dating, comment wording.
2. `src/lib/reclass.js`: apply segment changes to a code, group Fund Audit lines by Name > account code > date, remaining-to-reclass.
3. `src/lib/barReportXlsx.js`: read the approved BAR Excel into BAR lines, Doc ID, signature dates, with tie-out checks.
4. `src/lib/chartOfAccounts.js` (+ store): parse the school's chart report and the PED Chart Line Listing (layout when supplied); `checkAccounts()`.
5. Profile fields for bank account pattern and per-fund overrides (`src/lib/profile.js`, Schools screen).
6. Saved JEs and status log (`src/lib/jeLog.js`, reuse the `barLog.js` freeze/backup patterns).
7. Screen `src/views/jem.js`: vendor view, reclass entry, BAR JE from Excel, review tables, copy, Excel download; nav entry in the suite build (`src/mode.js`); suite page naming.
8. Docs: `CLAUDE.md`, `plans/build-checklist.md`, How to use, About; Chromium check.

**Still open before building.** The PED Chart Line Listing file (to be uploaded; layout unknown); the suite page's new name; comment wording for same-fund reclasses; how AptaFund shows the JE number format.

**How to explain it.** Problem: journal entries are keyed by hand from screenshots and printouts, so a wrong string, an unbalanced entry or a wrong month costs time and audit risk. Solution: choose the vendor and what to change, and FACTS builds balanced debits and credits for the right month, checks every account against the PED listing and the school's chart, and keeps a log. Impact: fewer AptaFund corrections, a clear audit trail for every reclass and BAR, and the same method for every school.
