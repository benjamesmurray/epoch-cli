# mcpx-integration-fix - Implementation Plan

Detailed tasks for a new session to implement the exclusive MCPX integration and guidance updates.

## Phase 1: Core Epoch CLI Fixes

- [ ] 1.1 **Standardize MCPX Execution**:
    - Files: `packages/epochcli/src/mcp/index.ts`
    - Logic: Use "mcpx" from PATH instead of hardcoded host paths. (Already partially applied, but verify consistency).
    - Logic: Capture and return `stderr` + exit code in the tool output if `res.code !== 0`.
    - Requirement Reference: Portable Execution, Error Transparency.

- [ ] 1.2 **Exclusive Tool Registration**:
    - Files: `packages/epochcli/src/session/prompt.ts`, `packages/epochcli/src/tool/registry.ts`
    - Logic: Ensure `ToolRegistry` and `SessionPrompt` strictly suppress individual MCP server tools when `mcpx` is enabled.
    - Requirement Reference: Exclusive MCPX Tooling.

- [ ] 1.3 **Verify Effect-TS Service Provision**:
    - Files: `packages/epochcli/src/session/prompt.ts`
    - Logic: Verify `Config.defaultLayer` is properly provided to avoid `Service not found: @epochcli/Config`.
    - Requirement Reference: Reliability.

## Phase 2: Project Guidance Updates

- [ ] 2.1 **Spec CLI Guidance**:
    - Files: `mcp-spec-cli/src/features/shared/SpecManager.ts`
    - Logic: Update the `nextSteps` generator to prefix all commands with `mcpx mcp-spec-cli`.
    - Requirement Reference: Narrative & Guidance Updates.

- [ ] 2.2 **Project Map Guidance**:
    - Files: `project-map-cli/src/project_map_cli/cli/main.py`
    - Logic: Update `click.echo` breadcrumbs to use `mcpx project-map-cli` syntax.
    - Requirement Reference: Narrative & Guidance Updates.

- [ ] 2.3 **Ground Truth Guidance**:
    - Files: `ground-truth-cli/src/index.ts`
    - Logic: Update the `gt_status` response to recommend `mcpx ground-truth-cli gt_exec scan .`.
    - Requirement Reference: Narrative & Guidance Updates.

## Phase 3: Infrastructure & Harness Fixes

- [ ] 3.1 **Docker Image Build Verification**:
    - Action: Run `./build-image.sh` in `e2e_testing/harness`.
    - Verification: Ensure `mcpx-go`, `mcp-spec-cli`, and `ground-truth-cli` (with fixed `bin` field) are available in the image.
    - Requirement Reference: Docker E2E Stability.

- [ ] 3.2 **Workspace Builder Completion**:
    - Files: `e2e_testing/harness/src/WorkspaceBuilder.ts`
    - Logic: Ensure the `.config/mcpx/config.toml` is generated correctly for all three project servers.
    - Requirement Reference: Docker E2E Stability.

## Phase 4: Final Validation

- [ ] 4.1 **Re-enable MCPX in E2E**:
    - Files: `e2e_testing/harness/test_config_single.json`
    - Action: Set `"mcpx": { "enabled": true }` and remove the manual `mcp` overrides.
    - Requirement Reference: eventbus-v2 E2E test passes.

- [ ] 4.2 **Run Iterations**:
    - Action: `bun src/index.ts --config test_config_single.json --iterations 2`.
    - Verification: Review `run.log` to confirm the agent is successfully composing commands like `mcpx mcp-spec-cli sc_init ...`.
    - Requirement Reference: CLI Composition Support.
