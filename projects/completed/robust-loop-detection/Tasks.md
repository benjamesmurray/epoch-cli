# robust-loop-detection - Tasks

## 1. Loop Detection Expansion

- [x] 1.1 Update `packages/epochcli/src/session/llm.ts` to count consecutive errors.
  - **Objective**: Add logic inside the tool interceptor to check `input.messages` for recent identical tool calls that failed.
  - **Files**: `packages/epochcli/src/session/llm.ts`
  - **Details**: Instead of just `identicalCount`, we track if the last N tool executions for `toolName` returned errors. If so, trigger the side-model intervention.
  - **Requirements**: Loop detection also intercepts repeated tool calls to the same tool that result in errors sequentially over a threshold.

- [x] 1.2 Update the side-model prompt for better context.
  - **Objective**: Modify the prompt sent to the `local-side` model during intervention to specify whether it's an exact argument loop or a failure loop.
  - **Files**: `packages/epochcli/src/session/llm.ts`
  - **Details**: Provide the recent args that were attempted and failed, so the side model can give specific feedback (e.g. "Stop trying different capitalizations of requirements.md").
  - **Requirements**: The Side-Model Handoff is triggered to provide a stern directive.

- [x] 1.3 Add tests for the new loop detection.
  - **Objective**: Write tests to ensure the new failure loop detection works and the existing exact match loop detection remains functional.
  - **Files**: `packages/epochcli/test/session/llm.test.ts`
  - **Details**: Mock the `local-side` model and the `input.messages` array to simulate 3 sequential tool failures.
  - **Requirements**: Loop detection intercepts identical tool calls as before, and repetitive errors.
