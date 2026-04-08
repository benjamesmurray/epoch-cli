# rebrand-to-epochcli - Design Document

## Overview

The goal is to migrate the branding of the project from "Epoch CLI" to "EpochCLI". This involves renaming package names, scopes, directories, binaries, and environment variables to ensure a consistent brand identity across the entire codebase.

## Architecture

The rebranding is primarily a naming transformation and does not alter the underlying system architecture. However, it requires careful coordination to ensure that workspace dependencies and internal references remain functional during and after the transition.

## Components and Interfaces

### 1. Package Renaming
- **Core CLI Package:** Rename `packages/epochcli` to `packages/epochcli`.
- **Package Name:** Change `name` in `packages/epochcli/package.json` from `epochcli` to `epochcli`.
- **Root Package:** Change `name` in root `package.json` from `epochcli` to `epochcli`.
- **Scope Migration:** Rename `@epoch-ai` scope to `@epoch-ai`.
    - `@epoch-ai/plugin` -> `@epoch-ai/plugin`
    - `@epoch-ai/script` -> `@epoch-ai/script`
    - `@epoch-ai/sdk` -> `@epoch-ai/sdk`
    - `@epoch-ai/util` -> `@epoch-ai/util`
- **Dependency Updates:** Update all `package.json` files and TypeScript imports to use the new scope and package names.

### 2. Binary and CLI Entry Point
- **Binary Name:** Rename the executable from `epochcli` to `epochcli`.
- **Binary Path:** Update `packages/epochcli/package.json` to point to `./bin/epochcli`.
- **File Move:** Rename `packages/epochcli/bin/epochcli` to `packages/epochcli/bin/epochcli`.

### 3. Environment Variables
- **Prefix Change:** All environment variables starting with `EPOCHCLI_` will be renamed to `EPOCHCLI_`.
    - Example: `EPOCHCLI_VERSION` -> `EPOCHCLI_VERSION`.
- **Flag Definition:** Update `packages/epochcli/src/flag/flag.ts` to reflect these changes.

### 4. Filesystem and Configuration
- **Config Directory:** Change the default local configuration directory from `.epochcli` to `.epochcli`.
- **Config Files:** Update references to `epochcli.json` to `epochcli.json`.

## Data Models

No changes to data structures are expected, except for persisted configuration keys or directory paths that explicitly use the old "epochcli" name.

## Error Handling

Error messages, logs, and UI strings will be updated to refer to "EpochCLI" instead of "Epoch CLI" or "epochcli".

## Testing Strategy

- **Automated Tests:** After renaming, all unit and integration tests in the newly named `packages/epochcli` must pass.
- **Build Verification:** Run `bun turbo build` to ensure the monorepo build pipeline (now referencing `epochcli`) is intact.
- **Smoke Test:** Manually run the built `epochcli --version` to verify the binary rename and version reporting.
- **Search Verification:** Perform a final global grep for "epochcli" to ensure no accidental leftovers remain in critical paths.
