# Narrative templates for the BAR Builder (DRAFT, not approved)

Status: planning in progress. Do not build until the user says "Plan approved."

## Problem
The BAR Builder has one longer-narrative template (Transfer, negative function). Every BAR type the business manager sends needs
standard wording, so the narrative can be filled in one click, checked, and edited. The text is for the manager's records and the
PED explanation. It never goes in the OBMS upload file (the short justification is separate and has its own limits).

## Wording decided (the user's own words; blanks are filled from the BAR)
Blanks: `[School Name]` (profile name), `[Function Title (function code)]`, `[Fund Name (fund code)]`, `[$amount]` (whole dollars).

1. **Transfer (negative function)** (already built):
   "[School Name] is requesting a transfer from the [Function Title (function code)] function in the amount of [$amount] to [Function Title (function code)] function to align with actual expenditures and encumbrances. The transfer is needed to ensure the function is not over budget by any of its functions."
2. **Transfer (positive function)** (version B): a function with room gives money to a function that needs it.
   "[School Name] is requesting a transfer of [$amount] from the [Function Title (function code)] function to [Function Title (function code)] function. The funds are available in the giving function after accounting for actual expenditures and encumbrances, and the transfer ensures the receiving function is not over budget."
3. **Maintenance** (version A), one wording for a move within one function and between functions of one series:
   "[School Name] is requesting a maintenance transfer of [$amount] from the [Function Title (function code)] function to [Function Title (function code)] function to align the budget with actual expenditures and encumbrances."
   When every line is in one function: "[School Name] is requesting a maintenance transfer of [$amount] within the [Function Title (function code)] function to align the budget with actual expenditures and encumbrances."
4. **Increase / Initial Budget** (version A, without the last sentence); "initial budget" or "increase" follows the BAR type:
   "[School Name] is requesting an [initial budget / increase] of [$amount] in the [Fund Name (fund code)] fund to budget the award received."
5. **Decrease** (version A, "to reduce the budget to the award" removed because a decrease is not always caused by an award):
   "[School Name] is requesting a decrease of [$amount] in the [Fund Name (fund code)] fund."

## Open (still to plan)
- Several giving or receiving functions in one BAR: list them as the first template does.
- Decided: a Maintenance within one function says "within the [Function] function".
- Fund name source for Increase, Initial Budget and Decrease (`D.fundNames`); amount for Increase and Decrease = the revenue total.
- Done: the short justification for a Decrease no longer says "to reduce the budget to the award" (now "Decrease of $X in fund N.").
- Decided: the same wording for every school; only the school name is filled in. No profile override. The user can still edit the text on a BAR.
- Decided: a stale narrative only warns (never stops the download; the narrative is not in the upload file). Method: save the template id and the text as generated at fill time (`narrativeFill`); warn when filling the same template again from the current lines gives different text. Hand edits do not trigger it, only changed lines do.
- Decided: for a Transfer the list opens on a suggested template and the user can pick the other. Rule: if any receiving function is over budget (subtotal Available below zero in the loaded Account Summary), suggest "Transfer (negative function)"; otherwise "Transfer (positive function)". With no Account Summary loaded, no suggestion (first in the list).

## Who, where, data
- The business manager, on the BAR draft in the BAR Builder (the existing template list and "Fill from this BAR" button; no new screen).
- Data: only the BAR's own lines, the school profile name, the fund and function names from the loaded Account Summary. No report is needed to fill Maintenance, Increase, Initial Budget or Decrease; the suggestion for Transfers needs the Account Summary. Nothing new is stored except `narrativeFill` (template id and generated text) on the BAR, kept in saved BARs and the backup.
- Amounts are whole dollars, as everywhere else. Increase and Decrease use the revenue total (equal to the expenditure total on a balanced BAR).

## What varies by school
Only the school name (profile). Same wording for every school; no profile field.

## Rules, not AI
Fixed wording filled from the BAR. No AI. A person reads and can edit the text before it is used.

## Risks and how we handle them
- Stale text after the lines change: warning only (above).
- Wrong template for the BAR type: `fillTemplate` already refuses a template for another type; each template lists the types it fits.
- Missing function or fund title: shows the code alone, as the first template does.
- Several functions on one side: listed ("A and B", "A, B, and C").
- Narrative never goes in the OBMS file (unchanged).

## Proof
Unit tests in `test/narrativeTemplates.test.js` that compare the filled text to the exact wording above, for: each of the five templates; two giving and one receiving function; a single-function Maintenance ("within"); Initial Budget versus Increase; Decrease; the Transfer suggestion (over-budget receiver, not over budget, no report loaded); the stale check (lines changed warns, hand edit does not); a template refused for the wrong BAR type. A screen test in `test/barBuilder.ui.test.js` for the suggested template and the warning. Chromium look at the panel.

## Build steps (smallest first, tests after each)
1. Add the four templates to `src/lib/narrativeTemplates.js` (types `T`, `M`, `I`/`IB`, `D`) with tests.
2. `suggestTemplate(bar, asr)` for Transfers, with tests.
3. Save `narrativeFill` when filling; `narrativeStale(bar, ctx)` check, with tests.
4. Barbuilder panel: preselect the suggestion, show the stale warning, add the fund name to the template context; screen tests.
5. Docs: `CLAUDE.md`, `plans/build-checklist.md`, How to use (one sentence), `context/style.md` (the approved wording).

## How to explain it
Problem: each BAR needs a written explanation, and typing it by hand invites wrong amounts and wording that differs between schools. Solution: standard wording for each BAR type, filled from the BAR's own lines, with a warning if the lines change afterward. Impact: faster BARs, consistent wording, and no number in the text that disagrees with the BAR.
