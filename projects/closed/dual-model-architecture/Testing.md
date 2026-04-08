# dual-model-architecture - Testing & Validation Strategy

## Objective
Validate the end-to-end execution of the Task-Epoch architecture. Ensure that the Nemotron 4B and Gemma 26B models operate sequentially (zero compute contention), that the prompt is correctly structured using TOON, and that the 3-Stage JSON Sanitizer successfully repairs malformed 26B outputs.

---

## Phase 1: Orchestration & Compute Contention (Log Validation)
**Goal:** Prove the "Baton Pass" event loop works and models do not process simultaneously.

### Test Case 1.1: Sequential Event Loop Verification
1. **Action:** Start a fresh Epoch CLI session and issue a complex generation request:
   ```bash
   bun run packages/epoch/src/index.ts run "Refactor the authentication logic and extract it into a new file."
   ```
2. **Log Validation:** Run the log parser against the server logs and application stdout:
   ```bash
   bun run packages/script/src/log-parser.ts /home/llm/utils/launch/logs/dual_main_...
   ```
3. **Expected Sequence in Logs:**
   - **T=0s:** App stdout shows `Running Phase 1: Pre-Generation (4B Clerk)...`
   - **T=1s:** Server logs (`8086`/Nemotron) show incoming `POST /v1/chat/completions`.
   - **T=2s:** Server logs (`8086`/Nemotron) complete.
   - **T=3s:** Server logs (`8085`/Gemma 26B) show incoming `POST /v1/chat/completions`.
   - **T=Xs:** App stdout shows `Running Phase 3: Post-Generation (4B Clerk)...`
   - **T=X+1s:** Server logs (`8086`/Nemotron) show incoming `POST /v1/chat/completions` (Background extraction).
   *Failure Condition:* Logs show Gemma 26B starting generation *before* Phase 1 completes.

---

## Phase 2: Context Integrity & Prompt Formatting
**Goal:** Prove the system successfully isolates context into the 3 Zones and formats data without JSON overhead.

### Test Case 2.1: TOON Formatter Output
1. **Action:** Run a unit test against `packages/epoch/src/util/toon.ts`.
2. **Expected:** Highly nested JSON file trees are converted to flat, YAML-style CSV lines without `{`, `}`, or `"` bloat.

### Test Case 2.2: Positional Prompt Architecture Injection
1. **Action:** Run Epoch CLI with the `--print-logs` or `--format=json` flag to expose the raw payload being sent to `local-main`.
   ```bash
   bun run packages/epoch/src/index.ts run "Show me the project map" --print-logs
   ```
2. **Log Validation:** Inspect the outbound `system` prompt payload in the logs.
3. **Expected:** 
   - The payload strictly contains the headers `[ZONE 1: CORRECTION PERSISTENCE & CURRENT STATE]`, `[ZONE 2: GROUND TRUTH RULES]`, and `[ZONE 3: LOCAL CURSOR CONTEXT & FACT REPETITION]`.
   - The payload *must not* contain raw JSON trees representing project state.

---

## Phase 3: Resilience & JSON Sanitization
**Goal:** Prove the inline JSON Sanitizer within `experimental_repairToolCall` successfully catches and fixes Gemma 4's known syntax flaws.

### Test Case 3.1: Structural Repair of Broken JSON
1. **Action:** Temporarily mock the Gemma 26B model to return a deliberately broken tool call payload (e.g., missing closing brackets and trailing commas):
   ```json
   ```json
   {
     "tool": "edit",
     "args": {
       "file": "app.ts",
       "content": "console.log('hello')",
   ```
2. **Log Validation:** Monitor the Epoch CLI application logs during the mock run.
3. **Expected:** 
   - App logs MUST output: `repairing tool call arguments with 3-Stage Sanitizer`.
   - The tool executes successfully despite the malformed origin payload.
   *Failure Condition:* The stream aborts with a JSON parsing error and the tool is mapped to the `invalid` fallback.

---

## Execution Guide
To run the automated validation loop over your generated server logs:
1. Ensure both `llama.cpp` (or `vLLM`) instances are running and logging to `/home/llm/utils/launch/logs/`.
2. Execute a multi-step task via Epoch CLI.
3. Run the validation script:
   ```bash
   bun run packages/script/src/log-parser.ts
   ```