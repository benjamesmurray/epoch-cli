# rebrand-cleanup - Tasks

- [ ] 1. Update Scripts
  - [ ] 1.1 Replace 'opencode' with 'epochcli' in `packages/epochcli/script/postinstall.mjs`.
  - [ ] 1.2 Replace 'opencode' with 'epochcli' in `packages/epochcli/script/publish.ts`.
  - [ ] 1.3 Replace 'opencode' with 'epochcli' in `sdks/vscode/script/publish`.

- [ ] 2. Update NPM Dependencies
  - [ ] 2.1 Update `packages/epochcli/package.json` to rename dependencies from `opencode-*` to `epochcli-*` (e.g., `opencode-gitlab-auth` -> `epochcli-gitlab-auth`).
  - [ ] 2.2 Update root `package.json` (if applicable) for workspace dependencies.
  - [ ] 2.3 Run `bun install` to update `bun.lock` globally.

- [ ] 3. Update Editor Extensions
  - [ ] 3.1 Replace 'opencode' with 'epochcli' in `packages/extensions/zed/extension.toml`.
  - [ ] 3.2 Update VS Code metadata in `sdks/vscode/bun.lock` and `sdks/vscode/package.json`.

- [ ] 4. Code & Snapshots
  - [ ] 4.1 Update plugin imports from `opencode-*` to `epochcli-*` in `packages/epochcli/src/plugin/index.ts`.
  - [ ] 4.2 Update test snapshots in `packages/epochcli/test/tool/__snapshots__/tool.test.ts.snap` to reflect the new paths/names.

- [ ] 5. CLI Binary and Path References
  - [ ] 5.1 Update `packages/epochcli/bin/epochcli` to refer to `epochcli` binary and `EPOCHCLI_BIN_PATH` environment variables instead of `opencode`.

- [ ] 6. Verification
  - [ ] 6.1 Run a final global search (`grep -R "opencode" .`) to ensure no occurrences remain in tracked files.
  - [ ] 6.2 Execute `bun turbo build` to ensure the codebase builds successfully.
