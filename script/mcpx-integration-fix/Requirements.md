# mcpx-integration-fix - Requirements Document

Repair and verify the unified MCPX integration within epochcli, ensuring robust tool argument mapping, portable binary execution in Docker, and self-correction for LLM tool calls.

## Core Features

- **Exclusive MCPX Tooling**: Standardize tool calling to use the `mcpx` tool **exclusively**. Standard MCP server tool registration must be disabled when `mcpx` is active to eliminate redundancy and prompt bloat.
- **Portable Execution**: Remove all host-specific hardcoded paths from the `mcpx` tool handler.
- **Robust Argument Mapping**: Ensure LLM tool arguments and flags are correctly serialized into `mcpx` shell commands.
- **Error Transparency**: Return `stderr` and exit codes from failed `mcpx` calls back to the LLM to enable self-correction.
- **CLI Composition Support**: The agent should be guided to use shell composition (pipes, redirects) when calling `mcpx` (e.g., `mcpx github search-repositories | jq`).
- **Narrative & Guidance Updates**: Update the internal help text and "Next Step" breadcrumbs in `mcp-spec-cli`, `project-map-cli`, and `ground-truth-cli` to use the `mcpx <server> <command>` syntax.
- **Docker E2E Stability**: Ensure the `epochcli-eval-env` image and the test harness correctly configure `mcpx`.

## User Stories

- As an LLM Agent, I want to see a single `mcpx` tool instead of a bloated schema of multiple servers, so that I can discover and call tools more efficiently.
- As an LLM Agent, I want to receive detailed error messages when my `mcpx` syntax is wrong, so that I can correct my parameters and continue the task without looping.
- As an LLM Agent, I want the tool guidance to tell me exactly which shell command to run next (using `mcpx`), so I don't have to guess the syntax.
- As a Developer, I want the E2E tests to run reliably in Docker using the same `mcpx` configuration used in production.

## Acceptance Criteria

- [ ] `packages/epochcli` no longer registers individual MCP tools when `mcpx` is enabled.
- [ ] `packages/epochcli` no longer contains hardcoded paths to `/home/benmurray`.
- [ ] `mcpx` tool returns exit code and `stderr` to the model when a command fails.
- [ ] `mcp-spec-cli` "Next Step" output uses the `mcpx mcp-spec-cli ...` prefix.
- [ ] `project-map-cli` and `ground-truth-cli` help text uses `mcpx` examples.
- [ ] `WorkspaceBuilder` correctly generates `.config/mcpx/config.toml` in the Docker workspace.
- [ ] `eventbus-v2` E2E test passes with `mcpx` enabled in `test_config_single.json`.

## Non-functional Requirements

- **Efficiency**: Unified tool schema should significantly reduce prompt token usage (TOON advantage).
- **Reliability**: No `ReferenceError` or `Service not found` errors in the Effect-TS layer during tool resolution.
- **Observability**: All `mcpx` failures are logged with full command context in the debug logs.
