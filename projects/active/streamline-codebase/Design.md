# streamline-codebase - Design Document

## Overview

The goal of this project is to streamline the Epoch CLI codebase by removing all non-essential components that are not required for the primary VSCode-driven and CLI TUI workflow. This involves a comprehensive cleanup of cloud infrastructure, alternative editor integrations, containerization pipelines, and legacy build configurations. Additionally, internal features within the CLI that depend on these removed services (specifically the "Share" functionality) will be stripped out to ensure a lean, local-first experience.

## Architecture

The streamlined architecture focuses on two main interfaces:
1.  **VSCode Extension:** The primary entry point for many users, interacting with the CLI via MCP.
2.  **CLI TUI:** The interactive terminal interface for direct user engagement.

Key architectural changes include:
-   **Local-Only Operation:** Removal of all Cloudflare/AWS infrastructure (`infra/`) and backend logic (`packages/function/`).
-   **Monolithic CLI Focus:** Consolidation of efforts onto `packages/epochcli`, with the removal of auxiliary packages like `@epoch-ai/slack` and `@epoch-ai/extensions/zed`.
-   **Build System Simplification:** Standardizing on Bun/Turbo and removing Nix-based build layers.

## Components and Interfaces

### 1. Root Directory Cleanup
-   **Workspaces:** Update `package.json` to exclude `packages/slack`, `packages/function`, and `packages/extensions/zed`.
-   **Configuration:** Remove `flake.nix`, `flake.lock`, and the `nix/` directory.
-   **Scripts:** Remove `script/sync-zed.ts`, `fix-migration.ts`, and `fix-shares.ts`.

### 2. Packages to be Removed
-   **`infra/`**: SST/Cloudflare configuration.
-   **`packages/function/`**: Cloud backend API and Durable Objects.
-   **`packages/slack/`**: Slack bot integration.
-   **`packages/extensions/zed/`**: Zed editor extension.
-   **`packages/containers/`**: Docker build pipelines.

### 3. Epoch CLI (`packages/epochcli`) Internal Cleanup
-   **Share Logic:** Remove `src/share/share-next.ts` and associated SQL/logic in `src/session/`.
-   **TUI UI:**
    -   Remove "Share session", "Copy share link", and "Unshare session" commands from the command palette in `src/cli/cmd/tui/routes/session/index.tsx`.
    -   Remove the share URL display from the sidebar in `src/cli/cmd/tui/routes/session/sidebar.tsx`.
    -   Clean up share-related tips in `src/cli/cmd/tui/feature-plugins/home/tips-view.tsx`.
-   **SDK/LSP:** Audit and remove references to cloud endpoints if they are hardcoded.

## Data Models

-   **Session Model:** The `Session` type in `packages/epochcli/src/session/schema.ts` (and related SQL files) will have the `share` field removed.
-   **Database:** Migrations or direct edits to `schema.sql.ts` to remove share-related tables/columns if applicable.

## Error Handling

-   **Removed Features:** Any attempts to access removed features (e.g., via old configuration files) should fail gracefully with a "Feature no longer available" message or simply be ignored if the configuration keys are removed.
-   **Build Integrity:** The primary "error handling" during this phase is ensuring that the removal of these packages does not break the dependency graph for the VSCode extension or the TUI.

## Testing Strategy

1.  **Dependency Validation:** Run `bun turbo typecheck` to ensure no remaining code imports the deleted packages.
2.  **Build Verification:** Run `bun run build` to confirm the production bundle for the CLI and VSCode extension can still be generated.
3.  **TUI Manual Walkthrough:** Launch the TUI and verify that all "Share" related UI elements are gone and that core chat/tool functionality remains intact.
4.  **E2E Regression:** Run existing tests in `e2e_testing/` to ensure the core agentic loop is unaffected by the cleanup.
