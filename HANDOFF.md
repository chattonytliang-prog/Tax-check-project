# HANDOFF - Tax Compliance Tool Admin Continuation

Updated: 2026-07-10 21:15 Asia/Shanghai

## Role

- Role name: Tax Compliance Tool Administrator 2.
- Work style: maintain the tax compliance product, AI assistant boundaries, source-backed data intake, tests, deployment checks, and project memory.
- Memory policy: LLM Wiki files are primary (`README.md`, `MEMORY.md`, `TASKS.md`, `DECISIONS.md`, `RAG_INDEX.md`, `HANDOFF.md`). Existing RAG and `project_memory.json` files remain evidence/attachment libraries.

## Project

- Absolute path: `D:\Codex项目\财税项目`
- Production URL: `https://tax.heyaokeji.com`
- GitHub: `https://github.com/chattonytliang-prog/Tax-check-project`
- Cloudflare project: `tax-check-project`
- D1 database: `tax-check-db`
- Stack: React 19, TypeScript, Vite, Cloudflare Pages Functions, Cloudflare D1, DeepSeek API, Vitest.

## Current Verified State

- Latest commit: `ea200bf Attach intake metadata to assistant uploads`
- Previous key commit: `89351a0 Add full tax data intake foundation`
- Branch status at handoff: `main...origin/main`
- Production health: `/api/health` returned `{"ok":true,"database":"connected","clients":9,"reports":4,"riskResults":17}`
- Production assets: `index-7pXwohZj.js` / `index-JOpt4TN7.css`

## Current Git Worktree

Expected untracked user files/directories, do not commit unless the owner explicitly asks:

- `docs/代理记账公司合作沟通话术.docx`
- `docs/代理记账公司需求沟通话术.docx`
- `docs/客户资料准备与导入确认清单.docx`
- `客户真实案例资料/`
- `流程图/`

No tracked code changes were pending at the moment this handoff was prepared except this documentation handoff update.

## Completed Recently

- Refactored deterministic core libraries and raised `src/lib/*.ts` coverage gate to 100% statements, branches, functions, and lines.
- Fixed unsafe financial import mappings found from real customer Excel data. Account codes, statement row numbers, bank balances, and employee compensation liabilities must not become unrelated tax-risk fields.
- Added full source-backed tax data intake schema in `migrations/0008_full_tax_data_intake.sql`.
- Added `functions/api/_tax_data_schema.js` and migration support for `0008`.
- Added assistant business write tool `save_standardized_tax_data`.
- Added deterministic intake classifier and period detector in `src/lib/intakeClassifier.ts`.
- Read-only audited 9 real Beijing customer materials locally; files were classified by type and period without committing customer data.
- Connected assistant upload metadata to AI context and backend source-file normalization: `documentType`, confidence, source system, period type, period start/end, period evidence, and specialized-parser requirement now flow into standard intake saves.
- Synced RAG Markdown and JSON mirrors after `ea200bf`.

## Current In Progress

- Full-version data intake is underway, not MVP.
- The foundation exists: schema, classifier, period detection, assistant write boundary, and upload metadata.
- Specialized parsers still need to be built for actual row-level standard records and evidence.

## Next Steps

Recommended next parser batch:

1. Payroll workbook parser.
2. IIT withholding workbook parser.
3. Account balance workbook parser.
4. Financial statement workbook parser.
5. VAT return main/schedule parser, including PDF/source text when possible.
6. Invoice list workbook parser.
7. Ledger parser.

For each parser:

- Preserve original material metadata.
- Create standard records.
- Create field evidence.
- Flag conflicts instead of overwriting silently.
- Require user/host confirmation before writing confirmed business data.
- Run `npm run test -- --run`, `npm run coverage`, `npm run build`, `npm run lint`, and `git diff --check`.

## Product And Business Rules

- The product should eventually let a customer drop files into the AI assistant and say natural-language commands such as "help me import this".
- The AI assistant can understand user text, classify files, ask missing questions, save cleaned business data through host tools, run basic checks, run professional risk detection, and trigger report generation.
- The UI should stay simple; do not add visible complexity unless needed. Improve the backend agent capability and deterministic rules first.
- Filing-style basic checks should follow official tax filing structures and tax bureau forms. Use only official or quasi-official sources for tax-form structure research.
- Professional hidden-risk analysis is an extra layer beyond basic filing checks and must remain deterministic/rule-backed.

## AI Write Boundary

AI may write only through whitelisted host tools after clear user authorization in natural language.

Allowed business-write areas:

- Client/company profile data.
- Source material metadata.
- Cleaning drafts.
- Period data.
- Standardized tax intake records.
- Customer memory.
- Import audit logs.

Protected read-only areas:

- Tax rule library.
- Risk rule library.
- Rule formulas and thresholds.
- Report core templates and deterministic logic.
- Users and authentication.
- Database schema design.
- Source code.

Blocked actions must be rejected and audited. AI must not modify the rule library or pretend to have changed rules.

## Forbidden Operations Without Explicit Owner Approval

- Restarting `automation-6` or relying on old automation threads.
- Deleting, committing, or publishing real customer materials.
- Committing the three user Word documents listed above.
- Deleting duplicate/polluted production test data.
- Changing authentication, user permissions, database schema, or D1 production data manually.
- Changing real tax business rules or filing logic without source-backed confirmation.
- Large UI rewrites or removing core functions.
- Letting AI automatically write real business data without user authorization.
- Storing secrets, API keys, Cloudflare tokens, or customer sensitive data in Git/RAG/Wiki.

## Verification Results From Latest Development Batch

- `npm run test -- --run`: 21 files passed, 160 tests passed.
- `npm run coverage`: 100% statements, 100% branches, 100% functions, 100% lines for the configured deterministic core scope.
- `npm run build`: passed; generated `index-7pXwohZj.js` and `index-JOpt4TN7.css`.
- `npm run lint`: passed.
- `git diff --check`: passed with only Windows CRLF warnings.
- Production polling confirmed `https://tax.heyaokeji.com` serves `index-7pXwohZj.js` and health endpoint is connected.

## RAG And Evidence Locations

- Baidu RAG: `D:\BaiduSyncdisk\Codex RAG 知识库`
- Local RAG mirror: `D:\Codex项目\Codex RAG 知识库`
- Main compressed context: `10_税务工具4_当前上下文压缩.md`
- Compatibility memory: `project_memory.json`
- Official tax filing structure evidence exists under the RAG tax-bureau structure library indexed by `RAG_INDEX.md`.

## New Thread Startup Instructions

The new task must begin with read-only verification:

1. Read `README.md`, `MEMORY.md`, `TASKS.md`, `DECISIONS.md`, `RAG_INDEX.md`, and `HANDOFF.md`.
2. Read both RAG mirrors' `10_税务工具4_当前上下文压缩.md` and `project_memory.json`.
3. Run:

```powershell
git -C D:\Codex项目\财税项目 status --short --branch
git -C D:\Codex项目\财税项目 log -5 --oneline
```

4. Check production health and asset names.
5. Report current state, next step, risks, and missing information.
6. Do not modify code, commit, deploy, operate database/auth, or let AI write real business data until the owner gives a new explicit instruction.
