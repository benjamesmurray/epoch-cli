# Doom Loop Protection

This document outlines the multi-layered strategy used by Epoch CLI to detect and break non-productive repetitive cycles ("doom loops") in autonomous (YOLO) mode.

## Overview

Unlike traditional agents that rely on arbitrary turn limits, Epoch CLI employs a dynamic **Stall Scoring** system combined with **Context-Aware Semantic Analysis** to distinguish between high-complexity progress and genuine stagnation.

## 1. Stall Scoring & Interception

Epoch CLI uses a hybrid approach to detect stagnation: a high-level cumulative **Stall Scoring** system and a low-level **Immediate Interception** layer.

### Immediate Interception Triggers
Regardless of the cumulative score, the engine will immediately trigger a Supervisor Intervention if:
*   **Identical Loop:** The agent attempts the same tool with the exact same arguments twice in a row.
*   **Global Failure Loop:** The agent accumulates **3 consecutive tool errors** across *any* combination of tools.
*   **Text Generation Loop (Hallucination):** The agent gets stuck continuously generating repetitive text blocks or variations of the same phrase. 
    *   **Actionless Rambling:** The stream is aborted if text exceeds **3,000 characters** without a structured tool call.
    *   **Semantic Stuttering:** The engine monitors a rolling window of the last 4 sentences; if similarity exceeds **85%** (e.g., repeatedly affirming readiness without action), the stream is halted.
*   **Poisoned History Loop (JSON Double-Encoding):** If an agent hits a token limit mid-generation, tool arguments may be truncated into invalid JSON. Epoch CLI defensively parses these raw strings into empty objects (`{}`) before appending them to the conversational history. This prevents the provider adapter from double-encoding the broken string and crashing the local LLM server (e.g., `llama.cpp` template errors), which would otherwise cause an infinite failure loop on subsequent turns.

### Cumulative Scoring Metrics (The Engine)
The engine maintains a `stallScore` that increments based on the "advancing" nature of an agent's actions.

| Action Type | Score Adjustment | Description |
| :--- | :--- | :--- |
| **Advancing** | `Reset to 0` | Productive actions (`edit`, `write`, `task_complete`, `sc_todo_complete`, etc.) that target a **new file** or use a **different tool** than the previous advancing action. Resets the terminal `MAX_TURNS` counter. |
| **Orientation** | `+3` | Exploratory operations that don't advance state (`read`, `glob`, `pm_query`, `sc_status`, `sc_todo_list`, or `ls`/`find` bash commands). |
| **Neutral** | `+1` | Other non-advancing tool calls. |
| **Empty Action** | `+10` | YOLO mode turn completed with zero tool calls (internal debate/rambling). |
| **Repetitive** | `+5` | Using the exact same tool with the exact same input as a previous turn. |
| **Invalid** | `+3` | Calling tools with arguments that fail schema validation. |

### Terminal Turn Limit (`MAX_TURNS`)
In addition to the dynamic stall score, the engine enforces a hard safety ceiling of **50 turns**.

*   **Reset on Progress:** This counter is reset to **0** whenever the agent performs an **Advancing** action (defined as a productive action targeting a new file or using a different tool).
*   **Terminal Stall:** If the agent takes 50 consecutive turns without making concrete progress (e.g., spending 50 turns exclusively exploring or repeatedly editing the same file), the session is forcefully terminated as a "terminal stall."

This ensures that while the agent has unlimited turns to complete complex implementation tasks, it cannot wander indefinitely in an exploratory loop.

### Thresholds
*   **Threshold 1 (Score 10):** **System Nudge.** The engine injects a generic refocus message advising the agent to advance the project state with a concrete, forward-moving action.
*   **Threshold 2 (Score 15):** **Supervisor Intervention.** The engine triggers the Global Intervention Handler.
*   **Threshold 3 (Score 20+):** **Hard Reset (Epoch Closure).** The engine forces an automatic context transition, clearing the agent's immediate history and starting a fresh epoch with a Continuity Report.

---

## 2. Supervisor Intervention & Routing (The Clerk)

The Supervisor (Clerk) operates as an out-of-band architectural referee. It serves two primary functions: Breaking Doom Loops and Dynamic Persona Routing.

### Persona Routing & Arbitration (Deterministic)
The active agent persona is deterministically assigned based on the physical state of the project on disk. 
- **plan:** Active when a project is in `projects/active/` but lacks a `.spec-tasks-approved` marker file.
- **build:** Active once the `.spec-tasks-approved` marker is detected in the project directory.
- **explore:** Default persona when no active projects are detected or for general discovery tasks.

This deterministic grounding ensures the system prompt (`Current Phase: [PLAN/BUILD]`) is always factually accurate and prevents "Phase Hallucinations" during complex transitions.


### Doom Loop Diagnosis & Context Injection
When triggered by the stall scoring engine, the Clerk performs a **Dynamic Context Analysis** to cure the doom loop using:
- **Action Timeline (Last 8 Turns):** It reviews the specific trace of the last 8 turns, including the tool name, input arguments, result status (completed/error), and the actual **output or error message**.
- **Stall Reason:** It receives an explicit `interventionHint` (e.g., `repetition`, `rambling_hallucination`, or `empty_turn`) from the engine.
- **Continuity Report:** It leverages the `.epoch-continuity.toon` report to understand the broader project state and existing blockers (e.g., unresolved `<template>` tags).

### Prescription: The Loop Breaker
The Clerk generates a **Context-Aware Directive**. By analyzing the error messages in the Action Timeline, it can provide specific technical corrections:
- **Example:** *"STOP calling sc_approve. The Action Timeline shows that sc_approve has failed 3 times with the error: 'Please set template_tags_present to false in Tasks.json'. You must update Tasks.json with concrete steps and toggle the flag before calling sc_approve again."*

### User Interruption Integrity
To ensure loop detection is robust, the engine distinguishes between genuine user feedback and system-injected messages. **Internal State Checks** (e.g., `[INTERNAL STATE CHECK]`) are explicitly ignored during the backward history scan. This prevents internal housekeeping from accidentally resetting the loop counters and allowing an agent to stagnate indefinitely.

### Enforcement
The instruction is injected as a `[CRITICAL INTERVENTION]` **Synthetic User Message**. This message sits at the top of the agent's immediate history, effectively overriding the agent's internal "Chain of Thought" and forcing a strategy shift for the next turn.

## 3. Hard Reset & Context Refresh

When an agent enters a "stubborn" failure mode where it ignores both nudges and technical directives, Epoch CLI employs a **Hard Reset**.

### The Nuclear Option
If the `stallScore` reaches **20**, the engine assumes the current context is "poisoned" by circular reasoning or a mental block. It automatically triggers an **Epoch Transition**:
1.  **Synthesis**: The `local-side` Clerk generates a dense `.epoch-continuity.toon` report.
2.  **Closure**: A synthetic `transition` part is appended to the history, effectively archiving the failed epoch.
3.  **Fresh Start**: A new epoch begins with a simplified **Resumption Directive**: *"I have initiated a HARD RESET of your context window... Lets get straight on with continuing our work."* This removes restrictive tool-usage rules (like the legacy 3-turn discovery prohibition) to ensure the agent can immediately follow the Supervisor's suggested unblocking actions.

This bypasses the model's internal inertia by removing the circular history from its active context window, forcing it to re-orient based on the high-level roadmap established in the continuity files.

## 4. Workflow Monotonicity (The Spec Tool)

The `spec` tool ensures that the project state is moving forward.
- **State Stagnation:** If `sc_status` returns an identical state (tasks, requirements, phase) over multiple turns while tools are being called, a stagnation event is triggered regardless of the turn count.
- **Schema-Aware Recovery:** If an agent repeatedly fails a tool call due to syntax errors, the Clerk intervenes with a **Schema Comparison**, showing the agent exactly where its arguments deviate from the expected JSON schema.

## Why this is used
This system allows the agent to take 100+ turns on a massive refactor (where file writes are frequent) while catching a simple 4-turn loop during initialization in under two minutes. By feeding architectural context to the supervisor, we ensure that interventions provide a path forward rather than just a stop condition.