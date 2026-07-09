# Tasks

## Current

- Keep the AI assistant page visually simple; improve backend agent capability and system rules instead of adding more visible controls.
- Expand assistant tool coverage from saving cleaning drafts toward source material records, customer memory, basic compliance checks, professional risk detection, and report generation.
- Keep all assistant writes auditable.
- Continue official-only tax bureau form research before implementing full filing-field dictionaries.

## Done

- 2026-07-09: Added natural-language authorization for assistant business-data writes.
- 2026-07-09: Added backend rejection/audit path for attempted assistant rule-library writes.
- 2026-07-09: Added first-pass backend structures for assistant cleaning drafts, customer memories, and import audits.
- 2026-07-09: Added explicit assistant business write tools while preserving `save_current_draft` compatibility.
- 2026-07-09: Added self-healing creation of assistant business tables when `/api/assistant/tools` first writes cleaning drafts, customer memories, or import audits.
