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
- DeepSeek structured replies use JSON mode, concise output limits, and one automatic repair attempt before the UI receives an invalid-output error.
- Values explicitly supplied by source files or confirmed in assistant conversation override auto-derived formulas; cumulative values must be marked as explicit evidence before metric derivation runs.
- Runtime stability: keep ordinary concurrency at three or fewer and heavy tasks at one or two; only one writer per project directory; continue long work from Wiki/TASKS checkpoints after disconnects without resetting the project.
- Default role model is GPT-5.5 unless the owner or CEO explicitly changes it later; this does not alter project memory, task, or permission boundaries.
- Deterministic core libraries under `src/lib/*.ts` enforce 100% statement, branch, function, and line coverage. This is a scoped unit-test guarantee, not a claim that React UI composition or Cloudflare adapters have 100% integration coverage.
- API JSON/error handling now has one shared request core. Financial import merges retain one evidence mapping per target field, header-only tables do not become client data, and financial-only parsing runs only for detected financial tables.
- Full intake work has started as a standard source-backed data layer, not an MVP-only shortcut. Migration `0008_full_tax_data_intake` defines import batches, source files, periods, financial statements, account balances, ledgers, VAT returns, invoices, payroll, IIT returns, evidence fields, conflicts, and generic standard records.
- The AI assistant now has a whitelisted `save_standardized_tax_data` business tool. It may save cleaned business intake data after clear user authorization, but rule libraries, tax formulas, schema design, auth, code, and deterministic rule logic remain protected from model writes.
- The first deterministic intake classifier correctly identifies the current Beijing real-customer materials as payroll, invoice list, VAT return, VAT schedule, financial statements, account balances, IIT withholding, and ledger files, with reliable period detection for 2024-09 to 2025-12, 2025-12, 2025 annual, and 2026-03.
- Assistant uploads now carry intake metadata through the working context: document type, classifier confidence, source system, period type, period start/end, period evidence, and whether a specialized parser is required. The backend `save_standardized_tax_data` source-file normalizer stores those fields as source-file metadata/evidence instead of treating generic upload labels as document types.
- Standard task migration prepared a durable `HANDOFF.md`. New continuation tasks must restore from Wiki/RAG/HANDOFF plus real Git/production state, begin read-only, and must not modify code, database, authentication, deployment, or real business data until the owner gives a fresh instruction.
