# rebrand-cleanup - Requirements Document

## Overview
Cleanup residual 'opencode' references and align codebase with the new branding guidelines. We have established a `branding.md` standardizing naming conventions to `Epoch CLI`, `epochcli`, and `@epoch-ai` scopes.

## In-Scope
1. Find and replace remaining 46 `opencode` references across the repository to use `epochcli` where appropriate (especially in build scripts, `package.json`, `bun.lock`, and binary references).
2. Fix VS Code / Zed extension metadata and build scripts referencing `opencode`.
3. Standardize and cleanup dependencies pointing to `opencode-*` (like `opencode-gitlab-auth`).

## Out-of-Scope
- Major architectural changes.
- Renaming the `@epoch-ai` package scopes as this is considered standard per `branding.md`.

## Assumptions
- The 46 instances of `opencode` identified in `grep` searches are the primary target for cleanup.
- The project map is up-to-date.
