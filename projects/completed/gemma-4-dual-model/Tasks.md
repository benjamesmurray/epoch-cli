# gemma-4-dual-model - Task List

## Implementation Tasks

- [x] 1. **Implement Phase 2 Sanitization Middleware**
    - [x] 1.1. Create SanitizerMiddleware scaffold and fuzzy regex buffer
        - *Goal*: Create the `SanitizerMiddleware` class/module that can buffer a stream and use a fuzzy regex to detect mangled `</tool_call>` boundaries and implement bracket balancing.
        - *Files*: `packages/epochcli/src/session/sanitizer.ts`, `packages/epochcli/test/session/sanitizer.test.ts`
        - *Dependencies*: None
        - *Details*: This module should be completely decoupled from the orchestrator so it can be tested in isolation. It should expose a transform stream or generator.
        - *Requirements*: Agentic Output Integrity
    - [x] 1.2. Implement Structural Repair and Schema Validation
        - *Goal*: Add `jsonrepair` and `zod` validation to the `SanitizerMiddleware` pipeline after a tool call string is buffered.
        - *Files*: `packages/epochcli/src/session/sanitizer.ts`, `packages/epochcli/test/session/sanitizer.test.ts`
        - *Dependencies*: 1.1
        - *Details*: Apply Regex Cleaning (Stage 1), Structural Repair (Stage 2), and Schema Validation (Stage 3). If validation fails, yield the raw error for the standard feedback loop.
        - *Requirements*: Agentic Output Integrity
- [x] 2. **Integrate Middleware into the LLM Stream**
    - [x] 2.1. Pipe LLM Stream through Sanitizer
        - *Goal*: Modify the execution stream in `SessionProcessor` to pipe `llm.stream` through the new `SanitizerMiddleware`.
        - *Files*: `packages/epochcli/src/session/processor.ts`, `packages/epochcli/src/session/llm.ts`
        - *Dependencies*: 1.2
        - *Details*: Ensure the stream interception resolves silently without breaking the generator flow, replacing the malformed payload with the repaired one.
        - *Requirements*: Phase 2: Generation
- [x] 3. **Implement PromptBuilder Updates and Context Velocity**
    - [x] 3.1. Structure the Prompt Payload
        - *Goal*: Update prompt generation logic to construct and return a `ZoneStructuredPayload` instead of a flat string.
        - *Files*: `packages/epochcli/src/session/prompt.ts`
        - *Dependencies*: None
        - *Details*: Ensure `zone1_critical_rules`, `zone2_context_files`, and `zone3_active_cursor` are distinctly built but can be easily stringified for the LLM execution.
        - *Requirements*: Positional Prompt Architecture
    - [x] 3.2. Implement Stateless Context Velocity and Wrap-Up Directive
        - *Goal*: Calculate Context Velocity using `promptTokens` from the `Message[]` chat history and inject the Wrap-Up Directive if approaching the 85% watermark.
        - *Files*: `packages/epochcli/src/session/processor.ts`, `packages/epochcli/src/session/prompt.ts`
        - *Dependencies*: 3.1
        - *Details*: Avoid I/O latency. Check the velocity against the max context window limit. If triggered, prepend the critical wrap-up instruction to `zone1_critical_rules`.
        - *Requirements*: Proactive Context Management
- [x] 4. **Implement Telemetry LoggingInterceptor**
    - [x] 4.1. Update Telemetry Event Schema
        - *Goal*: Update the internal types to match `EnhancedModelExecutionEvent`, adding `mainEpochId`, `clerkMicroEpochId`, and the new metrics (`json_repaired`, `wrap_up_triggered`).
        - *Files*: `packages/epochcli/src/util/log.ts` (or relevant metrics types file)
        - *Dependencies*: None
        - *Details*: Ensure the types are propagated to wherever generation events are emitted.
        - *Requirements*: Telemetry and Architectural Validation
    - [x] 4.2. Implement Truncation Logic for Logging
        - *Goal*: Build the `LoggingInterceptor` that clones the `ZoneStructuredPayload` and truncates `zone2_context_files` before serialization to disk.
        - *Files*: `packages/epochcli/src/util/log.ts`, `packages/epochcli/src/session/processor.ts`
        - *Dependencies*: 3.1, 4.1
        - *Details*: Hook this interceptor into the `SessionProcessor` so that it fires when `START_GENERATE` and `END_GENERATE` events are logged.
        - *Requirements*: Zone-Aware Payload Truncation
- [x] 5. **Orchestrate "Baton Pass" and "Fast Typer" Queue**
    - [x] 5.1. Implement UI-Blocking Queue for Phase 3
        - *Goal*: Modify `SessionProcessor` to implement a strict Queue/Lock that blocks new Phase 1 requests until the background Phase 3 completes.
        - *Files*: `packages/epochcli/src/session/processor.ts`
        - *Dependencies*: None
        - *Details*: If a user submits a prompt while Phase 3 (Archivist) is running, the processor must queue the request and wait for the `END_GENERATE` event from the Clerk.
        - *Requirements*: Orchestration Concurrency & "Fast Typer" Race Condition
    - [x] 5.2. Wire the 3-Phase Baton Pass
        - *Goal*: Wire `executeClerkPhase1`, `executeMainPhase2`, and `executeClerkPhase3` sequentially inside the orchestrator.
        - *Files*: `packages/epochcli/src/session/processor.ts`
        - *Dependencies*: 2.1, 3.2, 4.2, 5.1
        - *Details*: Ensure the independent tracking IDs (`mainEpochId`, `clerkMicroEpochId`) are correctly instantiated and passed into the LoggingInterceptor.
        - *Requirements*: The "Baton Pass" Event Loop

## Task Dependencies

  1.1 -> 1.2 -> 2.1
  3.1 -> 3.2
  4.1 -> 4.2
  2.1, 3.2, 4.2, 5.1 -> 5.2

## Estimated Timeline

- Task 1: 4 hours
- Task 2: 2 hours
- Task 3: 3 hours
- Task 4: 2 hours
- Task 5: 4 hours
- **Total: 15 hours**
