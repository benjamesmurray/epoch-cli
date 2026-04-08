# prompt-logging-utility - Requirements Document

A utility to provide a transparent view into how prompts are being sent to the local-main and local-side models, and trace execution phases for the dual-model-orchestration architecture.

## Core Features

- **Structured Logging:** Implement structured JSON logging for model prompt events (start, end, error) across different phases (Phase 1: Pre-Generation, Phase 2: Generation, Phase 3: Post-Generation). Events must be grouped by an `epochId` or `taskId`.
- **Model Tracing:** Explicitly capture which model (`local-main`, `local-side`, or standard provider models) is being called for each request.
- **Telemetry Metrics:** Capture Time-to-First-Token (TTFT), Tokens Per Second (TPS), and prompt token counts to verify TOON compression and zero-fluff optimizations.
- **Positional Prompt Capture:** Log the actual payloads sent to the LLMs. When truncating large payloads, heavily truncate the middle (Zone 2 - Rules/Context) while preserving the beginning (Zone 1 - Critical Data/Corrections) and the end (Zone 3 - Fact Repetition/Cursor Context) to verify accurate positional assembly.
- **Sanitization Tracing:** Log a specific flag (e.g., `json_repaired: true`) when the Phase 1 Janitor / Phase 2 Interceptor successfully repairs broken JSON output.
- **Log Parsing Utility:** Provide a CLI utility or programmatic parser that uses a strict state machine to read the structured logs and present a human-readable timeline trace of execution.
- **Sequential Verification:** Include an automated state-machine check to throw a concurrency violation if `local-main` and `local-side` model executions overlap (preventing compute contention).

## User Stories

- As a developer, I want to see the exact prompts sent to the local-side and local-main models, so that I can debug the dual-model orchestration logic and ensure context is passed correctly.
- As a tester, I want to parse execution logs into a clear timeline, so I can verify that execution phases happen sequentially without overlap.

## Acceptance Criteria

- [ ] Structured JSON logs are emitted when a model is invoked, containing phase, model ID, and request payload.
- [ ] A parser utility exists that can read these logs and output a sequence timeline.
- [ ] The parser utility can identify and flag if `local-main` and `local-side` models are executing concurrently.
- [ ] Existing `packages/script/src/log-parser.ts` and `packages/epochcli/src/util/log-parser.ts` are updated or consolidated to use this structured approach.

## Non-functional Requirements

- **Performance:** Logging should not significantly degrade the performance of prompt execution. Large prompt payloads may need to be optionally truncated.
- **Compatibility:** Must integrate seamlessly with the existing Vercel AI SDK wrappers (`wrapGenerate`, `wrapStream`) in `epochcli/src/session/llm.ts`.