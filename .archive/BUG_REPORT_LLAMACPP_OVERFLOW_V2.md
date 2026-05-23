# Bug Report: Emergency Transition Handshake Fails (V2) - Escaped Promise Rejection

## Description
During a long-running Plan + YOLO autonomous workflow (`iot-controller-full-stack`), the execution successfully reached Turn 23 before hitting the context window limit of the local `qwen-35b` model hosted on `llama.cpp`. 

The system is designed to gracefully handle this via the **Emergency Transition Handshake** by intercepting the overflow mid-stream and bridging the context. However, the CLI process encountered a fatal crash due to an `UnhandledPromiseRejection` linked to the Vercel AI SDK's `AI_APICallError`.

## Differences from V1 (`BUG_REPORT_LLAMACPP_OVERFLOW.md`)
Previously, we identified that the `streamText` function in the AI SDK returned auxiliary promises (`.warnings`, `.request`, `.response`, `.steps`) that were floating and causing crashes when the primary stream threw a 500 error. 

**We applied a "Total Catch" strategy** to `streamText` and `generateText` in `packages/epochcli/src/session/llm.ts` to swallow these rejections. We also wrapped the `JSON.stringify` logic in `error.ts` in a `try/catch` block to prevent circular reference crashes during error classification.

**Despite these fixes, the system still crashed globally** with the exact same stack trace footprint indicating a floating promise rejection:

```log
 responseBody: "{\"error\":{\"code\":500,\"message\":\"Context size has been exceeded.\",\"type\":\"server_error\"}}",
 isRetryable: true,
       data: {
  error: [Object ...],
},
 vercel.ai.error: true,
 vercel.ai.error.AI_APICallError: true,

      at /cli/node_modules/.bun/@ai-sdk+provider-utils@4.0.21+d6123d32214422cb/node_modules/@ai-sdk/provider-utils/dist/index.mjs:2548:18
      at processTicksAndRejections (native:7:39)

INFO  2026-05-12T17:33:34 +2ms service=default directory=/workspace disposing instance
```

## Root Cause Hypotheses
Since `streamText` and `generateText` are patched, the floating `AI_APICallError` rejection must be escaping from a different vector in the codebase:

1. **Unpatched AI SDK Methods:** The system might be using `generateObject` or `streamObject` (e.g., for structured data extraction or routing) which lack the "Total Catch" strategy applied to the text generators.
2. **Background Effect Forks:** Background tasks initiated via `Effect.fork` or `Effect.forkIn` (such as the Title Generator `resolver.ensureTitle` or the `PostGenerationWorker`) might be failing to catch AI SDK errors at the boundary, allowing them to bubble up to the Node.js root `processTicksAndRejections` handler.
3. **Stream Consumption Errors:** An error thrown while asynchronously iterating over an AI SDK stream (`for await (const chunk of textStream)`) might be rejecting a secondary promise that isn't caught by the primary `.catch()`.

## Environment Context
- **Test Scenario:** `iot-controller-full-stack` (Turn 23)
- **Agent Mode:** `plan` + `yolo: true` (Autonomous Execution)
- **Model:** `local-main/qwen-35b` (via `llama.cpp` on `host.docker.internal:8085`)
- **Impact:** Global process crash, triggering `service=default disposing instance` and bypassing the `SessionProcessor` recovery pipeline.
