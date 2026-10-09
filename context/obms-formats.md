# OBMS upload formats

**Status: incomplete.** The PED BAR Upload Guide has not been supplied. Rules below come from the earlier draft (cited to §3.4.3 of the guide) and from the user's OBMS screenshots. Replace this with the guide's rules and section numbers before the CSV generator is built.

## Transfer upload (from the draft, §3.4.3)

- Header record **UBH**, 15 comma-separated fields: UBH, District/Parent Code, Budget Year, Fund, BAR Type, First, Middle, Last, From Date, To Date, Flowthrough Scope, Carryover, Current Yr Alloc, Total Approved Budget, Justification.
- Line record **UBL**, 9 fields: UBL, Fund, Function, Object, Program, Location, Job Class, Adjustment Amount, Adjustment FTEs.
- CRLF line endings, no BOM, no trailing commas, exact field counts. Build the CSV string directly (Excel's Save As CSV can add trailing commas).
- Budget Year is the 4-digit end year (FY27 → 2027).
- Justification ≤ 255 characters, no double quote, no pipe.
- Amounts: 2 decimals, no `$`, no thousands separator. Zero-dollar lines are omitted (to confirm).

## What the OBMS BAR Summary screen shows (the in-app view mirrors it)

Document ID, fiscal year, BAR type, fund, entity, contact person, telephone and email, justification, adjustment revenue / expenditure / FTE totals, status, action history (action, date, by whom), and a line table: Acct Type, Func, Object, Location, Program, Job Class, Adj Amt, FTE Adj. Negatives show in parentheses; lines are marked EXP for expenditure.

## Still needed from the guide

- Increase, Decrease and Maintenance upload layouts (how revenue lines appear: account type, object range).
- Flowthrough header fields 9-14: meaning, validation, which are required.
- Location field: what the upload expects for each school (Gilbert's screen shows 001707).
- Rounding or plug rules; whether zero lines are ever kept.
- A rejected upload and OBMS's error message, as a negative test.
