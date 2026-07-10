# Project Memory

## 2026-07-09

- The AI assistant is treated as a business-data operator, not only a chat box.
- It may write business data through approved host tools after clear user authorization in natural language.
- The rule library, tax formulas, risk rules, report core logic, users, auth, schema, and code are protected read-only areas for the assistant.
- Assistant business writes must be validated by the host app and recorded in audit logs.
- Assistant write tools are being split into explicit business actions: company/profile upsert, period data save, source material attachment, cleaning draft save, customer memory save, and import audit log creation.

## 2026-07-10

- Real customer Excel regression files exposed unsafe accounting-import mappings: account codes and statement row numbers were treated as amounts, bank balances were treated as collection flow, and compensation liabilities were treated as payroll expense.
- Financial imports now distinguish two-row account-balance headers, side-by-side balance-sheet sections, blank amount cells, and in-workbook company/period metadata.
- Balance-sheet balances and cash-flow payments must not be silently substituted for collection-flow or payroll-expense fields. Missing evidence remains missing and should be confirmed through conversation.
- An assistant cleaning draft is the active company context. Figures, risks, and report facts from a separately selected company must not leak into that draft.
- Period semantics are evidence: year-to-date profit/revenue/cost must remain cumulative and must never be rewritten as monthly figures.
