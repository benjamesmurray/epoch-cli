# rebrand-to-epochcli - Task List

## Implementation Tasks

- [x] 1. **Rename Packages and Directories**
    - [x] 1.1. Rename `packages/epochcli` directory to `packages/epochcli`.
        - *Goal*: Change the physical location of the core package.
        - *Requirements*: Rename the core CLI directory from packages/epochcli to packages/epochcli.
    - [x] 1.2. Update package names in `package.json` files.
        - *Goal*: Rename root and core packages to `epochcli`.
        - *Details*: Update root `package.json` and `packages/epochcli/package.json` to use "name": "epochcli".
        - *Requirements*: Rename the root package and the core CLI package from epochcli to epochcli.
    - [x] 1.3. Rename `@epoch-ai` scope to `@epoch-ai`.
        - *Goal*: Systematically update workspace scopes.
        - *Details*: Update all `package.json` files in the workspace (e.g., `@epoch-ai/sdk`, `@epoch-ai/util`).
        - *Requirements*: Rename the @epoch-ai scope to @epoch-ai across all workspace packages...
- [x] 2. **Update Code References and Imports**
    - [x] 2.1. Global search and replace imports.
        - *Goal*: Ensure TypeScript files point to the new package names.
        - *Details*: Replace `@epoch-ai/` with `@epoch-ai/`.
        - *Requirements*: Rename the @epoch-ai scope to @epoch-ai...
    - [x] 2.2. Update binary name and path.
        - *Goal*: Change the executable name to `epochcli`.
        - *Details*: Rename `packages/epochcli/bin/epochcli` to `packages/epochcli/bin/epochcli` and update the `bin` field in `package.json`.
        - *Requirements*: Update the binary name from epochcli to epochcli.
- [x] 3. **Rename Environment Variables and Flags**
    - [x] 3.1. Update `Flag` definitions.
        - *Goal*: Migrations of environment variable prefixes.
        - *Details*: Modify `packages/epochcli/src/flag/flag.ts`. Change all `EPOCHCLI_` prefixes to `EPOCHCLI_`.
        - *Requirements*: Update environment variables starting with EPOCHCLI_ to EPOCHCLI_.
    - [x] 3.2. Global search and replace env vars in code and scripts.
        - *Goal*: Replace all `EPOCHCLI_` occurrences with `EPOCHCLI_`.
        - *Requirements*: Update environment variables starting with EPOCHCLI_ to EPOCHCLI_.
- [x] 4. **Update Configuration and Branding**
    - [x] 4.1. Update default config paths.
        - *Goal*: Use `.epochcli` instead of `.epochcli`.
        - *Details*: Update paths in `packages/epochcli/src/config/paths.ts` and other config-related files.
        - *Requirements*: Update default configuration filenames... and directories...
    - [x] 4.2. Update branding in logs and documentation.
        - *Goal*: Replace "Epoch CLI" with "Epoch CLI" for display and "epochcli" for technical names.
        - *Details*: Audit `src` and documentation files for user-facing brand strings.
        - *Requirements*: Perform a global search and replace of "epochcli" with "epochcli", "Epoch CLI" with "EpochCLI", and "Epoch CLI" (display) with "Epoch CLI".
- [x] 5. **Validation and Build**
    - [x] 5.1. Run Full Workspace Build.
        - *Goal*: Verify build integrity with new names.
        - *Details*: `bun install && bun turbo build`.
        - *Requirements*: The project builds and tests pass after the renaming.
    - [x] 5.2. Run Core Tests.
        - *Goal*: Verify functional integrity.
        - *Details*: `bun turbo test:ci`.
        - *Requirements*: The project builds and tests pass after the renaming.

## Task Dependencies

- Task 1 must be completed first as it changes the physical structure.
- Task 2 depends on Task 1.
- Task 3 and Task 4 can be done in parallel.
- Task 5 is the final validation.
