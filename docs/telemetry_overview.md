# Telemetry & State Analysis Overview

This document describes the structured telemetry system and the shared analysis architecture used to maintain agent continuity and performance tracking across the Epoch CLI workspace.

## 1. Architecture

The system is split into two primary phases: **Emission** (Runtime) and **Aggregation** (Analysis).

### Emission (`SessionTelemetry`)
High-signal events are emitted as structured JSON-lines (`.jsonl`) to `~/.local/share/epochcli/log/*.telemetry.jsonl`. This stream is decoupled from the human-readable `.log` files to keep debugging logs clean while providing programmatic consumers with absolute data integrity.

### Aggregation (`@epoch-ai/util/telemetry`)
A shared library provides a unified `TurnAggregator` that consumes both JSONL events and legacy Logfmt strings. This ensures that the CLI (for continuity reports) and the Test Harness (for metrics) interpret session state identically.

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
3.  **Semantic Mapping**: Generic tool calls (like `bash`) are automatically mapped to high-level semantic actions (like `sc_init` or `pm_query`) during the aggregation phase using `ParserUtils.getSemanticToolName`.
4.  **Continuity Synthesis**: This timeline is fed to the Clerk (local-side model), which generates a dense, structured **`.epoch-continuity.toon`** report.
5.  **Recovery**: In the next epoch, the report is injected into the system prompt. The agent uses the `residual_blockers` and `example_input` fields to immediately resolve issues that occurred before the transition.

## 4. Test Harness Integration

The e2e test harness uses the same `@epoch-ai/util/telemetry` logic via `HeuristicsEngine`. It polls the JSONL stream in real-time to:
- Detect infinite loops (3+ identical tool calls).
- Track token usage and context fullness.
- Verify that specific workflow tools (e.g., `sc_approve`) were reached.
- Monitor active intercepts for correct validation behavior.

## 5. Maintenance

- **Adding Events**: Use `SessionTelemetry.emit()` or the helper `emitToolEvent()` / `emitModelEvent()` methods.
- **Updating Parsers**: Any change to `TurnAggregator` logic must be verified by running `bun test ./packages/util/test/telemetry/TurnAggregator.test.ts`.
