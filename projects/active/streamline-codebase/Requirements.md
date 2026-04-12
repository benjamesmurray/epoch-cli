# streamline-codebase - Requirements Document

Remove unused infrastructure, integrations, and build pipelines to streamline the codebase for a strictly VSCode-driven and CLI TUI workflow.

## Core Features

- **Infrastructure & Backend Removal:** Delete `infra/` and `packages/function/`.
- **Integrations & Extensions Removal:** Delete `packages/extensions/zed/`, `packages/slack/`, and associated scripts (e.g., `script/sync-zed.ts`).
- **Containerization Cleanup:** Delete `packages/containers/` and related Docker build scripts.
- **Nix Configuration Removal:** Delete `nix/`, `flake.nix`, and `flake.lock`.
- **Epoch CLI Streamlining:** Remove cloud-dependent features within `packages/epochcli/src/` (e.g., `src/share/share-next.ts`).
- **TUI UI Cleanup:** Remove cloud-related menu items, dialogs, and features (e.g., "Share" button) from the TUI.
- **Script Cleanup:** Remove specialized root-level scripts that are no longer relevant (e.g., `fix-migration.ts`, `fix-shares.ts`).
- **Project Configuration Update:** Update root `package.json` workspaces and `.gitignore`.

## User Stories

- As a developer, I want to remove all unused cloud-dependent and multi-platform infrastructure, so that the project is strictly focused on the local VSCode and TUI developer experience.

## Acceptance Criteria

- [ ] `infra/`, `packages/function/`, `packages/extensions/zed/`, `packages/slack/`, `packages/containers/`, and `nix/` are removed.
- [ ] Root scripts `script/sync-zed.ts`, `fix-migration.ts`, and `fix-shares.ts` are removed.
- [ ] `packages/epochcli/src/share/` and other cloud-dependent code are removed.
- [ ] The TUI no longer displays "Share" or cloud-related menu items/dialogs.
- [ ] Root `package.json` workspaces list is updated.
- [ ] The project builds and type-checks successfully (`bun turbo typecheck`).

## Non-functional Requirements

- The application must remain fully functional for local VSCode extension and TUI usage.
- No regressions in the core MCP server functionality or E2E testing harness.
