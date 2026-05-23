# Bug Report: Emergency Transition Handshake Fails on llama.cpp 500 Overflow Error

## Description
The Epoch CLI is designed to seamlessly handle LLM context overflows via an "Emergency Transition Handshake" (as documented in `docs/continuity.md`). This mechanism is supposed to intercept overflow errors mid-stream, halt the current generation, serialize the interrupted state, and gracefully bridge the context to a new epoch. 

However, during a full-stack E2E test using a local `qwen-35b` model hosted on `llama.cpp`, the context window was exceeded during the transition from the Planning to the Implementation phase. Instead of triggering the emergency transition, the CLI crashed with an unhandled `AI_APICallError`, resulting in a fatal process exit.

## Expected Behavior (per `docs/continuity.md`)
According to the **Emergency Transition Handshake (Runtime Overflow)** documentation:
1. The `SessionProcessor` should catch the `ContextOverflowError` mid-stream.
2. The error classifier should use **Recursive Overflow Detection** to parse stringified JSON errors (e.g., `{"error": {"code": 500, "message": "Context size has been exceeded."}}`) from local proxies like `llama-cpp`.
3. The system should emit a `session.epoch_transition` event and synthesize a Hub-and-Spoke recovery package (`.epoch-continuity.toon` and `.history/interrupted_state.toon`).
4. The CLI process should remain alive, recovering the floating `UnhandledPromiseRejection` errors via the "Total Catch" strategy in `packages/epochcli/src/session/llm.ts`.

## Actual Behavior
The CLI failed to intercept the stringified JSON error returned by the AI SDK. The error bubbled up as an `AI_APICallError` containing the stringified JSON in the `responseBody`, which led to a fatal test harness crash.

### Error Trace
```log
AI_APICallError: Context size has been exceeded.
      cause: undefined,
        url: "http://host.docker.internal:8085/v1/chat/completions",
 statusCode: 500,
 responseHeaders: {
  "content-length": "88",
  "content-type": "application/json; charset=utf-8",
  date: "Tue, 12 May 2026 08:41:51 GMT",
  server: "llama.cpp",
},
 responseBody: "{\"error\":{\"code\":500,\"message\":\"Context size has been exceeded.\",\"type\":\"server_error\"}}",
 isRetryable: true,
       data: {
  error: [Object ...],
},
 vercel.ai.error: true,
 vercel.ai.error.AI_APICallError: true,

      at /cli/node_modules/.bun/@ai-sdk+provider-utils@4.0.21+d6123d32214422cb/node_modules/@ai-sdk/provider-utils/dist/index.mjs:2548:18
```

### Process Impact
Following the `AI_APICallError`, the default instance disposal logic was triggered, leading to the complete shutdown of the agent process:
```log
INFO  2026-05-12T08:41:51 +2ms service=default directory=/workspace disposing instance
INFO  2026-05-12T08:41:51 +0ms service=state key=/workspace waiting for state disposal to complete
INFO  2026-05-12T08:41:51 +2ms service=bus type=* unsubscribing
```

## Root Cause Hypothesis
The **Recursive Overflow Detection** logic (likely in `MessageV2.fromError` or the `SessionProcessor` classifier) is failing to properly identify the `responseBody: "{\"error\":...}"` string or the `data.error.message` field specifically thrown by the `@ai-sdk/openai-compatible` provider when connected to `llama.cpp`. It appears the error is being treated as a generic `AI_APICallError` (or a retryable network error) rather than being cast to a `ContextOverflowError`, bypassing the transition handshake entirely.

## Environment Context
- **Test Scenario:** `iot-controller-full-stack`
- **Agent Mode:** `plan` -> `build` (YOLO Mode)
- **Model:** `local-main/qwen-35b` (via `llama.cpp` on `host.docker.internal:8085`)
- **Action at Crash:** Reading `database.py` during implementation task 1.4.