# robust-loop-detection - Design Document

## Overview
The goal of this feature is to expand the existing tool loop detection mechanism, which currently only catches identical consecutive tool calls. The new mechanism will also detect loops where the LLM is repeatedly calling the same tool and encountering errors (like trial-and-error with file paths or syntax).

## Architecture
The loop detection logic resides in `packages/epochcli/src/session/llm.ts` inside the `stream` function's tool interceptor loop. Currently, it scans `input.messages` backwards to count identical `args` for the same `toolName`.

We will expand this monitor:
1.  **Identical Args Check:** Keep the existing `identicalCount >= 3` check.
2.  **Repetitive Error Check:** Track the last N tool calls for the same `toolName`. If a tool is called multiple times sequentially (e.g., 3 or 4 times) and the previous calls resulted in errors, we trigger the intervention.

## Components and Interfaces
- `packages/epochcli/src/session/llm.ts`: Update the `execute` wrapper.
  Instead of just counting `identicalCount`, we will also count `consecutiveErrorCount`.
  To determine if previous calls resulted in an error, we look at the subsequent `user` message which contains the `tool-result` or `tool-error`. Wait, in the `ai` sdk, a tool result has `{ type: 'tool-result', toolCallId, result, isError }`. If `isError` or if the stringified result indicates an error (e.g., "Error:", "ENOENT"), we count it.

## Error Handling
The intervention itself is an error returned to the model (`SYSTEM INTERVENTION: ...`). We will dynamically adjust the prompt sent to the `local-side` model to include the fact that the tool is failing repeatedly with different arguments, so the Clerk can give more specific advice.

## Testing Strategy
Add a test in `packages/epochcli/test/session/llm.test.ts` (or similar) that simulates an LLM calling `read_file` 3 times with slightly different paths that all return an error, and verify the intervention is generated.
