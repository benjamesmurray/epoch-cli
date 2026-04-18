# YOLO Mode: Autonomous Execution & Continuity

YOLO mode enables autonomous execution for AI agents, allowing them to work through complex tasks without requiring constant user approval or intervention. This document outlines the technical implementation and the strategies used to ensure reliability and graceful termination.

## Core Architecture

### 1. Persistent Session State
Unlike traditional modes that rely on prompt history, YOLO mode is "locked in" at the session level.
- **Database Persistence**: A `yolo` boolean column in the `session` table ensures the mode survives context compaction, TUI re-attachments, and server restarts.
- **SDK Integration**: The flag is propagated through the SDK (`SessionCreateData`, `SessionUpdateData`, `SessionPromptData`), allowing both CLI and TUI to manage the state reliably.

### 2. The Runloop Contract
The `runLoop` in `packages/epochcli/src/session/prompt.ts` acts as the enforcer for autonomous execution:
- **Continuous Execution**: If YOLO mode is active and the agent finishes a turn without calling the `task_complete` tool, the system automatically injects a synthetic user "nudge" and continues the loop.
- **Explicit Termination**: The loop only terminates naturally when the `task_complete` tool is invoked by the agent, signifying that the objective has been met.

## Safeguards & Reliability

### 3. Stagnation Detection (Anti-Doom-Loop)
To prevent infinite loops and token waste, the runloop implements a stagnation detection heuristic:
- **Tool History Tracking**: The system maintains a sliding window of the last 6 tool calls.
- **Repetition Analysis**: If the last 3 tool calls are identical to the previous 3 (e.g., `sc_status` -> `pm_query` -> `sc_status` cycle), the runloop automatically aborts.
- **User Alert**: The session is paused, and a diagnostic message is presented: *"Agent paused: Detected repetitive tool usage without progress."*

### 4. Refined Operational Nudging
Agent "stubbornness" is managed through strict operational directives rather than behavioral suggestions:
- **Standard Nudge**: `[SYSTEM: You have indicated you are finished, but you have not formally closed the session. You must now invoke the task_complete tool to terminate the run. Do not perform any further validations.]`
- **Context-Aware Nudge**: If the Spec CLI reports that all tasks are 100% complete, the nudge is strengthened: `[SYSTEM: All tasks in your todo list are marked complete. If you are finished, you MUST call task_complete now. Do not perform any further redundant checks.]`

### 5. Sub-agent Isolation
To maintain clean boundaries, sub-agents spawned via the `task` tool do **not** inherit the global YOLO flag's termination requirement:
- Sub-agents are scoped to their specific objective.
- They return control to the Supervisor using standard yielding mechanisms.
- Only the top-level Supervisor (which holds the `yolo` flag) is responsible for the final `task_complete` sequence.

## User Interface

### 6. TUI Progress Indicator
During autonomous execution, the TUI provides clear visual feedback to prevent the user from assuming the agent has hung or is waiting for input:
- **Autonomous Mode Spinner**: Displays a specialized spinner in the prompt area when the agent is busy in YOLO mode.
- **Status Label**: Replaces the standard "YOLO" indicator with "Autonomous Mode" during active processing.
