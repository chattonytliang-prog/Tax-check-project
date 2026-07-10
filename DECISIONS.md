# Decisions

## 2026-07-09: AI Agent Permission Boundary

Decision: The AI agent can write business data, but cannot write the rule library.

Allowed via whitelisted tools:
- Client profiles
- Uploaded/source material records
- Cleaning drafts
- Period data
- Report drafts
- Customer memory and import logs

Protected read-only scope:
- Tax rule library
- Risk rule library
- Rule formulas and thresholds
- Report core templates and deterministic logic
- Users, authentication, database schema, and code

Rationale: The assistant should become useful as an operator that can import and maintain customer data, while deterministic tax rules remain governed by controlled product logic.

## 2026-07-09: Split Assistant Business Write Tools

Decision: Replace one broad assistant save operation with explicit business tools while keeping `save_current_draft` as a compatibility alias.

Tools:
- `create_or_update_company`
- `save_period_data`
- `attach_source_material`
- `save_cleaning_draft`
- `save_customer_memory`
- `create_import_audit_log`

Rationale: The assistant needs to behave like a traceable business operator. Separate tools make permission boundaries, audit records, and future customer-memory behavior easier to control.

## 2026-07-09: Assistant Business Table Self-Healing

Decision: `/api/assistant/tools` may create missing assistant business tables on first use.

Scope:
- `assistant_cleaning_drafts`
- `assistant_customer_memories`
- `assistant_import_audits`

Rationale: Cloudflare D1 migration execution may be unavailable from local CLI when no API token is configured. These tables are additive, idempotent, and limited to AI business-working data, so self-healing avoids blocking the product while keeping the rule library read-only.

## 2026-07-10: Evidence-Safe Financial Import Mapping

Decision: Financial imports may only populate a system field when the source column and accounting meaning match that field. Blank cells remain missing.

Explicitly prohibited substitutions:
- Account codes or statement row numbers as monetary values
- Bank-account ending balances as collection flow
- Employee-compensation liabilities or cash payments as payroll expense
- Sales-tax offset accounts as output tax
- Opening balances or unrelated side-by-side statement values as current-period amounts

Rationale: Filling more fields is not useful if it creates false tax-risk findings. The parser provides evidence-backed candidates; the AI asks for missing evidence and the deterministic host validates all writes.

## 2026-07-10: Draft-Scoped Agent Context and Idempotent Writes

Decision: When a cleaning draft exists, the model receives that draft as the active company context and does not receive another selected company's risks or report. One natural-language save authorization executes one client write, even if the model proposes multiple compatible save tools.

Rationale: Cross-company context can contaminate financial fields, while duplicate save tools create repeated writes and misleading receipts. Draft scoping and write deduplication make the agent safe to use as the primary import operator.

## 2026-07-10: Core Library Coverage Gate

Decision: `src/lib/*.ts` is the deterministic core-library coverage scope. Statements, branches, functions, and lines must all remain at 100% in CI/local coverage runs. UI composition and Cloudflare request adapters require separate integration/E2E coverage and are not represented as unit coverage.

Rationale: A precise scope prevents a misleading repository-wide claim while making regressions in parsers, rule evaluation, period aggregation, API request handling, and report generation fail immediately.

## 2026-07-10: Full Source-Backed Tax Data Intake

Decision: Customer uploads must enter a standard intake layer before they are used for filing checks, professional risk analysis, or reports.

Standard intake scope:
- Import batches and original source-file metadata
- Period records
- Financial statements and statement lines
- Account balances and ledger entries
- VAT returns and VAT return lines
- Invoice summaries and invoice lines
- Payroll runs and payroll lines
- IIT withholding returns and lines
- Evidence fields and unresolved conflicts
- Generic standard records for future material types

Rationale: The assistant should feel like it can complete the work from conversation, but every stored value needs source evidence, period context, conflict handling, and deterministic validation. This keeps AI useful without letting it silently overwrite data or bypass professional rules.

## 2026-07-10: Standard Clean Task Handoff

Decision: Long continuation work should migrate through durable project files instead of copying chat history or forking the old thread.

Handoff sources:
- `README.md`
- `MEMORY.md`
- `TASKS.md`
- `DECISIONS.md`
- `RAG_INDEX.md`
- `HANDOFF.md`
- Existing RAG mirrors and `project_memory.json`
- Real Git status and production health checks

New task boundary:
- Begin read-only.
- Report current state, next step, risks, and missing information.
- Do not modify code, commit, deploy, operate database/auth, or let AI write real business data before a fresh owner instruction.

Rationale: The project has long memory and sensitive production/customer boundaries. A clean task must restore context from maintained artifacts and the repository state, not from stale or partial chat context.
