# Design: Clerk Pair Programmer (Edit Tool Reviewer)

## Overview
This design details the integration of the `local-side` (4B Clerk) LLM provider into the `edit` tool. The goal is to catch `oldString` mismatch failures (`notFound`) and intelligently compress the error by having the Clerk review the live file content against the intended edit.

## Architecture
- **Trigger Point:** In `packages/epochcli/src/tool/edit.ts`, inside the `replace` function, when `notFound` is true.
- **Provider Access:** The `edit.ts` tool needs access to the LLM Provider service. It will pull the `local-side` configuration from `Config.Service` or `Provider.Service`.
- **Clerk Invocation:** A new helper function, `analyzeEditFailure(content, oldString, newString)`, will be introduced. This function creates a zero-shot prompt instructing the model to find the correct `oldString` match or explain why the edit is completely invalid (e.g., "function was deleted").
- **Error Construction:** The output of the Clerk model is wrapped in a standard Error object and thrown back to the 26B model, replacing the current 100-line raw file dump.

## Components and Interfaces

### 1. `analyzeEditFailure` Function
```typescript
import { generateText } from "ai"; // using @ai-sdk/core
import { Provider } from "../provider/provider";

export async function analyzeEditFailure(
  content: string, 
  oldString: string, 
  newString: string
): Promise<string> {
  // 1. Fetch side-model provider config
  // 2. Construct prompt
  // 3. Await generation
  // 4. Return compressed error string
}
```

### 2. Modifications to `replace` in `edit.ts`
The `replace` function is currently synchronous. We will need to either make it asynchronous (which bubbles up to `execute`) or perform the side-model analysis directly in the `execute` block where we catch the error from `replace`.
*Decision:* It's cleaner to catch the error in `execute()`, read the `oldString`, and perform the async analysis there, rather than making the deeply nested `replace` utility async.

## Data Models
- **Side Model Prompt Payload:**
  - System: "You are an expert pair programmer. The main AI agent tried to edit a file, but the text they want to replace is not found. Look at the file and tell the agent concisely what changed so they can fix their `oldString`. Output ONLY the helpful correction."
  - User: `[File Content Snippet]\n\nIntended oldString:\n${oldString}\n\nIntended newString:\n${newString}`

## Error Handling
- **Side Model Timeout/Failure:** If the 4B model takes too long (> 5000ms) or errors out (e.g., provider offline), the system must silently catch the error and fallback to the original behavior (dumping the 100-line preview).

## Testing Strategy
- Unit tests will mock the `Provider` to simulate a side-model response during an `edit` tool failure.
- E2E tests will intentionally trigger a bad edit and verify that the resulting error message contains the compressed Clerk response rather than the raw file dump.