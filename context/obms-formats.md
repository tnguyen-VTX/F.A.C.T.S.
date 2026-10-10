# OBMS upload formats

**Source:** NM PED, *Operating Budget Management System: Import & Export File Specifications*, version 2.1.4 (1/17/2024). Section 3.4 "BAR Imports" starts on PDF page 30; BAR CSV records are §3.4.3 (Tables 27a-29b, PDF pages 36-42). The BAR section was revised in 2.1.4 to correct many mistakes, so use this version. Read the PDF for anything not summarized here.

The spec's field descriptions contain typos (contact first, middle and last labels are mixed up). Trust the position tables.

## File structure

- One header record (`UBH`) followed by one or more line records (`UBL`).
- Records are variable length, comma separated, each ending CR LF.
- If an optional field is not included, the commas must remain with nothing between them.
- No BOM. Build the CSV string directly; do not rely on Excel's Save As CSV.

## UBH header, 15 fields (Table 27a)

| # | Field | Notes |
|---|---|---|
| 1 | Status code | `UBH` |
| 2 | District or Parent Code | digits |
| 3 | Budget Year | 4-digit **end** year (FY2027 → `2027`) |
| 4 | Chart Fund Code | 5 digits |
| 5 | BAR Type | `IB` initial budget, `T` transfer, `M` maintenance, `I` increase, `D` decrease |
| 6-8 | Contact first, middle, last | optional, up to 20 characters each |
| 9 | Budget From Date | flowthrough only, `mm/dd/yyyy` |
| 10 | Budget To Date | flowthrough only, `mm/dd/yyyy` |
| 11 | Flowthrough Change Scope | flowthrough only, `Y` or `N` |
| 12 | Flowthrough Approved Carryover | flowthrough only, digits and `$ , .` |
| 13 | Flowthrough Current Year Allocation | flowthrough only |
| 14 | Flowthrough Total Approved Budget | flowthrough only |
| 15 | Justification | up to 255 characters |

Negative values cannot be reported in the flowthrough fields. For a non-flowthrough fund leave fields 9-14 empty (the spec's example fills the dates and says they are ignored).

Justification: no pipes `|` and no quotation marks. The spec says "alpha characters" without defining punctuation. Our rule: also no commas (they would split the field, and quotes are forbidden). Confirm with a real upload.

## UBL line, 9 fields (Table 27b)

`UBL`, Fund (5), Function (4), Object (5), Program (4), **Entity Location Code (3 digits)**, Job Class (4), Adjustment Amount (up to 14), Adjustment FTEs (up to 9).

- Amount: digits and `- $ , .`. Whole dollars (`2350`) and decimals (`123456789.00`) are both shown as acceptable; commas only if the field is in double quotes. May be negative.
- FTE: digits and `- , .`. May be negative.
- Location is 3 digits in the file. How a school's longer location (for example Gilbert's 001707 on screen) maps to 3 digits is a per-school rule in the profile.

## Examples from the spec (Tables 28b-29b), Increase BAR

```
UBH,040,2022,21000,I,Jamie,,Shepperd,7/1/2021,6/30/2022,,,,,Test BAR with Locations
UBL,21000,0000,41604,0000,000,0000,2350,0
UBL,21000,3100,56116,0000,033,0000,800,0
UBL,21000,3100,56116,0000,034,0000,900,0
UBL,21000,3100,56116,0000,036,0000,650,0
```

Revenue line: function `0000`, revenue object (`4xxxx`), program `0000`, location `000`, job class `0000`. Revenue (2,350) equals the expenditure lines (800 + 900 + 650).

## User-supplied example (believed accepted; not confirmed)

A Maintenance BAR, fund 11000, function 1000, district 1, year 2019, six lines netting to 0, location `028`. Bytes: no BOM, CRLF. Every record, including each UBL, is padded to 15 fields (`UBL,11000,1000,51100,4010,028,1416,-8075,0,,,,,,`). The spec defines a UBL as 9 fields, so this is probably Excel padding. Whether OBMS accepts the padded form is unproven. The builder follows the spec. The header contains a real person's name; fixtures must use a made-up name.

## Attachments

OBMS lets the user attach .doc, .txt or .pdf files to a BAR upload (50 MB each, 300 MB with the BAR file). Not a v1 feature.

## Still unknown

- Whether OBMS rejects padded UBL lines.
- Rounding or plug rules, and whether zero-dollar lines are ever kept (our draft omits them).
- Meaning and validation of flowthrough fields 9-14 beyond the table above (for example how Total Approved Budget relates to Carryover plus Allocation).
- A rejected upload with OBMS's error message, as a negative test.
- Each school's location rule (3-digit derivation).

## District code and location (corroborated 10/10/2026)

PED's school directory export (`New_Mexico_Schools.xlsx`, a list of 867 locations; the trimmed copy is `src/data/nm-schools.json`, rebuilt with `scripts/make-school-directory.mjs`) gives each school a 3-digit **District Code** and a 3-digit **Location ID**. Both schools seen so far carry them in their account codes: the location segment is district code + location ID (`512001` for Cesar Chavez Community School, `001707` for Gilbert L. Sena Charter HS). So the UBH District or Parent Code is the 3-digit district code, and the upload location is the last 3 digits of the segment. Still marked unconfirmed in each profile until an accepted OBMS upload.

## Upload file name

Default: `<school short name>_-_OBMS_UPLOAD_-_<fund>[_<function>]_<type>.csv`, as in the accepted example (`CIS_-_OBMS_UPLOAD_-_11000_2000_M.csv`). The function code appears only when every expenditure line is in one function. The user can type any other name on the BAR; it is cleaned (no characters Windows forbids, spaces to underscores, `.csv` added). The file name is not part of the OBMS spec; OBMS reads the contents.

## OBMS rejection log

**10/10/2026, Gilbert L. Sena Charter HS, BAR type T, fund 11000, FY2027, 43 lines (first real upload from FACTS).**
- Accepted by the importer ("Import File" step OK, 43 lines): 15-field header, 9-field lines, CRLF, district code `001`, 3-digit location `707` (last 3 digits of the 6-digit segment `001707`), whole-dollar amounts, a file name with spaces and dashes, a justification with no comma, quote or pipe. No balance error (function 2500 -185,585, function 2100 +185,585).
- Validation errors on 3 lines:
  - `Same Func Xfer` (1; no account line named). The BAR moves money between two different functions (2500 to 2100). The user says cross-function Transfers normally upload fine, so the trigger is not understood. Not defined in the OBMS spec v2.1.4. Open guesses: OBMS groups functions by series (both are 2000-series), or something about this file's lines. Plan: upload two small test files and bisect.
  - `Missing projected FTE` on `11000-2100-51100-0000-707-1211` and `11000-2100-51100-0000-707-1214` (job classes 1211 and 1214, FTE 0 in the file). The 51100 line with job class 1218 and the 51300 lines were not flagged. FACTS now warns on salary lines (objects starting `511`) with no FTE.
- Not yet fully accepted, so the location rule and the FTE formula stay marked unconfirmed in the app.

**10/10/2026, Gilbert, TEST A (3 lines: header, `UBL,11000,2500,57331,0000,707,0000,-1000,0`, `UBL,11000,2100,55915,0000,707,0000,1000,0`).** Imported (2 lines); validation error `Same Func Xfer` again (1 line with errors, no account line named). So the error does not depend on the number of lines, salary lines, FTE or the first file's amounts: a two-line move from function 2500 to function 2100 triggers it by itself. Leading guess: OBMS treats functions in the same series (first digit; 2100 and 2500 are both 2000-series) as the same for a Transfer, and a Maintenance BAR would be the right type. Accepted earlier: a Maintenance BAR within one function (1000) and a Transfer from function 2600 (Cesar, 134 lines). Next tests: the same $1,000 move across series (needs a function 1000 account line with budget), and the reverse direction (2100 to 2500).

**10/10/2026, OBMS BAR Entry screen (Transfer, fund 11000, Gilbert).** With a source line on function 2500 entered (Source: Expenditure), the Destination "Function" list offered only: 1000 Instruction, 3100 Food Services Operations, 3300 Community Services Operations, 4000 Capital Outlay. No 2000-series function (2100 etc.) was offered. This matches the upload errors: OBMS does not accept a Transfer from a 2000-series function to another 2000-series function (`Same Func Xfer`). Not yet known: whether the same holds for other series (for example 3100 to 3300), whether a 1000-series source can go to a 2000-series destination, and whether a Maintenance BAR is the way to move money between 2000-series functions (the user's own definition of Maintenance is a move within one function). Next test: the same two lines as type M. FACTS warns (does not stop) about a Transfer between functions in the same series.

**10/10/2026, an approved Transfer from OBMS (Gilbert, FY2025-26, Document ID `001-707-2526-0033-T`, "Transfer (Direct)", PED Approved 7/13/2026).** Lines: function 2100 object 55915 -6,700; function 3100 object 55915 +5,900; function 3100 object 56116 +800 (all location 001707, program 0000, job class 0000, FTE N/A). So a Transfer from a 2000-series function (2100) to a 3000-series function (3100) is accepted, and the same object (55915) may appear on both sides, which rules out an object-overlap explanation for `Same Func Xfer`. Document ID format: district code, location, fiscal year as 2526, a four-digit sequence, type letter. The action history shows the real approval path: Generate Direct BAR Number, Create Direct BAR, Direct BAR Submit to BM, BM Approved Direct BAR - Submitted to SP, SP Approved Direct BAR - Ready to submit to PED, BM submitted Direct BAR to PED, BA Approval - Submit to BS, BS Approval - PED Approval (with a School Board Approval Date). The justification used was one sentence. FACTS test: this BAR passes all checks.

**10/10/2026, Gilbert, TEST M (type M, `UBL,11000,2500,57331,...,-1000` and `UBL,11000,2100,55915,...,1000`).** OBMS status "Staging Validated", 0 errors, "Accept BAR" offered. So the same move that a Transfer rejects (`Same Func Xfer`) is accepted as a Maintenance BAR. Rule used by FACTS: a Transfer takes money only from functions in other series (first digit differs) and a same-series move is built as a Maintenance BAR. The Transfer check is a stop for 2000-series functions (evidenced) and a warning for other series; a Maintenance across series is a warning (untested). Still unknown: the rule outside the 2000 series, and Maintenance across series.

**10/10/2026, planned Test E (Title I fund 24101, 2100 -1000 / 2400 +1000, object 56118, location 707).** E-T as type T and E-M as type M. Expected if the series rule is general: E-T `Same Func Xfer`, E-M accepted. Account validity at Gilbert is a guess (the object comes from Cesar's 24101); an "invalid account" message is a separate problem. Result to be recorded here.

**FTE (10/10/2026).** Salary lines now have a Line FTE box (the position's current FTE, typed once). FTE adj = amount moved / the line's Account Summary budget x Line FTE, 4 decimals; a hand-typed FTE adj is never overwritten. Formula still an assumption until an accepted BAR confirms it (Title I example: 2,073.00 gives 0.0400).
