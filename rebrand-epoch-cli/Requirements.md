# rebrand-epoch-cli - Requirements Document

## Core Features

- Execute a widespread search-and-replace to rebrand "opencode" to "epoch" and "OpenCode" to "Epoch CLI" across the entire monorepo.
- Rename configurations, package names, binary endpoints, and documentation to reflect the new Epoch CLI brand.

## User Stories

- As a maintainer, I want the project to strictly reference "Epoch CLI" so the open source community adopts the new brand.

## Acceptance Criteria

- [x] Text references updated.
- [x] `packages/opencode` renamed to `packages/epoch`.
- [x] `.opencode` config dir renamed to `.epoch`.
- [x] Internal package dependency names and imports updated.
- [x] Monorepo successfully typechecks.

## Non-functional Requirements

- Maintain git history where possible.
- Ensure external upstream dependencies (like GitLab auth) are mapped correctly until they are also rebranded upstream.