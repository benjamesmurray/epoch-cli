# Bug Report: Mid-Epoch Continuity Loop (Instructional Interference)

## Status
**Priority:** Critical  
**Type:** Architectural / Prompt Engineering  
**Detection:** E2E Suite `2026-05-08T12-00-52-899Z` (Run 1)

## Summary
The `PromptEngine` is incorrectly injecting the `.epoch-continuity.toon` report into the **System Prompt** during active sessions (mid-epoch). This causes the agent to interpret its own action history as a set of mandatory instructions, leading to recursive re-execution of setup tools (e.g., `sc_init`, `read spec`) and exhausting the 51-turn limit without making progress.

## Root Cause Analysis
1.  **Improper Loading Trigger:** The `PostGenerationWorker` is generating a `.epoch-continuity.toon` file after every turn in some environments (specifically E2E).
2.  **System Prompt Pollution:** The `PromptEngine` automatically scans the workspace for `.toon` files and prepends them to the System Prompt under an `Instructions from: ...` header.
3.  **Instructional Conflict:** The agent's core mandate (e.g., \"Follow Sequence: 1, 2, 3\") conflicts with the `ACTION TIMELINE` found in the history report. The agent perceives \"Turn 1\" in its instructions and re-triggers the initialization workflow.

## Evidence (Run 1)
*   **Turn 1-3:** Successful execution of `sc_init`, `read`, and `write`.
*   **Post-Turn 3:** `PostGenerationWorker` generates a continuity report.
*   **Turn 4 Payload:** System prompt contains the full `ACTION TIMELINE` from Turn 1.
*   **Turn 4 Action:** Model re-executes `sc_init`.
*   **Turn 47:** Model is still re-executing Turns 1-10 in a loop.

## Impact
*   **Context Exhaustion:** Rapidly fills the 32K window with redundant history.
*   **Turn Budget Waste:** Prevents completion of any project requiring >10 turns.
*   **Reliability:** Projects with \"Mandatory Sequences\" (like `spec` tool) are 100% blocked by this behavior.

## Proposed Remediation
1.  **Scope Isolation:** Ensure `.epoch-continuity.toon` is ONLY loaded as a one-time **User Message** during an `Epoch Cold-Start`, never as a persistent System Instruction.
2.  **Worker Throttling:** The `PostGenerationWorker` should only execute when a transition is actually required (Context limit reached or Manual Stop), not after every turn.
3.  **Prompt Filtering:** Modify the `PromptEngine` to explicitly exclude `.toon` files from the automatic instruction-gathering loop.

## Related Files
- `packages/epochcli/src/session/prompt/engine.ts`
- `packages/epochcli/src/session/worker.ts`
- `packages/epochcli/src/util/session-analyzer.ts`
