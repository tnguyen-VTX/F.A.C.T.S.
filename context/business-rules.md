# Business rules

Marked **[state]** if statewide, **[school]** if it varies by school (belongs in the profile), **[assumed]** if not yet proven.

## Calculations

- Available = Budget − Actual − Encumbrance. Negative = over budget. [state/accounting]
- BAR rounding matches Excel `ROUND` (half away from zero, `roundAway`); remainder goes on the largest line so the BAR nets exactly 0.00. [FACTS rule]
- Dates arrive as Excel serial numbers, converted with `serialToISO` (UTC). [FACTS rule]
- Fiscal year runs 7/1 to 6/30. The current year is FY2027 (7/1/2026 to 6/30/2027). Budget Year in OBMS is the 4-digit end year. [state]

## BAR types in v1

| Type | Lines | Balance rule |
|---|---|---|
| Transfer (T) | Expenditure | Nets to 0.00 |
| Transfer (Flowthrough) | Expenditure, plus flowthrough header fields and FTE | Nets to 0.00. Header rules pending the PED guide |
| Increase (I / IB) | Revenue (objects 4xxxx) plus expenditure, amounts from the award; expenditure is limited to what was awarded for the fund | Revenue total = expenditure total, to the cent |
| Decrease (D) | Mirrors Increase, negative amounts | Revenue = expenditure; no line below actuals plus encumbrances |
| Maintenance (M) | Transfer within one function, no object rule. OBMS approves it automatically | Every line in one function; nets to 0.00 |

## Deficits and donors (Transfer)

- A deficit is a **function within a fund** whose subtotal Available is negative (from the `Subtotal of Element: [Function]` rows). An over-budget line inside a function that nets positive is not a deficit. [assumed from the user's justification wording and answer]
- Transfer amount = function deficit + cushion (dollar or percent, default 0), rounded up to a whole dollar. [assumed: rounding]
- Receiving lines: fill over-budget lines first, then spread any remainder by budget share.
- Donors: same fund; donor function's subtotal Available stays ≥ 0; only lines with room give. **No object rule** for Transfer and Maintenance BARs: any object may fund any other (user, 10/9/2026). Ranked by a priority list in the school profile. User can change any donor. Per-BAR mode: top-ranked first, or spread across all by share of room.

## Fund selection

The manager chooses which fund(s) to work in; the BAR screen shows only those. A BAR has exactly one fund (the UBH header holds one), so several selected funds mean several BARs. Donors never cross funds. [assumed: confirm whether several funds should instead be one filtered view]

## FTE

- FTE usually appears only on salary object 51100. Proportional rule: `FTE change = dollars moved / budgeted salary × line FTE`, 4 decimals, editable. [assumed; check against the Title I example: 2,073.00 moves 0.0400 FTE]

## Validation

Hard stops: BAR doesn't balance; a line fails the code pattern or is in a different fund; a donor or line would go over budget. Justification problems warn and open the editor.

## Fiscal year handling

BARs are for the current fiscal year. The prior year stays editable until 10/31, then read-only with an unlock override.

## Fund Audit source (AptaFund CSV export)

The CSV has no Src column. Source is derived: `Number` prefix `Reg:` = payroll register, `Inv:` = invoice, `Rec:` = a fee within a cash receipt (the report lists expenditures only), `Detail` starting `J/E:` = journal entry, anything else = encumbrance only (purchase orders, jobs and payroll encumbrances cannot be told apart). Confirmed by the user 2026-10-09.

## Report tie-out

A Fund Audit and an Account Summary run for the same school and period tie exactly: each fund's Budget, Actual, Encumbrance and Available equal that fund's `[Fund]` subtotal, and the sums equal the Account Summary Grand Total. A fund with no activity in either report is ignored. A difference means a different period, school or filter, and the load warns.

## School-level expenditures (PED accreditation component 3.4)

Screen: School-level spending (PED 3.4), `lib/schoolLevel.js`. Q1 expenditures are due in OBMS by 11/30. Rules as built, all **[assumed]** until checked against the School Budget Bureau training slides (10/21/2026):

- Operational spending = actuals on expenditure objects (5xxxx) in the operational fund(s) (default 11000), year to date through the quarter's end, from the Fund Audit (by transaction date). With only an Account Summary loaded, its actuals for the report's own period are used.
- Spending by site: the 3-digit location (profile location rule). A location in the profile's PED location IDs, or with a 910B-5 row, is a school site; anything else (e.g. 000) is flagged as not coded to a site. Each site's share of site spending is compared with its share of the 910B-5 total SEG; more than the tolerance apart (default 10 points) is flagged, as is a site with SEG but no spending or spending but no SEG.
- 910B-5 amounts (total SEG, Special Education, Gifted, At-Risk per site) are typed or pasted by the user; the file is not parsed.
- Special Education, Gifted and At-Risk: the program codes for each are settings (no defaults; PED program codes not yet confirmed). Flagged when the 910B-5 shows SEG but no spending is coded to the program, or spending is coded but no SEG is shown. Otherwise spending is shown against the quarter's straight-line share of the year's SEG (Q1 = 25%), with no pass/fail threshold.
- Charters: flagged when program 0000 holds more than the limit (default 60%) of operational spending.
- Settings are saved per school and fiscal year (`S().sl34`).
