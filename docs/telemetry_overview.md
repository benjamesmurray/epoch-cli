# Telemetry & State Analysis Overview

This document describes the structured telemetry system and the shared analysis architecture used to maintain agent continuity and performance tracking across the Epoch CLI workspace.

## 1. Architecture

The system is split into two primary phases: **Emission** (Runtime) and **Aggregation** (Analysis).

### Emission (`SessionTelemetry`)
High-signal events are emitted as structured JSON-lines (`.jsonl`) to `~/.local/share/epochcli/log/*.telemetry.jsonl`. This stream is decoupled from the human-readable `.log` files to keep debugging logs clean while providing programmatic consumers with absolute data integrity.

### Aggregation (`@epoch-ai/util/telemetry`)
A shared library provides a unified `TurnAggregator` that consumes both JSONL events and legacy Logfmt strings. 

The `SessionAnalyzer` uses this library to produce two types of analysis:
1.  **Continuity Reports**: Single-epoch reports for context injection.
2.  **Global History Suite**: A project-level directory (`.history/`) maintained continuously during the session. It provides a human-readable, global view of all turns across all epochs and includes:
    - `timeline.toon`: Chronological trace of all actions.
    - `files.toon`: Exhaustive registry of all touched files (tracking standard file tools and `mcpx` file arguments).
    - `errors.toon`: Log of tool failures and state inconsistency warnings.
    - `intent.toon`: Longitudinal record of architectural intent.
    - `interrupted_state.toon`: The "hot-swap" memory (thought tails, partial buffers) from the immediate moment before the last epoch transition.

## 2. Event Schema

### Model Execution Events
Captured during every LLM interaction.

```json
{
  "timestamp": 1776942481041,
  "mainEpochId": "ses_abc123",
  "event": "START_GENERATE",
  "phase": "Phase 2",
  "activeAgent": "plan",
  "contextLimit": 16000,
  "toolCount": 14
}
```

```json
{
  "timestamp": 1776942485000,
  "event": "END_GENERATE",
  "metrics": {
    "promptTokens": 1200,
    "completionTokens": 450,
    "tps": 45.5,
    "ttftMs": 210,
    "json_repaired": false
  }
}
```

### Tool Execution Events
Captured for both internal and MCP tool calls.

```json
{
  "timestamp": 1776942482000,
  "sessionID": "ses_abc123",
  "event": "TOOL_START",
  "tool": "bash",
  "input": { "command": "spec sc_init --name my-project" }
}
```

```json
{
  "timestamp": 1776942483500,
  "event": "TOOL_END",
  "tool": "bash",
  "status": "completed",
  "output": "Project initialized..."
}
```

## 3. State Continuity Flow

The "Action Timeline" is the core mechanism that prevents state regression after context overflows (Epoch Transitions).

1.  **Extraction**: `SessionAnalyzer` uses the `TurnAggregator` library to process the `.telemetry.jsonl` file into hydrated `Turn` objects containing structured `ToolExecution` history.
2.  **High-Fidelity Timeline**: The analyzer produces a granular Action Timeline that includes tool inputs, raw error messages, and "Stall Hints" extracted from successful but blocked tool calls (e.g., requirement validation failures).
    - `Turn 9: Tool 'sc_plan' executed (...) -> Result: completed -> Hint: Please finish editing Requirements.md ...`
    - **Summarization**: Large tool outputs (>500 chars) are automatically summarized with a dense preview and total character count to prevent timeline bloat.
3.  **Semantic Mapping**: Generic tool calls are automatically mapped to high-level semantic actions during the aggregation phase using `ParserUtils.getSemanticToolName`. For example, `bash (spec sc_init)` becomes `sc_init`, and universal `mcpx` inputs are expanded to their targeted tools (e.g., `mcpx [spec.sc_plan]`).
4.  **Context Density**: To operate within a 32k window, `SessionAnalyzer` applies heuristic summarization to history:
    - **Recent Thoughts**: Reasoning blocks from the most recent turn (after the last user message) are preserved in full.
    - **Historical Thoughts**: Older reasoning blocks > 500 chars are summarized (First 150 ... [omitted] ... Last 150) to preserve architectural intent without consuming excessive tokens.
5.  **Continuity Synthesis**: This timeline and filtered thoughts are fed to the Clerk (local-side model), which generates a dense, structured **`.epoch-continuity.toon`** report and the `.history/interrupted_state.toon` recovery point.
6.  **Conversational Recovery**: In the next epoch, the context window is cleared and a new Task-Epoch begins. The system injects a concise, conversational user message that summarizes the rationale for the next action and provides **Signposts** pointing the agent to the detailed `.history/` suite for on-demand orientation.

## 4. Context Defense (Supervisor)

The supervisor model (Clerk) has an autonomous defense mechanism to ensure it never crashes due to context exhaustion:

- **90% Hard Cutoff**: The input prompt is programmatically checked against 90% of the model's context limit (using a conservative 4 chars/token heuristic).
- **Truncation**: If the limit is exceeded, the prompt is truncated, an explicit truncation error is appended to the prompt, and a `SUPERVISOR_CONTEXT_CUTOFF_TRIGGERED` error is logged to telemetry for audit.

## 5. Test Harness Integration

The e2e test harness uses the same `@epoch-ai/util/telemetry` logic via `HeuristicsEngine`. It polls the JSONL stream in real-time to:
- **Detect infinite loops**: 3+ identical tool calls with matching arguments.
- **Track JSON health**: Detects and logs when the internal middleware has to repair malformed model outputs.
- **Semantic Logging**: For better human-readable visibility, the harness extracts and logs semantic context for generic tools, while deduplicating redundant fallback entries:
    - **`bash`**: Logs the first 60 characters of the command (e.g., `🛠️ Tool Invoked: bash (node --version)`). Redundant fallback mentions of "bash" in raw logs are suppressed.
    - **`mcpx`**: Logs the targeted server and tool (e.g., `🛠️ Tool Invoked: mcpx [spec.sc_init]`).
- **Monitor workflow progression**: Verifies that specific workflow tools (e.g., `sc_approve`) were reached and tracks the adherence to the `spec` requirement-to-task flow.
- **Token Metrics**: Tracks real-time TPS, TTFT, and context window fullness.

## 6. Log Refinements (Human-Readable)

To maintain high signal-to-noise ratios in the main execution logs (`run.log`), several runtime refinements are applied:

- **Insightful Bus Logging**: The internal event bus (`packages/epochcli/src/bus/index.ts`) automatically summarizes event properties when logging at the `INFO` level.
- **Property Truncation**: High-frequency events like `message.part.delta` and `message.part.updated` include a sanitized preview of their payload (e.g., `delta="The user wants..."`). 
- **Safety**: Strings longer than 40 characters are truncated, and nested objects are replaced with `[Object]` to prevent log-bloat while preserving architectural visibility.

## 7. Maintenance

- **Adding Events**: Use `SessionTelemetry.emit()` or the helper `emitToolEvent()` / `emitModelEvent()` methods.
- **Updating Parsers**: Any change to `TurnAggregator` logic must be verified by running `bun test ./packages/util/test/telemetry/TurnAggregator.test.ts`.
