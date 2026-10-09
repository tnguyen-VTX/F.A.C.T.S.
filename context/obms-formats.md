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
