# Bug Report: Plan Mode Reminder Persistence Across Epoch Transitions

## Overview
During the IoT Controller E2E test, the agent successfully transitioned from the "Tasks" phase to the "Implementation" phase. However, following an **Epoch Transition** (Context Rotation), the system injected a "Plan Mode" system reminder into the prompt. This reminder explicitly forbade source code edits, contradicting the active "build" persona and the project's actual state.

## Expected Behavior
As defined in `docs/spec-driven-development.md`, the transition to the `build` persona should be deterministic and automatic once planning documents are approved. Upon an Epoch Transition, the system-reminder should reflect the current phase:
- If `phase == implementation`, the "Plan Mode" reminder should be removed or replaced with a "Build Mode" reminder.
- The agent should have full tool permissions (`write`, `bash`, etc.) and be encouraged to prioritize implementation ("Action Bias").

## Actual Behavior
1.  **Turn 27**: Agent calls `sc_approve` for `Tasks.json`.
2.  **Turn 28**: System correctly identifies `phase: implementation` and `activeAgent: build`.
3.  **Turn 30**: An **Epoch Transition** occurs.
4.  **Transition Prompt**: The system injects a `[EPOCH_TRANSITION]` message containing:
    ```markdown
    <system-reminder>
    # Plan Mode - System Reminder
    CRITICAL: Plan mode ACTIVE - you are in the planning phase.
    ...
    STRICTLY FORBIDDEN: Edits to source code...
    </system-reminder>
    ```
5.  **Agent Hesitation**: The agent, seeing the "CRITICAL" reminder, reverts to discovery tools and fails to implement the required `start.sh` and application code, leading to functional test failure.

## Deviation Point & Root Cause
The deviation occurred during the **Epoch Transition at Turn 30**, but the root cause was established at **Turn 27**.

### Code-Level Analysis
1.  **Too Restrictive Guard**: In `packages/epochcli/src/mcp/index.ts` (approx. line 804), the `sc_approve` handler only triggers a persona shift if the status is explicitly `building`:
    ```typescript
    if (phase === "implementation" && status === "building") {
       // logic to shift to 'build' agent
    }
    ```
2.  **State Mismatch**: Upon approving `Tasks.json` at Turn 27, the `spec` tool returned `phase: implementation` and `status: active`. Since the status was not `building` (which only occurs after `sc_todo_start`), the system **failed to shift the persona** to `build`.
3.  **Sticky Persona**: The agent remained `plan`. When the **Epoch Transition** occurred at Turn 30, the orchestrator (`engine.ts`) used the `lastUser.agent` (still `plan`) to initialize the new turn.
4.  **Incorrect Reminder Injection**: `packages/epochcli/src/session/prompt/resolver.ts` saw the agent was `plan` and correctly (according to its own logic) injected the `PROMPT_PLAN` reminder, which explicitly forbids writing code.

## Impact
- Agents get stuck in infinite discovery loops or "persona lock" after context rotations because they are incorrectly restricted by the `plan` persona constraints.
- Functional tests fail because the agent believes it is forbidden from writing the very code it is tasked to build.
- 12 epoch transitions occurred in a single run, indicating significant orientation struggle as the agent kept hitting context limits while doing nothing but "safe" discovery.

## Proposed Fix
1.  **Relax Persona Shift Guard**: Update `packages/epochcli/src/mcp/index.ts` to trigger the persona shift when `phase === "implementation"`, regardless of the sub-status (e.g., if it's `active`).
2.  **Dynamic Transition Validation**: In `packages/epochcli/src/session/prompt/engine.ts`, ensure that upon an `EPOCH_TRANSITION`, the system performs a fresh `sc_status` check to verify the current phase and force the correct agent persona, rather than relying solely on the `lastUser.agent` from the rotated context.
