# rebrand-epoch-cli - Testing Plan

## User Testing Scenarios

1.  **Fresh Install**: Verify the installer (if applicable) uses the new binary name.
2.  **Environment Variable Check**: Ensure setting `EPOCH_BIN_PATH` is respected.
3.  **Cross-Platform Binary**: Confirm that the generated binaries are named `epoch` (or `epoch.exe`) across Linux, macOS, and Windows.

## Automated Test Suites

1.  **Monorepo Typecheck**: `bun run typecheck` across the whole monorepo.
2.  **SDK Unit Tests**: `bun run test` in `packages/sdk/js`.
3.  **CLI Unit Tests**: `bun run test` in `packages/epoch`.
4.  **E2E Tests**: `bun run test:e2e` in `packages/app`.

## Acceptance Criteria

- No "opencode" strings remaining in source code (excluding necessary third-party package names like `opencode-gitlab-auth`).
- All binaries produced are named `epoch`.
- All `OpencodeClient` references in the code are replaced with `EpochClient`.
