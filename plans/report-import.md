# Report Import (direct AptaFund uploads) — Plan

**Status:** Draft, not approved. Build only after the user says "Plan approved."
**Goes first.** The BAR Builder (`plans/bar-csv-builder.md`) depends on it.
**Source of truth:** this file and the approved planning interview. Branding details are in `context/style.md`.

## 1. The Why

v0.1 needs the whole FACTS workbook, which is rebuilt by hand and only works for one school's layout. The business manager wants to drop the raw AptaFund reports directly, for any school, and stop depending on the workbook.

## 2. The What

Separate drop slots, one per report. Each slot accepts .xlsx or .csv. PDF is deferred.

| Slot | Usual format | Used by |
|---|---|---|
| Account Summary | .xlsx | Budget by fund, BAR Builder |
| Fund Audit | .csv | Transactions, Journal entries, BAR Builder |
| Position/FTE | .csv or .xlsx | BAR Builder (FTE only) |
| RfR Summary | .csv | Reimbursements (later) |
| Cash Receipts | .csv | Cash receipts, Reimbursements (later) |

Account Summary and Fund Audit are a bundle for the BAR Builder. RfR and Cash Receipts are independent. Build the first two slots first.

## 3. Across schools

- User picks the school and fiscal year first. A file is loaded into that school's slot only.
- Everything school-specific comes from the school profile: account code segments and pattern, fund list, accounting system (AptaFund for now).
- Profile is created by a short wizard that learns the code layout from a dropped Account Summary and asks the user to confirm.

## 4. The Data

- Parse in the browser (SheetJS for .xlsx, a CSV parser for .csv). Nothing is uploaded.
- Find columns by header name. If a required column is missing, nothing loads; the message lists the missing columns and the columns found. Never guess a column.
- Reports can be run for any date range or account expression. Each load records its own parameters and as-of date: from the .xlsx header block, or inferred from the data for .csv and marked "inferred".
- Store parsed rows only, in IndexedDB. Drop the original file. Keep per load: file name, as-of date, parameters, checksum, school, fiscal year. Remove loads older than about 30 days, oldest first, and warn when browser storage runs low.
- Position/FTE data holds employee names and salaries. Do not keep it beyond the current load unless the user decides otherwise. Never commit it.

## 5. Accuracy and tie-out

- Account Summary and Fund Audit totals must tie to the v0.1 workbook totals for Gilbert L. Sena (the `EXPECTED` values in `test/parse.test.js`).
- Fund Audit actuals per fund tie to Account Summary actuals.
- A second school (Cesar Chavez, 7-segment codes) is the proof that profiles replace code changes.
- The parser reads two Grand Total rows in the Account Summary; fund totals come from the `[Fund]` subtotal rows (see `CLAUDE.md`).

## 6. Rules vs. AI

All fixed rules. No AI.

## 7. Experience

Slots show the file name, as-of date, range, and any warnings. A banner names the school and fiscal year. Dropping a file never replaces another school's data.

## 8. Risks and controls

- Wrong school: hard stop when the .xlsx header names a different school.
- Wrong year or other mismatch: warn, offer "load anyway".
- .csv has no header: check that account codes match the profile pattern, funds are on the profile's fund list, and dates fall in the fiscal year. This is weaker than a header check; say so on screen.
- Partial report (filtered range or account expression): warn, and label anything built from it with the range.
- Newer report while a BAR draft exists: see the BAR Builder plan.
- Missing or renamed columns: stop and name them.

## 9. The Proof

Parser unit tests (pure, run in Node) for each slot, plus the existing jsdom smoke test. Data tests stay skipped unless `fixtures/facts.xlsx` exists. Add made-up fixtures with round numbers for the CSV slots.

## 10. Rollout

Gilbert first (known baseline), then Cesar Chavez. Keep v0.1 workbook import working until the new slots tie out.

## 11. Explaining it

Problem: the workbook is a manual middleman that only works for one layout. Solution: drop the raw AptaFund reports, pick the school, and FACTS checks them against the school profile. Impact: no workbook upkeep, and a new school means a new profile instead of new code.

## What the real AptaFund exports look like (checked 10/9/2026, structure only)

- Account Summary .xlsx: school name, title, a parameter row (`Cycle: FY26-27; Begin Date; End Date; Account Type: Expenditure; Account Expression; Include Unposted Transactions; Budget Category; Created On`), then `Account Code, Description, Actual (Date Range), Budget (YTD), Actual (YTD), Encumbrance (YTD), Available (YTD), % of Budget`. Account Type is Expenditure only.
- Fund Audit .csv: `Fund, Account Code, Acct. Desc., Transaction Date, Name, Number, Description, Detail, Check, Budget, Actuals, Encumbrance, Available`. No header block, no Src, no transaction number. Quoted fields can hold line breaks. Dates are M/D/YYYY text; amounts plain decimals.
- The two tie exactly, fund by fund; this is the check that stands in for the header the CSV lacks.

## Open questions

1. Exact AptaFund header block layout for each .xlsx report (school, fiscal year, parameters). Need a sample with made-up names.
2. Column names for the Fund Audit, RfR and Cash Receipts .csv exports.
3. Position/FTE report: name, layout, and whether it may be kept after the load.
4. Backup reminder cadence (see the BAR Builder plan).

## Milestones

1. School profile model and Settings screen; move Gilbert's hard-coded 6-segment rules into a profile.
2. Slot-based import for Account Summary and Fund Audit with school/year checks and one-month history, tied to v0.1 totals.
3. Remaining slots (RfR, Cash Receipts) when their screens are rebuilt.
4. Position/FTE slot.
5. Second school's profile and sample test.
