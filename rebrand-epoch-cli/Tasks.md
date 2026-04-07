# rebrand-epoch-cli - Tasks

## Priority 1: SDK Rebranding
- [ ] Rename `OpencodeClient` to `EpochClient` in `packages/sdk/js/src/client.ts` and `v2/client.ts`.
- [ ] Rename `createOpencodeClient` to `createEpochClient` in `packages/sdk/js/src/client.ts` and `v2/client.ts`.
- [ ] Rename `createOpencodeServer` and `createOpencodeTui` in `packages/sdk/js/src/server.ts` and `v2/server.ts`.
- [ ] Update `packages/sdk/js/src/index.ts` and `v2/index.ts` to export new names.
- [ ] Update `packages/sdk/js/script/build.ts` to reflect the name change for code generation.

## Priority 2: CLI and Environment Variables
- [ ] Rename `OPENCODE_BIN_PATH` to `EPOCH_BIN_PATH` in `packages/epoch/bin/epoch`.
- [ ] Update `opencode` to `epoch` in build scripts (e.g., `packages/epoch/package.json`).
- [ ] Update documentation and error messages in `packages/epoch/bin/epoch`.

## Priority 3: Propagation and Cleanup
- [ ] Update all references in `packages/epoch/src` (CLI commands and core logic).
- [ ] Update all references in `packages/app/src` (UI components and context).
- [ ] Update all references in `packages/epoch/test` and `packages/app/e2e`.

## Verification
- [ ] Run `bun run build` in root.
- [ ] Run `bun run typecheck` in all packages.
- [ ] Run unit and E2E tests to verify functionality.
