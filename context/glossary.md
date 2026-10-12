# Glossary

- **AptaFund** — the accounting system the reports come from. The only one supported for now.
- **BAR** — Budget Adjustment Request, sent to PED through OBMS.
- **BAR types** — T transfer, M maintenance (transfer within one function, auto-approved), I increase, IB initial budget, D decrease. "Transfer (Flowthrough)" is a transfer of a flowthrough fund.
- **Document ID** — OBMS-assigned BAR number (district, entity, budget year, sequence, type). FACTS does not generate it.
- **Encumbrance** — money committed but not yet spent (purchase orders and similar).
- **Flowthrough** — a fund passed through from another agency; its BARs carry extra header fields (see the PED guide).
- **Function** — the second segment of the account code (for example 1000 Instruction, 2600 Operation and Maintenance of Plant). Budget control for a deficit is judged at function level within a fund.
- **FTE** — full-time equivalent, a position's share of a full-time job. Carried on BAR lines as a 4-decimal adjustment.
- **Fund** — first segment of the account code.
- **Job Class** — last segment of the 6-segment code.
- **Location** — account code segment; how it appears in the upload file differs by school.
- **NMPED / PED** — New Mexico Public Education Department.
- **OBMS** — Operating Budget Management System. BARs and RfRs are submitted here; "BAR Uploads" accepts the CSV.
- **Object** — third segment (51100 salaries, 4xxxx revenue, and so on).
- **RfR** — Request for Reimbursement.
- **UBH / UBL** — upload record types: UBH is the BAR header (15 fields), UBL is a line (9 fields).
- **UCOA** — NMPED's Uniform Chart of Accounts.
- **Vertex Blue** — brand primary color #003865. See `context/style.md`.
