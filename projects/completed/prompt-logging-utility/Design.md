# prompt-logging-utility - Design Document

## Overview

The prompt-logging utility aims to trace the execution phases (Pre-Generation, Generation, Post-Generation) across local-main and local-side models. By leveraging the existing `Log` service in `epochcli`, we will emit structured JSON events at key points inside `packages/epochcli/src/session/llm.ts`. These structured logs can then be reliably parsed by a utility (`log-parser.ts`) to build a chronological timeline and detect compute contention (e.g., overlapping model executions).

## Architecture

The system consists of two parts:
1. **Emitter:** Inside `session/llm.ts`, the AI SDK's middleware (`wrapGenerate` and `wrapStream`) will be augmented to emit structured events using `Log.create({ service: "llm" })` or similar standard logging paths. We will trace `START_GENERATE` and `END_GENERATE` events along with context payloads. To support Task-Epoch architecture, events will include an `epochId`.
2. **Parser:** The existing `log-parser.ts` (currently found in `packages/script/src/log-parser.ts` and `packages/epochcli/src/util/log-parser.ts`) will be consolidated into a single robust utility. Instead of relying on string matching (`line.includes(...)`), it will parse each line as JSON, extract the event metadata, and construct a strict state-machine timeline to verify sequential execution.

## Components and Interfaces

### `session/llm.ts`
- **Hook points:** Within the middleware array passed to `wrapLanguageModel`.
- **Payload capture:** Intercept `transformParams` or `wrapStream` to log `prompt` and `messages`. 
- **Telemetry:** Capture TTFT, TPS, and prompt token metrics where available.
- **Truncation Logic:** Implement a smart truncation function that preserves Zone 1 (task/correction) and Zone 3 (fact repetition/cursor), while aggressively truncating Zone 2 (rules/context).
- **Sanitization Hooks:** Emit specific log flags when the `local-side` model successfully repairs broken JSON.

### `log-parser.ts`
- **CLI / Programmatic Interface:** Export a `parseSequentialLogs(logFile?: string)` function that processes standard Epoch CLI log output.
- **Strict State Machine:** The parser will track the exact phase and running model. If a `START_GENERATE` is detected for `local-main` while `local-side` is still active (or vice versa), an error will be flagged.

## Data Models

```typescript
interface EnhancedModelExecutionEvent {
  timestamp: number;
  epochId: string; 
  event: "START_GENERATE" | "END_GENERATE" | "ERROR";
  providerId: "local-main" | "local-side" | string;
  phase: "Phase 1" | "Phase 2" | "Phase 3";
  metrics?: {
    ttftMs?: number;
    tps?: number;
    promptTokens?: number;
  };
  payload?: any;
  json_repaired?: boolean;
}
```

## Error Handling

- **Logging Failures:** Emitting a log MUST NOT disrupt the application flow. Any `JSON.stringify` or serialization logic for payloads must be wrapped in `try/catch`.
- **Parser Robustness:** The log parser should gracefully skip lines that are not valid JSON or do not match the expected `ModelExecutionEvent` shape.

## Testing Strategy

- **Unit Tests:** Provide mock log files (one valid sequential, one with overlap) to `log-parser.test.ts` to ensure the overlap detection logic works correctly.
- **Integration Tests:** Trigger a dual-model orchestration flow and verify the resulting log file contains the expected structured events.
