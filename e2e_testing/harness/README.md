# Epoch CLI Test Harness Execution Engine

This sub-directory contains the TypeScript execution engine (`bun run src/index.ts`) for the end-to-end variance testing harness.

## Architecture

The harness is a multi-stage orchestration system designed to measure the performance, reliability, and variance of the Epoch CLI across multiple iterations of the same task.

### 1. Workspace Isolation (`WorkspaceBuilder`)
Every test run starts with a completely clean environment.
- **Docker Mode**: Creates a host directory and mounts it into a fresh `epochcli-eval-env` container.
- **Local Mode**: Uses a temporary directory on the host.
- **Context Injection**: Automatically populates `.epochcli/epochcli.jsonc` with the necessary provider and environment settings to connect the containerized agent to the host's LLM server.

### 2. Live Monitoring (`HeuristicsEngine`)
The harness streams the agent's output and applies real-time heuristics:
- **Loop Detection**: Kills the process if the agent invokes the same tool with the same arguments multiple times in a row (configurable threshold, default: 3).
- **JSON Repair Tracking**: Detects and logs when the internal middleware has to "bridge" or repair malformed model outputs.
- **Performance Metrics**: Captures Tokens Per Second (TPS), Time To First Token (TTFT), and total token counts for every turn.
- **Tool Validation**: Tracks which tools were actually invoked versus the `expectedTools` list in the configuration.

### 3. Evaluation (`TestEvaluator`)
After the agent finishes its task, the harness enters the evaluation phase:
- It executes `bun test` (or a specified test runner) within the target workspace.
- A run is only marked as `Success` if the agent completes AND the resulting code passes all functional tests.

### 4. Evidence & Reporting
The harness generates a comprehensive audit trail for every run in `e2e_testing/results/suite_[timestamp]/`:
- **`run.log`**: The full combined stdout/stderr of the execution.
- **`initial_payload.json`**: The exact prompt and tool definitions sent to the model on the first turn.
- **`prompts.json`**: The full conversation history (all turns) with exact prompt content.
- **`variance_report.md`**: A summary report aggregating metrics (TPS, TTFT, Duration, Status) across all iterations for statistical analysis.

## Log Analysis & Diagnostics

For deep-dive analysis of a specific run (e.g., diagnosing thinking loops or function calling failures), two diagnostic tools are available:

### 1. Epoch Log Analyzer (Recommended)
A robust, turn-aware diagnostic tool that audits intervention efficacy and composition failures.
- **Location**: `epoch-log-analyzer/`
- **Features**: Detects Streaming Loop abortions, Phase Stagnation nudges, and MCPX Composition failures (invalid params, unknown arguments).
- **Usage**:
  ```bash
  cd epoch-log-analyzer
  bun run src/index.ts <path_to_run.log>
  ```

### 2. Quick Summary Utility
A lightweight script for a fast, turn-by-turn overview of the execution flow.
- **Location**: `e2e_testing/harness/summarize_log.cjs`
- **Usage**:
  ```bash
  node summarize_log.cjs <path_to_run.log>
  ```

## Container Specifications

The tests run inside ephemeral Docker containers (`epochcli-eval-env`) built via `build-image.sh`. The container environment simulates a clean, isolated local developer machine with the following specs:

- **Base OS**: Debian Bookworm (`node:22-bookworm`)
- **Runtime Dependencies**: Node.js v22, Bun (latest), Python 3 + pip, Git.
- **Offline MCP Servers**: `ground-truth-cli`, `mcp-spec-cli`, and `project-map-cli` are pre-installed.
- **Baseline Context Files**: Baked-in `.assistant_rules.toon`, `AGENTS.md`, and `.editorconfig`.
- **Memory Limits**: Bounded by the `memoryLimit` specified in `test_config.json` (e.g., `4g`).
- **Host Codebase**: The entire CLI codebase is mounted read-only (`:ro`) into the container at `/cli`. This allows the agent to run the absolute latest code without needing to rebuild the Docker image.

## Configuration (`TestConfig`)

Scenarios are defined in JSON files (e.g., `test_config.json`, `thinking_config.json`):

```json
{
  "id": "refactor-task",
  "iterations": 5,
  "timeoutMs": 120000,
  "prompt": "Refactor the session management system...",
  "expectedTools": ["sc_init", "sc_plan"],
  "runTargetDir": ".",
  "docker": {
    "imageName": "epochcli-eval-env:latest",
    "network": "host",
    "memoryLimit": "4g"
  }
}
```

## Launching from Host

The harness itself runs on the *host* machine:

```bash
# Run the default test suite
bun run src/index.ts

# Run a specific config with iteration override
bun run src/index.ts --config thinking_config.json --iterations 3

# Capture initial payloads quickly by aborting as soon as the model is invoked
bun run src/index.ts --abort-on-generate
```
