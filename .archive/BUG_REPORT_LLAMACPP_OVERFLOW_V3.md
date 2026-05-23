# Bug Report: Catastrophic Context Budgeting Failure & Unhandled Overflow Crash

## Issue Summary
During autonomous test runs (`iot-controller-full-stack`), the Epoch CLI experiences a hard crash due to an unhandled `AI_APICallError: Context size has been exceeded` (500 Internal Server Error) from the local LLM provider (`llama.cpp`). 

The "Safe Transition Lifecycle" fails to trigger because the `PromptEngine` suffers from a **catastrophic context budgeting failure**, causing "stealth overflows" where the agent sends a payload massive enough to crash the server before the engine even realizes it is nearing the limit. Furthermore, when the 500 error does occur, it bypasses the global error handlers as an unhandled promise rejection, preventing the Emergency Transition Handshake from recovering the session.

## Expected Behavior
1. **Proactive Transition:** The `PromptEngine` should accurately calculate the total token weight of the upcoming payload. If it nears the configured limit, it should cleanly trigger a Safe Transition (`.epoch-continuity.toon`) *before* generating the API request.
2. **Emergency Fallback:** If an overflow *does* occur at runtime, the global execution loop should catch the specific Vercel AI SDK error and trigger a transition without crashing the Node.js process.

## Actual Behavior (The Diagnostic Evidence)
A diagnostic interceptor was injected immediately before the `streamText` call to measure the exact mathematical delta at the moment of the crash. 

**Diagnostic Output:**
```
==================================================
[CRITICAL DIAGNOSTIC] Context Budget Pre-Flight
Crude Payload Estimate (History + Tools + System): 5688
Configured Context Limit: 32000
==================================================
```

The engine estimated the payload to be **5,688 tokens**. The server immediately crashed, indicating the payload exceeded **32,000 tokens**. The engine underestimated the context weight by a factor of roughly **5.6x**.

## Root Cause Analysis

### 1. The Token Math Fallacy (1.4 Tokens per Character)
The `SessionEngine` currently estimates token usage with a crude heuristic: `Math.ceil(length / 4)`. 
Based on our diagnostic, the raw payload was roughly 22,752 characters (`5688 * 4`). Because this crashed a 32,000 token limit, the actual tokenization ratio for the Qwen BPE model was **~1.4 tokens per character**.

This extreme ratio is likely due to heavily indented JSON tool schemas and ChatML wrappers (`<|im_start|>`). Many local tokenizers lack efficient tokens for repeated spaces (e.g., 4 spaces = 4 tokens), causing highly structured payloads to bloat exponentially.

### 2. Payload Blind Spots
The current context budgeting logic in `engine.ts` only iterates over `input.messages` (the conversation history). It is completely blind to the token weight of:
- The injected Tool Definitions (JSON schemas).
- The massive `SystemPrompt` (which includes dynamically injected `Specification.md` and `Tasks.json` contexts via Zones).
- ChatML structural formatting.

### 3. Vercel AI SDK Error Obfuscation
When the `llama.cpp` server returns a 500 error for context overflow, the Vercel AI SDK throws an `AI_APICallError`. This specific error signature is not currently caught by the engine's `isOverflow()` heuristics or the global try/catch loop, allowing it to bubble up as an unhandled promise rejection and kill the `bun` process.

## Proposed Solutions

This requires a two-tiered fix to restore the "Infinite Agent" capability safely.

### Phase 1: The Immediate Stop-Gap (The Paranoia Multiplier)
The crude division heuristic must be replaced immediately for local BPE models.
1. **Include All Payloads:** `isOverflow()` must be patched to sum the raw string lengths of the `SystemPrompt`, the `Tools` array (stringified), and the `History` array *together*.
2. **The Paranoia Multiplier:** Instead of `length / 4`, the engine should use a safety multiplier for local BPE models: `Math.ceil(total_length * 1.5)`. This assumes the worst-case scenario (whitespace-heavy JSON) and guarantees the engine transitions *before* hitting the physical limit.

### Phase 2: The Structural Fix (Dynamic Tokenization)
Estimating tokens based on characters is fundamentally unsafe for polyglot systems and varying model vocabularies.
1. **`/tokenize` Endpoint:** The `PromptEngine` should stop guessing. `llama.cpp` exposes a native `/tokenize` endpoint. The engine should send the compiled payload to `http://<host>:<port>/tokenize` to get the exact integer array length before proceeding. 
2. **Local Tokenizer Fallback:** If a network call per turn introduces too much latency, the CLI must implement a lightweight local tokenizer (e.g., using `transformers.js` loaded with the active model's specific `tokenizer.json`) to calculate the exact budget locally.
3. **Robust Error Catching:** Explicitly wrap the `generateText` and `streamText` invocations to catch `AI_APICallError`. Check the nested `responseBody` for `"Context size has been exceeded"` and programmatically force the Emergency Transition Handshake instead of crashing.