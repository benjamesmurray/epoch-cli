# E2ETestBed - Design Document

## Overview

The `E2ETestBed` is a transition from fragile Bash scripts to a robust TypeScript-based harness powered by Bun. It coordinates LLM agent execution, imposes strict process boundaries, and intelligently analyzes execution traces to extract actionable variance metrics. The test harness tooling itself will reside in `/home/benmurray/Projects/cli/e2e_testing/harness`. To prevent confusion and state pollution with the main CLI codebase, the harness will spawn and execute agents inside a completely isolated sandbox directory: `/home/benmurray/Projects/epochclievaluations`. This sandbox will be bootstrapped with its own `epochcli` configuration files and MCP server definitions.

## Architecture

The system follows a standard Test Harness -> Runner -> Reporter architecture:
1. **Workspace Bootstrapper**: Sets up the `.epochcli` configurations in the `/home/benmurray/Projects/epochclievaluations` evaluation directory to ensure the agent has access to `mcp-spec-cli`, `project-map-cli`, etc.
2. **Config Loader**: Reads `test_config.json` containing the prompts, iterations, and active agents.
3. **Process Manager (Runner)**: Spawns the agent as a child process using `bun spawn` targeting the local `epochcli` binary. Crucially, it sets the `cwd` (Current Working Directory) to the isolated `/home/benmurray/Projects/epochclievaluations` sandbox. Attaches standard I/O streams to local file loggers.
4. **Supervisor / Heuristics Engine**: Monitors the stream and time elapsed. If an infinite loop is detected or a timeout threshold is reached, it sends `SIGKILL`.
5. **Evaluator**: Once the run exits, executes `bun test` in the generated workspace and parses the log to evaluate Spec CLI tool usage.
6. **Reporter**: Aggregates the `RunResult` objects into `MarkdownReporter` and `JsonReporter` formats.

## Components and Interfaces

- `TestHarness (index.ts)`: The entry point that orchestrates the execution matrix (Iterations X Configurations).
- `AgentRunner`: A class that encapsulates `spawn()`. Exposes `start()`, `abort()`, and returns a `Promise<ExecutionTrace>`.
- `HeuristicsEngine`:
  - `detectInfiniteLoop(trace: string): boolean` (Uses regex or string matching to find 3+ identical tool invocations in a row).
  - `detectSpecCliUsage(trace: string): boolean` (Looks for `sc_init`, `sc_todo_start`, etc.).
- `TestEvaluator`: Runs `bun test` on the generated output and returns a boolean pass/fail flag.

## Data Models

```typescript
interface TestConfig {
  id: string;
  iterations: number;
  timeoutMs: number;
  agentCommand: string;
  prompt: string;
  expectedTools: string[];
}

interface RunResult {
  runId: string;
  iteration: number;
  durationMs: number;
  status: "Success" | "Failed_Tests" | "Killed_Timeout" | "Killed_Loop" | "Error";
  usedExpectedTools: boolean;
  logPath: string;
}
```

## Error Handling

- **Subprocess Hangs**: The `AgentRunner` uses `setTimeout` tied to `AbortController` signaling. If it triggers, it forces a process kill and tags the run as `Killed_Timeout`.
- **Infinite Tool Loops**: The `HeuristicsEngine` scans tail logs asynchronously. If a looping pattern is detected, it raises a `LoopException` caught by the `AgentRunner`, tagging it `Killed_Loop` and killing the child process.
- **Corrupted Output**: If `bun test` fails to run because the directory doesn't exist, it gracefully catches `ENOENT` and marks `Failed_Tests`.

## Testing Strategy

- **Self-Testing**: Unit tests will run the `HeuristicsEngine` against known "bad" agent logs (saved in `test/fixtures/`) to ensure loop detection accurately trips.
- **Mock Processes**: The `AgentRunner` will be tested using a dummy Node script that deliberately hangs (simulating a timeout) or loops `console.log("tool_call")` to verify kill resilience.