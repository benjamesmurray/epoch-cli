# rebrand-cleanup - Design Document

## Overview
This design outlines the technical approach to removing the residual 'opencode' references from the `epochcli` repository. The goal is to enforce the naming conventions established in `branding.md`, particularly focusing on binaries, npm package names, plugins, and build artifacts.

## Architecture
The changes are strictly refactoring and text-replacement operations. The architectural boundaries, module structures, and package scopes (like `@epoch-ai/*`) remain unchanged.

## Components and Interfaces

### 1. Build and Publishing Scripts
- **Files:** `packages/epochcli/script/postinstall.mjs`, `packages/epochcli/script/publish.ts`, `sdks/vscode/script/publish`
- **Changes:** Replace `opencode` with `epochcli` in binary names, download URLs, tarball names, and VS Code `.vsix` file names.

### 2. NPM Plugins and Dependencies
- **Files:** `package.json`, `bun.lock`, `packages/epochcli/package.json`
- **Changes:**
  - Rename references to plugins from `opencode-gitlab-auth` to `epochcli-gitlab-auth` (or similar standard, if internal).
  - Rename `opencode-poe-auth` to `epochcli-poe-auth`.
  - Update `bun.lock` by running `bun install` after modifying `package.json` files.

### 3. Editor Extensions
- **Files:** `packages/extensions/zed/extension.toml`, `sdks/vscode/bun.lock`, `sdks/vscode/package.json`
- **Changes:** Update binary download URLs and package names to use `epochcli`.

### 4. Code and Snapshots
- **Files:** `packages/epochcli/src/plugin/index.ts`, `packages/epochcli/test/tool/__snapshots__/tool.test.ts.snap`
- **Changes:** Update imports from `opencode-*` plugins to `epochcli-*` plugins. Update test snapshots to reflect the new paths/names.

### 5. CLI Binary and Path References
- **Files:** `packages/epochcli/bin/epochcli`
- **Changes:** Update internal environment variable references (e.g., `OPENCODE_BIN_PATH` to `EPOCHCLI_BIN_PATH`) and binary targets.

## Data Models
No data models are changing.

## Error Handling
Ensure scripts gracefully handle the new `epochcli` binary names if they are missing or fail to download. Error messages containing "opencode" will be updated to "epochcli".

## Testing Strategy
1. **Dependency Sync:** Run `bun install` to ensure lockfiles are successfully updated without resolving errors.
2. **Build Test:** Run `bun turbo build` to verify the monorepo builds successfully.
3. **Regex Verification:** Run a final `grep -R "opencode"` to ensure zero occurrences remain in tracked files.
