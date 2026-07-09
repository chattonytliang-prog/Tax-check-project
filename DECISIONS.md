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
