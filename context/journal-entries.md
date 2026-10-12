# AptaFund journal entries (JEM context)

Seen in AptaFund screens (Gilbert L. Sena, FY2027). Never put real names or payroll in tests; use made-up amounts with the same shape.

## Journal entry fields
Type (Actual, Budget, Encumbrance), Transaction Date, Comment, then lines: Sequence, Account Code, Description (the account's name), Comment, Debit, Credit. Per-fund subtotals and a JE total; the JE must balance (debits = credits) before posting. After saving, AptaFund gives a number (`T0048612` while unposted, `00047858` once posted). Encumbrance JEs are made by AptaFund automatically and are out of scope.

## Actual JE: reclass of an expenditure
- Same fund: credit the old expense account, debit the new one.
- Different funds: each fund balances through its own bank account (`<fund>-0000-11011-0000-000000-0000` at Gilbert; varies by school and fund, so it lives in the profile).
- Example (made-up amount 3.55): line 1 `27901-1000-52315-0000-001707-1214` credit 3.55; line 2 `11000-2100-52315-0000-001707-1214` debit 3.55; line 3 `27901-0000-11011-0000-000000-0000` debit 3.55; line 4 `11000-0000-11011-0000-000000-0000` credit 3.55. Each fund nets to zero (sum 7.10 debits and 7.10 credits). Comment "To reclass expenditures from 27901 to 11000". Only the segments the user names change; the rest are copied.
- The transaction date is the last day of the month of the original charge.
- Vendor charges are grouped by account code, then by date (same as the pivot with Name filter); the pivot's yellow rows are the hand-typed "Reclass" notes (amount and "Reclass to 11000-2600").

## Budget JE: an approved BAR
- Type Budget. Comment `BAR <Doc ID> Fund <fund> <Transfer ...>`, e.g. `BAR 001-707-2627-0006-T Fund 24101 Transfer`. Date = the PED approval date (the last signature on the approved BAR report).
- Decrease lines are credits, increase lines are debits, in the BAR's own line order; no bank line. 16-line example: debits 22,750.00 = credits 22,750.00. Account code = fund-function-object-program-location-job class.

## Sources
- Approved BAR report (PED, `.xlsx`): Doc ID, fiscal year, entity, fund type, adjustment type, one row per line (Fund, Function, Object, Program, Location, Job Class, Present Budget, Adj Amt Exp as text like `$(17,800.00)`, Adj Budget, ADD'L FTE), justification, Board date and the signature table (name, role, Excel serial date).
- School chart: AptaFund "Chart Of Accounts Report" (`Account Code, Description, Account Type Name, Enabled, Active, Account Group Type, Cycle Name`; one row per code per fiscal year; Gilbert has about 27,000 rows from FY2007 to FY2027).
- PED Chart Line Listing (allowable UCOA strings), FY27 zip of nine CSVs (about 280 MB unzipped, 8.7 MB zipped): `ChartOfAccountsName, AccountType, FundCode, FundName, FunctionCode, FunctionName, ObjectCode, ObjectName, ProgramCode, ProgramName, JobClassCode, JobClassName`; one row per allowed string, no location. It has cash object 11111 and not AptaFund's bank object 11011, so bank lines are not checked against it.
