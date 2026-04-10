# gemma-4-dual-model - Design Document

## Overview

The Gemma 4 (26B MoE) Coding Assistant architecture relies on a highly optimized, dual-model strategy to navigate around the strict context window limit (32K - 64K tokens) and to prevent VRAM exhaustion. It consists of two models:
1. **The Main Model (Gemma 4 26B):** Acts as the core reasoning and generation engine operating in "Stateful Task-Epochs."
2. **The Clerk Model (4B):** Acts as a router, formatter, and memory manager operating in "Stateless Micro-Epochs."

The system employs a "Baton Pass" event loop ensuring these models never execute concurrently. A Three-Stage Sanitizer Middleware is also introduced to intercept and correct structural JSON issues without impacting the core LLM execution loop.

## Architecture

The system is built upon a strict, three-phase "Baton Pass" sequential loop managed within the `SessionProcessor` and `LLM` modules.

1. **Phase 1: Pre-Generation (The Clerk)**
   - The 4B Clerk is instantiated to read TOON-compressed architectural files, execute RAG against Ground Truth rules, and assemble the Positional Prompt.
   - Outputs the optimized prompt and terminates immediately.
2. **Phase 2: Generation (The Main Model)**
   - The 26B Main Model receives the Baton.
   - It executes Stateful Execution, streaming code and tool calls (via `llm.stream`).
   - The stream is monitored by a Sanitzer Middleware.
3. **Phase 3: Post-Generation / The Archivist (The Clerk)**
   - The 4B Clerk boots up in the background to summarize Phase 2, update TOON files, and persist newly discovered Ground Truth rules.
   - Emits its END_GENERATE event and terminates.

### Orchestration Concurrency & "Fast Typer" Race Condition
To prevent VRAM contention and state desynchronization if a user types a new prompt while Phase 3 is executing in the background, the `Orchestrator` implements a strict Queue/Lock. It will block the UI (e.g., displaying a "Finalizing workspace..." loader) until Phase 3 completes and emits its `END_GENERATE` event before handing the GPU back to the Clerk for a new Phase 1 request.

### Proactive Context Management
The Phase 1 Clerk will compute "Context Velocity". Context Velocity is calculated statelessly during Phase 1 by reading `promptTokens` metadata appended to the standard `Message[]` chat history array, avoiding any I/O latency from log parsers. If the context approaches the 85% High Watermark, the Clerk injects a high-priority "Wrap-Up Directive" into the Main Model's Zone 1 prompt. 

## Components and Interfaces

### 1. `Orchestrator` / `SessionProcessor`
Coordinates the Baton Pass.
- `executeClerkPhase1(input): Effect<OptimizedPrompt>`
- `executeMainPhase2(prompt): Stream<LLMEvent>`
- `executeClerkPhase3(generationSummary): Effect<void>`

### 2. `SanitizerMiddleware`
Intercepts the Main Model's stream during Phase 2.
- Utilizes a fuzzy regex buffer for token detection to catch mangled `</tool_call>` boundaries.
- Implements a "bracket balancing" heuristic to prevent hanging if the model forgets the closing tag entirely.
- **Stage 1:** Regex Cleaning (removes markdown wrappers, truncates trailing text).
- **Stage 2:** Structural Repair (using `jsonrepair`).
- **Stage 3:** Schema Validation (using `zod`).
- Resolves the stream, replacing the malformed payload with the repaired version.

### 3. `PromptBuilder`
Constructs the full `ZoneStructuredPayload` for LLM execution without truncation (unless absolutely required by the context window limits).
- `zone1_critical_rules`: The Absolute Beginning.
- `zone2_context_files`: The Middle.
- `zone3_active_cursor`: The Absolute End.

### 4. `LoggingInterceptor`
Monitors the execution events and handles telemetry. It is responsible for cloning the `ZoneStructuredPayload` and applying truncation (e.g., `...[ZONE 2 TRUNCATED FOR LOGGING]`) specifically to `zone2_context_files` strictly for log file persistence to prevent massive log files, keeping the LLM generation untouched.

## Data Models

```typescript
// Telemetry Event
interface EnhancedModelExecutionEvent {
  timestamp: number;
  event: "START_GENERATE" | "END_GENERATE" | "ERROR";
  providerId: "local-main" | "local-side";
  phase: "Phase 1: Pre-Gen" | "Phase 2: Gen" | "Phase 3: Post-Gen";
  
  mainEpochId: string;
  clerkMicroEpochId?: string;
  
  metrics: {
    promptTokens: number;
    completionTokens?: number;
    ttftMs?: number;
    toolsCalled?: number;
    json_repaired?: boolean;
    wrap_up_triggered?: boolean;
  };
  
  payload?: ZoneStructuredPayload;
}

type ZoneStructuredPayload = {
  zone1_critical_rules: string;
  zone2_context_files: string;
  zone3_active_cursor: string;
}
```

## Error Handling

- **JSON Malformation:** Handled proactively by the `SanitizerMiddleware`. If repair completely fails (validation error), the standard tool error feedback loop is utilized.
- **Context Limit Breach:** Handled proactively by the Clerk's High Watermark calculations, triggering a graceful "Wrap-Up Directive".
- **State Overlap:** Telemetry validation ensures `local-main` and `local-side` never overlap. `SessionProcessor` uses locking mechanisms to prevent concurrent execution.

## Testing Strategy

- **Unit Tests:**
  - `SanitizerMiddleware`: Provide permutations of malformed, conversational, and markdown-wrapped JSON, including missing closing `<|tool_call>` tags, to ensure proper repair and schema validation.
  - `PromptBuilder` & `LoggingInterceptor`: Verify Zone placement, especially ensuring `LoggingInterceptor` correctly truncates `zone2_context_files` for telemetry without mutating the original payload.
- **Integration Tests:**
  - `SessionProcessor`: Simulate the Baton Pass (Phase 1 -> Phase 2 -> Phase 3) to ensure strict sequential execution, accurate context building, and the UI blocking queue for "Fast Typer" scenarios.
- **Telemetry Validation:**
  - Intercept events emitted during generation and verify `json_repaired`, `wrap_up_triggered`, and the proper presence of `ZoneStructuredPayload`.
```