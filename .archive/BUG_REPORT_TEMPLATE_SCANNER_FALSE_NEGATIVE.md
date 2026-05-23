# BUG REPORT: False Negative in `sc_approve` Template Scanner

## Summary
The `sc_approve` tool is incorrectly blocking phase transitions by detecting "ghost" template tags in `Specification.md` and `Tasks.json`. Even after an agent has manually cleared all `<template-*>` tags and verified the file content via `grep` and `cat -A`, the programmatic scan in the `mcpx` orchestrator continues to return a `Template Validation Error`.

## Root Cause Analysis (Suspected)
The issue originates in `packages/epochcli/src/mcp/index.ts` within the `sc_approve` execution block (around line 740).

The current implementation:
1.  Scans the **entire** `projects/active` directory for `.md` files.
2.  Uses a simple `.includes("<template")` check on every file found.

### Identified Flaws:
1.  **Scope Creep:** It scans all active projects, not just the one currently being approved. If a *previous* project still has template tags, it blocks the *current* project from advancing.
2.  **Greedy Regex/Matching:** The `.includes("<template")` check is too broad and may catch partial strings or artifacts in the directory that aren't actually in the spec being approved.
3.  **No Path Specificity:** The scanner doesn't use the feature name or ID to narrow the search to the relevant project folder.

## Impact
- **Drafting Wall Hard-Lock:** Agents become stuck in infinite loops trying to "clean" files that are already clean.
- **Context Burn:** Agents waste 10-15 turns trying to debug the validation error, leading to context overflows (as seen in recent E2E runs).

## Proposed Fix
Update `packages/epochcli/src/mcp/index.ts` to:
1.  Extract the `feature` path from the `sc_approve` call or the spec status.
2.  Limit the `Glob.scan` to ONLY the specific project subdirectory.
3.  Refine the check to look for the specific `<template-specification>` and `<template-tasks>` tags rather than any string containing `<template`.

## Reproduction Steps
1. Initialize a project with `sc_init`.
2. Clear all template tags in `projects/active/<feature>/Specification.md`.
3. Create a second "dummy" project in `projects/active/` that still contains template tags.
4. Attempt to run `mcpx spec sc_approve` on the first (clean) project.
5. Observation: Validation fails despite the target file being clean.
