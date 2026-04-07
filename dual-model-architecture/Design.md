# dual-model-architecture - Design Document

## System Architecture

The architecture transitions the current monolithic request/response model into a multi-stage sequential event loop orchestrated by a Task-Epoch state machine.

### The Baton Pass Event Loop
1. **Phase 1: Pre-Generation (Nemotron 4B Clerk)**
   - Trigger: User submission or task initiation.
   - Action: 4B model sanitizes previous JSON logs and formats incoming structured data (e.g., file trees) into TOON format.

2. **Phase 2: Main Generation (Gemma 26B)**
   - Trigger: Formatted payload hand-off from Phase 1.
   - Action: Generation of code or tool calls utilizing the Positional Prompt Architecture.

3. **Phase 3: Post-Generation (Nemotron 4B Clerk)**
   - Trigger: Output completion from Phase 2.
   - Action: Extraction of user corrections for persistent storage and epoch summarization.

### Task-Epoch Lifecycle
1. **Cold Start**: Complete reset of conversation history. Prompt dynamically reconstructed using Zone 1, 2, and 3 logic.
2. **Execution**: Dedicated execution phase with up to 32k pristine context.
3. **State Committal**: Sync with Spec CLI MCP for task status updates. 4B extracts decisions for documentation.
4. **Purge**: Reset for the next task.

### Data Models & Prompt Formatting
- **TOON (Token-Oriented Object Notation)**: All injected context avoids JSON. Uses YAML-like indentation and CSV-style rows.
- **Positional Zones**:
  - Zone 1 (Top 200 tokens): Permanent corrections, active task, critical symbols.
  - Zone 2 (Middle): Ground rules, inactive context, MCP schemas.
  - Zone 3 (Bottom 200 tokens): Fact repetition, exact local cursor focus.

## Proposed Changes

1. **Provider Configuration**
   - Update `epoch.jsonc` (or equivalent config) to define `local-main` (Gemma 4 26B) and `local-side` (Nemotron 4B) providers.
2. **Event Loop Orchestrator**
   - Refactor `packages/epoch/src/session/processor.ts` and `packages/epoch/src/cli/cmd/run.ts` to implement the 3-phase baton pass.
3. **Prompt Builder Refactor**
   - Update `packages/epoch/src/session/prompt.ts` to enforce the 3-Zone Positional Architecture and TOON formatting.
4. **Task-Epoch Manager**
   - Introduce epoch state management and history purging logic tied to Spec CLI task completions.
5. **Output Sanitizer**
   - Add a 3-stage JSON sanitizer utility in `packages/epoch/src/util/` applied to all `local-main` responses.

## Security & Performance Considerations
- Context is strictly capped (32K-64K) using engine flags (`--max-model-len`).
- Avoid compute contention by ensuring the 4B and 26B models operate strictly sequentially.
- Native tokens must be properly escaped or handled in user input to prevent prompt injection.