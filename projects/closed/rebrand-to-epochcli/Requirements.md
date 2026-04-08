# rebrand-to-epochcli - Requirements Document

Rename all packages and occurrences of 'epochcli' to 'epochcli' (or '@epoch-ai' where applicable) to align with the new branding.

## Core Features

- Rename the root package and the core CLI package from `epochcli` to `epochcli`.
- Rename the `@epoch-ai` scope to `@epoch-ai` across all workspace packages and dependencies.
- Rename the core CLI directory from `packages/epochcli` to `packages/epochcli`.
- Update the binary name from `epochcli` to `epochcli`.
- Update environment variables starting with `EPOCHCLI_` to `EPOCHCLI_` (e.g., `EPOCHCLI_VERSION` -> `EPOCHCLI_VERSION`).
- Update default configuration filenames (e.g., `epochcli.json` -> `epochcli.json`) and directories (e.g., `.epochcli` -> `.epochcli`).
- Perform a global search and replace of "epochcli" with "epochcli", "Epoch CLI" with "EpochCLI", and "Epoch CLI" (display) with "Epoch CLI".
- Ensure consistency in naming: use `epochcli` (no hyphen) for technical identifiers (packages, directories, commands) and "Epoch CLI" for display text.

## User Stories

- As a developer, I want the project naming to be consistent with the "Epoch" brand so that it matches our project identity.
- As a user, I want to run the CLI using the command `epochcli` instead of `epochcli`.

## Acceptance Criteria

- [ ] All `package.json` files in the workspace use the new naming scheme (`epochcli` or `@epoch-ai/*`).
- [ ] The `packages/epochcli` directory is renamed to `packages/epochcli`.
- [ ] `turbo.json` and root `package.json` scripts are updated to reflect the new package and directory names.
- [ ] The built binary is named `epochcli`.
- [ ] Environment variables in the code and build scripts are updated to use the `EPOCHCLI_` prefix.
- [ ] The project builds and tests pass after the renaming.
- [ ] Documentation (READMEs, etc.) is updated to use "Epoch CLI" for display and `epochcli` for commands.

## Non-functional Requirements

- **Consistency:** The renaming should be applied consistently across the entire codebase to avoid confusion.
- **Precision:** Be careful not to rename "epoch" when it refers to the "task epoch" state in the spec workflow, unless it's explicitly part of the branding.
