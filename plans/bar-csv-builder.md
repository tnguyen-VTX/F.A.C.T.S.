# BAR CSV Builder — Plan

**Status:** Draft, not approved. Resume by working through the open questions at the bottom.
**First school:** Cesar Chavez Community School (district/parent code 512). Must work for every school through school profiles.

---

## 1. The Why

Preparing a BAR for OBMS means turning the BAR Worksheet into an upload file by hand or through a spreadsheet prototype. The OBMS format is strict (exact field counts, no trailing commas, a 255-character justification with forbidden characters), and Excel's Save As CSV can add trailing commas that break it. Mistakes mean a rejected upload or a BAR that doesn't net to zero. This repeats for every BAR at every school.

**Success:** I paste the BAR lines, pick the school, and get a file OBMS accepts on the first try, plus a justification I can use as-is, in minutes instead of rebuilding the spreadsheet each time.

## 2. The What

A web form where I paste BAR lines copied from Excel (e.g. BAR Worksheet!A71:P224) and get:

- An OBMS-ready BAR upload CSV (per BAR Upload Guide §3.4.3)
- A justification string (and optionally a longer narrative for the PED justification form)
- Validation checks before I download anything

**Must-haves:** school selection, paste parsing, CSV generation matching the prototype exactly, validation panel, download and copy.
**Nice-to-haves:** long narrative, filling the PED justification form (.docx), warning when a decrease exceeds available budget.

## 3. Across my schools

These come from the school profile, not the code:

| Setting | Cesar Chavez Community School | Other schools |
|---|---|---|
| District/Parent code | 512 (matches the 512 in RfR names) | Per profile |
| Account code format | 7 segments: `FFFFF-FFFF-OOOOO-PPPP-LLLLLL-JJJJ-UUUUU` | Gilbert L. Sena's reports use 6 segments (no `UUUUU`); confirm each school |
| Location rule | Last 3 digits of segment 5 (`512001` → `001`) | Per profile; confirm |
| Contact names | Optional, per profile | Per profile |
| Flowthrough funds | Which funds are flowthrough | Per profile |

Switching schools must clear the pasted data so one school's lines never end up in another school's file.

## 4. The Data

**Input:** Excel copy of the BAR Worksheet, which arrives as tab-separated text. Layout of BAR Worksheet!A71:P224:

- Fund header row: fund code alone in column B (e.g. 11000)
- Column header row: Job | Account Code | Description | … | Transfer BAR | … | Increase BAR | NOTES
- Decrease block: one account line with a negative amount in the Transfer BAR column
- Increase block: many account lines with positive amounts; subtotal and total rows have no account code
- Columns of interest: B = Account Code, L = Transfer BAR amount (O = Increase BAR amount for increase BARs)

**Parsing rules:**

- A row is a LINE only if column B matches the school's account code pattern (Cesar Chavez: `^\d{5}-\d{4}-\d{5}-\d{4}-\d{6}-\d{4}-\d{5}$`)
- Find the amount column from the header cell (Transfer BAR / Increase BAR), not hard-coded L or O
- Fund = first line's segment 1 (warn if lines have mixed funds)
- Ignore blank, header, subtotal, and total rows
- Strip `$` and commas; handle parentheses negatives
- Treat every code as a STRING to preserve leading zeros

**Output, header record (UBH), 15 comma-separated fields:**
UBH, District/Parent Code, Budget Year, Fund, BAR Type, First, Middle, Last, From Date, To Date, Flowthrough Scope, Carryover, Current Yr Alloc, Total Approved Budget, Justification

- District/Parent Code from the school profile
- Budget Year = 4-digit END year (FY27 → 2027)
- Fund = fund code from the pasted block (e.g. 11000)
- BAR Type = T (also IB, M, I, D allowed)
- Contact and flowthrough fields blank for non-flowthrough funds
- Justification ≤ 255 characters, no double quotes or pipes, no commas in the amount

**Output, line records (UBL), 9 fields:**
UBL, Fund, Function, Object, Program, Location, Job Class, Adjustment Amount, Adjustment FTEs

- Split the account code on the dash: fund = seg 1, function = seg 2, object = seg 3, program = seg 4, location = per the school's location rule, job class = seg 6; seg 7 (`00000`) unused
- Amount = BAR amount column for that row (2 decimals, no `$`, no thousands separator)
- FTEs = 0
- Zero-dollar lines are omitted

**File format:** CRLF line endings, no BOM, header exactly 15 fields, line rows exactly 9 fields, no trailing commas. Build the CSV string directly rather than relying on Excel.

**Sensitive data:** BAR lines carry account codes and amounts, not employee names. Everything still runs in the browser with no backend, so data never leaves my computer.

## 5. Accuracy and tie-out

The output must match the spreadsheet prototype exactly.

**Test case (Cesar Chavez, from the prototype):**

- Fund 11000, type T, district 512, year 2027
- 134 UBL lines (12 zero-dollar rows omitted)
- 1 decrease of −256,945.17 (function 2600 / object 57331); increases total 256,945.17; net 0.00
- First line: `UBL,11000,2600,57331,0000,001,0000,-256945.17,0`

The real proof is a test upload to OBMS (open question 7).

## 6. Fixed rules vs. AI

The CSV is entirely fixed rules: parsing, splitting, formatting, and validation must be predictable and testable. No AI there.

The justification starts from a template filled in by rules (usual wording, function-level only, no object):

> Transfer of $X from the Operation & Maintenance of Plant (2600) function to Instruction (1000) and Support Services (2100-2600) functions to align with actual expenditures and encumbrances and ensure no function is over budget.

AI could help draft the longer narrative for the PED justification form, but I review and edit it before it goes anywhere.

## 7. The Experience

Form fields:

- School (from profiles; fills in the district/parent code)
- Budget year (2027, editable)
- BAR type (dropdown: IB, T, M, I, D)
- Contact first/middle/last (optional)
- Flowthrough fields (only if the fund is flowthrough)
- Justification (auto-generated, editable, live counter, max 255)
- Paste box

Outputs: preview table of parsed lines, validation panel, download .csv, copy to clipboard, optional long narrative.

**Decision to make:** a standalone paste tool, or an export button on FACTS's existing BAR builder (which already spreads amounts across a fund's lines)? See open question 8.

## 8. Risks and controls

Validation checklist:

- [ ] Every line matches the school's account code pattern
- [ ] All lines share the BAR's fund (or warn)
- [ ] Transfer BARs net to 0.00 (to the cent)
- [ ] Optional: warn if a decrease exceeds available budget
- [ ] No negative values in flowthrough fields
- [ ] Justification ≤ 255 characters; no double quote or pipe
- [ ] Amounts have at most 2 decimals
- [ ] Duplicate account lines flagged

Other risks: wrong school selected (show the school name prominently on the preview and in the file name); a paste from the wrong fiscal year; a paste with a different column layout (find columns by header, warn when a header is missing); OBMS rejecting the file (record rejection messages in this plan).

## 9. The Proof

- Unit tests on the parser and CSV generator using the A71:P224 sample (expect 134 lines, net 0.00, 256,945.17 each way)
- Byte-for-byte comparison with the prototype's output
- A sample from a second school with a different account code format
- One real OBMS test upload

## 10. Rollout

Cesar Chavez first, then add a profile for each additional school and run its own sample through the tests before using it for real.

## 11. Explaining it

Problem: preparing BAR uploads by hand is slow and error-prone at every school. Solution: paste, pick the school, download a validated file. Impact: fewer rejected uploads and less time per BAR, multiplied across schools.

---

## Open questions

1. Which BAR types besides Transfer? (Increase uses the Increase BAR column; any rounding-plug rules?)
2. Should zero-dollar lines ever be kept?
3. ~~Will district code / school ever vary?~~ Yes, it varies by school. Remaining: which settings go in each school's profile, and what is each school's district/parent code?
4. Justification: one template per BAR type, or free text with a suggested default?
5. Flowthrough funds: support header fields 9–14 in v1?
6. Also fill the PED justification form (.docx)? Fields: District, Program, Fund Code, BAR #, narrative, use of funds, school sites.
7. Does OBMS accept the file as-is, and is location 001 correct? Test one upload and record any rejection messages here.
8. Standalone paste tool, or an export from FACTS's BAR builder, or both?
9. What account code format and location rule does each school use? (Cesar Chavez: 7 segments, last 3 of segment 5. Gilbert L. Sena: 6 segments, rule unknown.)

## Milestones

1. School profile for Cesar Chavez, plus parser and unit tests using the A71:P224 sample
2. CSV generator matching the spreadsheet prototype exactly
3. Form UI and validation panel
4. Justification generator (plus narrative)
5. Second school's profile and sample test
6. (Optional) .docx justification form fill
7. Test against a real OBMS upload
