# 合耀科技税务合规工具

面向中小企业、代理记账公司和集团多主体项目的 AI 税务合规工作台。

## Project

- Local path: `D:\Codex项目\财税项目`
- Production: `https://tax.heyaokeji.com`
- GitHub: `https://github.com/chattonytliang-prog/Tax-check-project`
- Stack: React, TypeScript, Vite, Cloudflare Pages Functions, D1, DeepSeek API

## Product Direction

Core workflow:

1. Create or update a company profile.
2. Import and clean source materials from accounting software, spreadsheets, text, or uploaded files.
3. Save confirmed business data and period data.
4. Run filing-style basic compliance checks.
5. Run professional hidden-risk detection through deterministic rules.
6. Generate and explain reports.

## AI Agent Boundary

The AI assistant is a business-data operator:

- It can write business data through approved host tools after clear natural-language authorization from the user.
- It cannot write or change tax rules, risk rules, rule formulas, users, auth, database schema, or code.
- Business writes must be validated by the host app and recorded in audit logs.

## Memory

Long-term project memory is maintained in:

- `MEMORY.md`
- `TASKS.md`
- `DECISIONS.md`
- `RAG_INDEX.md`
- `HANDOFF.md`

Original RAG files, downloaded official tax materials, deployment logs, tests, and customer documents remain evidence sources.

## Current Handoff

- Latest verified commit: `ea200bf Attach intake metadata to assistant uploads`
- Production assets: `index-7pXwohZj.js` / `index-JOpt4TN7.css`
- Production health: `/api/health` returned D1 connected on 2026-07-10.
- Full handoff file: `HANDOFF.md`
- Automation remains paused. Do not restart `automation-6` unless the owner explicitly asks.
- Do not commit real customer materials, user Word documents, or the flowchart directory unless explicitly requested.

## Commands

```powershell
npm run test -- --run
npm run build
npm run lint
git diff --check
```
