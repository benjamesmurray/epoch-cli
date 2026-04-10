# Requirements: Clerk Pair Programmer (Edit Tool Reviewer)

## 1. Goal
Elevate the 4B Nemotron "Clerk" side model from a pre-generation prompt-builder to an active mid-turn "Pair Programmer." Specifically, when the 26B Main model fails to accurately use the `edit` tool (due to a string mismatch or truncation risk), the 4B model should intervene, analyze the mismatch, and provide a compressed, contextual error back to the 26B model instead of raw file dumps.

## 2. Core Requirements
- **Intercept Edit Failures:** The `edit.ts` tool must intercept `notFound` errors resulting from `oldString` mismatches.
- **Invoke Side Model:** When intercepted, the tool must invoke the `local-side` provider (or fallback gracefully if unavailable).
- **Contextual Error Compression:** The side model must be passed the target file contents, the requested `oldString`, and the `newString`. It must return a concise explanation of *why* the match failed (e.g., "The signature changed. Use `export async function runMiddleware(ctx) {` instead.")
- **Error Injection:** The result of the side model's analysis must be injected as the Error message sent back to the 26B model's context window.

## 3. Constraints
- **Latency:** The side model invocation must be fast. It is a 4B model, so we expect < 1-2 seconds of overhead.
- **Resilience:** If the side model fails to respond or is unconfigured, the tool should fallback to the current behavior (returning the 100-line preview dump).
- **Token Efficiency:** The output of the side model MUST be significantly smaller than returning 100 lines of raw code, preserving the 26B model's context efficiency.