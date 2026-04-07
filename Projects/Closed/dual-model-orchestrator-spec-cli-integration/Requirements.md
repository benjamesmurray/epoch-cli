# dual-model-orchestrator-spec-cli-integration - Requirements Document

The objective of this project is to integrate the `mcp-spec-cli` (v1.6.0) directly into the `DualModelOrchestrator` within the Epoch CLI application. This will allow the orchestrator to physically use the spec-cli for the Baton Pass workflow, extracting real project state rather than simulated mock state.

## Core Features

- **Direct MCP Client Integration:** Initialize an MCP client within the `DualModelOrchestrator` using `@modelcontextprotocol/sdk`.
- **Dynamic Spec Execution:** Spawn the `mcp-spec-cli@1.6.0` binary dynamically via the `StdioClientTransport`.
- **State Fetching:** Call the `sc_status` tool programmatically during Phase 1 (Pre-Generation) to fetch the actual Spec CLI state.
- **TOON Formatting:** Format the retrieved status using the existing `TOON.stringify` mechanism.
- **Graceful Failure:** Ensure that if the MCP client fails to start or fetch status, it falls back gracefully or reports an actionable error without crashing the main orchestrator loop.

## User Stories

- As the 4B Clerk model (Pre-Generation Phase), I want to retrieve the actual `sc_status` of the workspace so that I can accurately guide the 26B main generation model based on real requirements, designs, and tasks.
- As a user, I want the Dual Model Orchestrator to automatically understand my current project phase without me having to manually pass it in.

## Acceptance Criteria

- [ ] `DualModelOrchestrator` imports `@modelcontextprotocol/sdk/client` and related transport.
- [ ] `runPhase1` connects to `mcp-spec-cli@1.6.0` via `npx` (or local binary) and executes `sc_status`.
- [ ] The `mockState` in `runPhase1` is replaced with the real state returned by the `sc_status` MCP tool call.
- [ ] The application successfully builds and tests without breaking existing orchestrator functionality.

## Non-functional Requirements

- **Performance:** The initialization of the MCP client should be fast enough to not noticeably block the Pre-Generation phase.
- **Security:** The integration must not expose local system internals beyond what `mcp-spec-cli` is authorized to access.
- **Reliability:** Background process management of the `StdioClientTransport` must clean up properly and not leave zombie `node` processes.
