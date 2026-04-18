# mcpx-integration-fix - Design Document

## Overview

The goal of this design is to shift `epochcli` from a hybrid MCP/MCPX tool model to an **exclusive MCPX** architecture. By utilizing `mcpx` as the sole interface for MCP servers, we eliminate redundant tool schemas, reduce prompt size, and provide a standardized environment for CLI-based tool composition (pipes, redirects, etc.). This design also ensures that all project-specific tools provide narrative guidance consistent with the `mcpx` invocation syntax.

## Architecture

The system will transition to a pull-based capability discovery model:
1. **Tool Registration**: `epochcli` checks if `mcpx` is enabled. If so, it registers only the `mcpx` tool and explicitly suppresses the registration of individual MCP server tools.
2. **Execution**: The agent calls `mcpx <server> <command>`. `epochcli` executes this as a shell command.
3. **Guidance Loop**: Project tools (`spec`, etc.) detect or default to recommending `mcpx` syntax in their "Next Step" outputs.
4. **Self-Correction**: `mcpx` execution in `epochcli` captures `stderr` and non-zero exit codes, returning them to the agent to trigger automatic parameter correction.

## Components and Interfaces

### 1. Epoch CLI (`packages/epochcli`)
- **`src/session/prompt.ts`**: Update `resolveTools` logic to strictly exclude standard MCP tools when `mcpx` is enabled.
- **`src/mcp/index.ts`**:
    - Remove hardcoded host paths.
    - Update `mcpx` tool `execute` to return a structured error response (stderr + exit code) if the process fails.
    - Log full shell commands for debug observability.

### 2. Spec CLI (`spec`)
- **`src/features/shared/SpecManager.ts`**: Update the `nextSteps` generator to prefix commands with `mcpx spec`.

### 3. Project Map CLI (`project-map-cli`)
- **`src/project_map_cli/cli/main.py`**: Update `click.echo` breadcrumbs to recommend `mcpx project-map-cli pm_status` etc.

### 4. Ground Truth CLI (`ground-truth-cli`)
- **`src/index.ts`**: Update the `gt_status` response to recommend `mcpx ground-truth-cli gt_exec scan .`.

### 5. E2E Test Harness (`e2e_testing/harness`)
- **`src/WorkspaceBuilder.ts`**: Ensure `.config/mcpx/config.toml` is correctly generated.
- **`Dockerfile.eval`**: Pre-install `mcpx-go`, `spec`, and `ground-truth-cli` from local sources to ensure binary availability.

## Data Models

No new data models are required. The existing `TestConfig` interface in the harness has already been extended to include the `epochcli` configuration block.

## Error Handling

- **MCPX Failures**: If `mcpx` returns an exit code > 0, the tool output will include:
  `Error (Exit [code]): [stderr content]`
  This enables the agent to see usage errors (e.g., missing required flags) and fix them.
- **Missing Binary**: If `mcpx` is not in the `PATH`, the system will log a warning and fall back to no MCP tools (as standard tools are suppressed).

## Testing Strategy

- **Manual Verification**: Run `epochcli run "sc_status"` locally with `mcpx` enabled and verify only the `mcpx` tool is available in the logs.
- **Automated E2E**: 
    - Re-enable `mcpx` in `e2e_testing/harness/test_config_single.json`.
    - Run `bun src/index.ts --config test_config_single.json --iterations 2`.
    - Verification: The `eventbus-v2` test must pass, and the `run.log` must show the agent successfully using `mcpx spec ...` commands.
