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
- Still to plan: stale text after the lines change, tie-out/proof, tests, build order, how to explain it.
