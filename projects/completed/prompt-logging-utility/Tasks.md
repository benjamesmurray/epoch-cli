# prompt-logging-utility - Task List

## Implementation Tasks

- [ ] 1. **Phase 1: Foundation & Consolidation**
    - [x] 1.1. Define Telemetry Data Models
        - *Goal*: Define the strict TypeScript schema for telemetry logs.
        - *Details*: Create `EnhancedModelExecutionEvent` tracking `epochId`, `ttftMs`, `tps`, `phase`, and `json_repaired` as outlined in the Design.
        - *Files*: Add to `packages/epochcli/src/util/log.ts` (or an adjacent `telemetry.ts`).
        - *Requirements*: Model Tracing, Telemetry Metrics.
    - [x] 1.2. Consolidate Log Parser Utilities
        - *Goal*: Merge duplicate parsers into a single canonical file.
        - *Details*: Move necessary logic from `packages/script/src/log-parser.ts` into `packages/epochcli/src/util/log-parser.ts` and delete the script version.
        - *Files*: `packages/epochcli/src/util/log-parser.ts`, `packages/script/src/log-parser.ts` (to delete).
        - *Requirements*: Log Parsing Utility.

- [x] 2. **Phase 2: Emitter Implementation**
    - [x] 2.1. Implement Positional Truncation Logic
        - *Goal*: Create a utility to sanitize large prompts before logging.
        - *Details*: Extract Zone 1 (critical data/corrections) and Zone 3 (fact repetition), while aggressively truncating Zone 2 (middle context).
        - *Files*: Add helper in `packages/epochcli/src/session/llm.ts` or `packages/epochcli/src/util/log.ts`.
        - *Requirements*: Positional Prompt Capture.
    - [x] 2.2. Inject `START_GENERATE` and `END_GENERATE` hooks
        - *Goal*: Modify the AI SDK middleware to emit the structured JSON events.
        - *Details*: In `wrapGenerate` and `wrapStream`, log prompt sizes, start times, and calculate TTFT / TPS on end. Ensure `epochId` is included.
        - *Files*: Edit `packages/epochcli/src/session/llm.ts`.
        - *Requirements*: Structured Logging, Telemetry Metrics.
    - [x] 2.3. Add JSON Repair logging
        - *Goal*: Explicitly log when the interceptor uses the `local-side` model to repair broken JSON.
        - *Details*: Inside the error-handling block for broken tool calls (Phase 2), emit an event flagging `json_repaired: true`.
        - *Files*: Edit `packages/epochcli/src/session/llm.ts`.
        - *Requirements*: Sanitization Tracing.

- [x] 3. **Phase 3: Parser Implementation**
    - [x] 3.1. Implement Structured JSON Parsing
        - *Goal*: Read lines from the log stream/file and decode `EnhancedModelExecutionEvent` objects.
        - *Details*: Replace the `line.includes(...)` logic with `JSON.parse`. Safely ignore non-JSON or mismatched lines.
        - *Files*: Edit `packages/epochcli/src/util/log-parser.ts`.
        - *Requirements*: Log Parsing Utility.
    - [x] 3.2. Build the State-Machine Overlap Detector
        - *Goal*: Verify that the execution of `local-main` and `local-side` never overlap.
        - *Details*: Track the active `providerId` across the timeline. If a `START_GENERATE` arrives for one model while another is still active within the same `epochId`, throw a concurrency violation error.
        - *Files*: Edit `packages/epochcli/src/util/log-parser.ts`.
        - *Requirements*: Sequential Verification.

- [ ] 4. **Phase 4: Testing & Validation**
    - [x] 4.1. Unit Test Truncation Logic
        - *Goal*: Ensure Zone 1 and Zone 3 are preserved in payloads.
        - *Details*: Write a test passing a massive prompt and verifying the output shape.
        - *Files*: Edit `packages/epochcli/test/session/llm.test.ts`.
        - *Requirements*: Positional Prompt Capture.
    - [x] 4.2. Unit Test State-Machine Overlap Detection
        - *Goal*: Prove the parser correctly flags contentions.
        - *Details*: Create two mock log fixtures—one sequentially valid, and one containing overlapping `START_GENERATE` events—and verify the parser throws appropriately.
        - *Files*: Create `packages/epochcli/test/util/log-parser.test.ts`.
        - *Requirements*: Sequential Verification.

## Task Dependencies and Execution Order

The tasks are structured linearly and must be executed in the following order:
1. **Phase 1** must be completed first to establish the foundation and remove technical debt (duplicate files).
2. **Phase 2 (Emitter)** can then be built using the data models defined in Phase 1.
3. **Phase 3 (Parser)** relies on the structure emitted by Phase 2.
4. **Phase 4 (Testing)** validates both the emitter's truncation logic and the parser's state machine logic. tests for 4.1 can be written concurrently with Phase 2, and tests for 4.2 can be written concurrently with Phase 3, provided Test-Driven Development (TDD) is employed.