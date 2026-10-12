# BAR Builder (OBMS view and upload CSV) — Plan

**Status:** Draft, not approved. Build only after the user says "Plan approved."
**Depends on:** `plans/report-import.md` (the Account Summary and Fund Audit slots, and the school profile).
**Replaces** the earlier "BAR CSV Builder" draft, which assumed a paste box and a single school. The paste box stays as a fallback front door.
**Context files:** `context/business-rules.md`, `context/obms-formats.md`, `context/glossary.md`, `context/style.md`, `context/schools/`.

## 1. The Why

Preparing a BAR means hand-building lines in a workbook, then turning them into an upload file OBMS accepts. OBMS is strict (exact field counts, no trailing commas, a 255-character justification with forbidden characters), and a rejected upload or an unbalanced BAR costs time at every school.

**Success:** from loaded AptaFund reports, find what needs a BAR, build it, see it as OBMS shows it, and download a file OBMS accepts on the first try.

## 2. The What

1. **Choose the fund(s)** to work in (see section 7).
2. Pick a BAR type; the screen adapts.
3. Build the BAR from the loaded reports (or paste lines as a fallback).
4. Review: an in-app OBMS-style view beside the validation panel.
5. Export the upload CSV, enter the OBMS Document ID, and track status.

Types in v1: Transfer (T), Transfer (Flowthrough), Increase (I/IB), Decrease (D), Maintenance (M). Rules per type are in `context/business-rules.md`.

## 3. Across schools and managers

Everything school-specific comes from the profile: district code, code pattern, location rule, funds with flowthrough flags, donor function priority, default cushion, contacts. Each manager runs their own copy; data stays in the browser. See `plans/report-import.md`.

## 4. The Data

- Account Summary and Fund Audit from the import slots. Position/FTE optional, for FTE.
- The paste box accepts BAR lines copied from Excel; find columns by header, never by letter.
- Output header (UBH, 15 fields) and lines (UBL, 9 fields, location 3 digits), per the OBMS Import & Export File Specifications v2.1.4 (see `context/obms-formats.md`). Increase revenue lines use function 0000, a 4xxxx object, location 000.
- A user-supplied Maintenance example pads each UBL to 15 fields (likely Excel). Build to the spec; settle it with a real test upload.
- Saved BARs (lines, type, justification, Document ID, dated status steps) are keyed by school and fiscal year.

## 5. Accuracy and tie-out

Four accepted BARs as tests: the Gilbert Title I flowthrough transfer (16 lines, FTE on the 51100 line), the Cesar Chavez fund 11000 transfer (134 lines, net 0.00), an Increase, and a Decrease (plus a Maintenance if one exists). The in-app view and the CSV must both reproduce each BAR line for line. The CSV must match byte for byte. One real OBMS test upload per school before real use.

## 6. Fixed rules vs. AI

- All amounts, donors, balancing, FTE and CSV output are fixed, testable rules.
- The short justification is a rule-based template per BAR type, editable, with a 255-character counter.
- The long PED narrative may be drafted by AI through a button that calls an AI API from the browser. Only fund, BAR type, function names and dollar amounts are sent, after a preview of the exact text. The result goes into an editable box labeled AI-drafted and never into the CSV or a record automatically. The key is stored in the browser (user's choice); the risk is recorded in the risks section.

## 7. The Experience

- **Fund selection (new):** a fund picker at the top of the BAR screen lists the school's funds from the profile. The manager chooses one or more funds to work in. Everything on the screen (deficit list, donors, saved BARs) is limited to the selected funds. A remembered selection is kept per school and fiscal year. Because an OBMS BAR has one fund, FACTS builds one BAR per fund: with several funds selected, the deficit list is grouped by fund and each BAR is built and exported separately. Donors never cross funds.
- "New BAR" asks for the type first. Transfer opens the deficit list; Maintenance filters to one function; Increase and Decrease open revenue and expense entry.
- Deficit = a function within a fund whose subtotal Available is negative. Amount = function deficit + cushion, rounded up to a whole dollar (to confirm). Receiving lines: over-budget lines first, then the rest by budget share. Donors: same fund, function stays ≥ 0, lines with room, no object rule (any object may fund any other), ranked by the profile's priority list, with a per-BAR mode (top-ranked first, or spread across all). The manager can change any donor.
- FTE on salary lines (object 51100): proportional to dollars moved, editable.
- In-app view: header, justification, totals, line table (negatives in parentheses), status history. Neutral styling, not state branding.
- Switching schools auto-saves the working BAR as a draft under that school.
- Branding per `context/style.md`.

## 8. Risks and controls

- Hard stops (download disabled): BAR doesn't balance; a line fails the code pattern or is in a different fund; a donor or line would go over budget.
- Warnings: justification over 255 characters or with a double quote or pipe (opens the editor); mixed funds; duplicate lines; partial report range.
- Every BAR is labeled with the report load and range it was built from. A newer report keeps the amounts and re-checks them, showing old and new figures. A BAR at Uploaded or later is frozen to the report it used.
- Fund selection narrows what is shown; it never changes totals or what the validation checks.
- AI key in localStorage is readable by anyone on that browser profile or any injected script: spend-limited key, "Clear key" button, first-use warning.
- Backup file holds profiles, BARs, drafts and settings only. No raw reports, no Position/FTE data, no AI key. Restoring shows both versions of any BAR present in both and never overwrites silently.
- Raw reports never go in the repo or in context files.

## 9. The Proof

See section 5, plus unit tests on the deficit finder, donor split (nets to exactly 0.00), FTE calculation, validation rules, and CSV builder. Add made-up fixtures with round numbers.

## 10. Rollout

Gilbert first, then Cesar Chavez. Run each school's own sample through the tests before real use. Prior-year BARs stay editable until 10/31, then read-only.

## 11. Explaining it

Problem: BARs are hand-built and fixed up until OBMS accepts them. Solution: pick the school and funds, build from the reports, check against OBMS's own layout, and download a validated file. Impact: fewer rejected uploads and less time per BAR at every school.

## Assumptions to confirm

1. Choosing several funds means several separate BARs (one fund per BAR). Alternatively the user may want the selection only as a filter.
2. Transfer amounts round up to a whole dollar.
3. Default donor mode.
4. Whether a BAR with an invalid justification may still be downloaded.
5. The proportional FTE formula.
6. A BAR at Uploaded or later is frozen to its report.
7. Position/FTE file is not kept after the load.

## Open questions

1. Location: the file wants 3 digits; which 3 digits for each school (profile rule)?
2. Flowthrough header fields 9-14: meaning and validation beyond the spec table.
3. Does OBMS accept UBL lines padded to 15 fields (as in the user's Maintenance example)?
4. Rounding-plug rules; zero-dollar lines.
5. Which school is the "CIS" Maintenance example from, and was it accepted?
5. Position/FTE report name and layout.
6. Backup reminder cadence.
7. Which funds are flowthrough at each school (profile).

## Milestones

1. School profile and Settings screen (shared with report import).
2. Import slots for Account Summary and Fund Audit.
3. Fund picker, deficit finder and donor suggestions.
4. BAR model for the types, OBMS-style view, saved BARs with status log, backup export/import.
5. CSV generator and validation panel, tested against the accepted BARs (the PED specification is now in `context/obms-formats.md`).
6. Rule-based justification.
7. Position/FTE slot and proportional FTE.
8. Second school profile and sample test.
9. AI narrative button.
10. Real OBMS test uploads; record rejections here.
11. Later, separate plans: PDF import, shared store with sign-in, .docx PED justification form.
