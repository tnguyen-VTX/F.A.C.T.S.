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
| Increase (I / IB) | Revenue (objects 4xxxx) plus expenditure, amounts from the award | Revenue total = expenditure total, to the cent |
| Decrease (D) | Mirrors Increase, negative amounts | Revenue = expenditure; no line below actuals plus encumbrances |
| Maintenance (M) | Transfer within one function. OBMS approves it automatically | Every line in one function; nets to 0.00 |

## Deficits and donors (Transfer)

- A deficit is a **function within a fund** whose subtotal Available is negative (from the `Subtotal of Element: [Function]` rows). An over-budget line inside a function that nets positive is not a deficit. [assumed from the user's justification wording and answer]
- Transfer amount = function deficit + cushion (dollar or percent, default 0), rounded up to a whole dollar. [assumed: rounding]
- Receiving lines: fill over-budget lines first, then spread any remainder by budget share.
- Donors: same fund; donor function's subtotal Available stays ≥ 0; only lines with room give; same object group. Ranked by a priority list in the school profile. User can change any donor. Per-BAR mode: top-ranked first, or spread across all by share of room.

## Fund selection

The manager chooses which fund(s) to work in; the BAR screen shows only those. A BAR has exactly one fund (the UBH header holds one), so several selected funds mean several BARs. Donors never cross funds. [assumed: confirm whether several funds should instead be one filtered view]

## FTE

- FTE usually appears only on salary object 51100. Proportional rule: `FTE change = dollars moved / budgeted salary × line FTE`, 4 decimals, editable. [assumed; check against the Title I example: 2,073.00 moves 0.0400 FTE]

## Validation

Hard stops: BAR doesn't balance; a line fails the code pattern or is in a different fund; a donor or line would go over budget. Justification problems warn and open the editor.

## Fiscal year handling

BARs are for the current fiscal year. The prior year stays editable until 10/31, then read-only with an unlock override.
