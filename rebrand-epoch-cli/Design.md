# rebrand-epoch-cli - Design Document

## Overview

This design outlines the final phase of rebranding from "epochcli" to "Epoch CLI". While major directories have been renamed, internal code symbols (classes, functions), environment variables, and some documentation still reference the old brand.

## Architecture

The rebranding affects three main layers:
1.  **SDK Layer (`packages/sdk`)**: Renaming generated and manual client/server classes and functions.
2.  **CLI Layer (`packages/epoch`)**: Updating environment variables and binary path logic.
3.  **Application Layer (`packages/app`)**: Updating SDK imports and usage.

## Components and Interfaces

### SDK Renaming
- `EpochClient` -> `EpochClient`
- `createEpochClient` -> `createEpochClient`
- `createEpochServer` -> `createEpochServer`
- `createEpochTui` -> `createEpochTui`

### CLI Environment Variables
- `EPOCHCLI_BIN_PATH` -> `EPOCH_BIN_PATH` (with backward compatibility if needed, though not requested).

### Binary Packaging
- Rename `epochcli` binary to `epoch` in build scripts and templates.

## Data Models

No changes to underlying data structures, only to the names of the classes and interfaces that interact with them.

## Error Handling

Ensure that renaming symbols does not break error reporting or logs that might still be looking for "epochcli" strings.

## Testing Strategy

1.  **Static Analysis**: Ensure the monorepo typechecks after renaming.
2.  **Unit Tests**: Update tests to use the new symbols and verify they still pass.
3.  **Integration/E2E Tests**: Verify the CLI still starts and communicates with the server using the new binary names and environment variables.
