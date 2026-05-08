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
| **Advancing** | `Reset to 0` | File writes (`edit`, `write`), `task_complete`, `sc_todo_complete`. |
| **Neutral** | `+1` | Read-only operations (`read`, `grep`, `pm_query`, `sc_status`). |
| **Empty Action** | `+10` | YOLO mode turn completed with zero tool calls (internal debate/rambling). |
| **Repetitive** | `+5` | Using the exact same tool with the exact same input as a previous turn. |
| **Invalid** | `+3` | Calling tools with arguments that fail schema validation. |

### Thresholds
*   **Threshold 1 (Score 10):** **System Nudge.** The engine injects a subtle warning advising the agent that it appears to be stalling.
*   **Threshold 2 (Score 15):** **Supervisor Intervention.** The engine triggers the Global Intervention Handler.

---

## 2. Supervisor Intervention & Routing (The Clerk)

The Supervisor (Clerk) operates as an out-of-band architectural referee. It serves two primary functions: Breaking Doom Loops and Dynamic Persona Routing.

### Persona Routing & Arbitration
At each step, the Clerk evaluates the conversational transcript (`conversationTail`), the project's operational rules (`groundTruths` from `.assistant_rules.toon`), and the overarching project state from the `.epoch-continuity.toon` document. Based on this context, it dynamically assigns the main agent to one of three personas:
- **plan:** Focused on high-level requirements, design, and architecture using `spec` tools.
- **build:** Focused on implementation, coding, and testing.
- **explore:** Restricted read-only persona for codebase familiarization.


### Doom Loop Diagnosis & Context Injection
When triggered by the stall scoring engine, the Clerk performs a **Dynamic Context Analysis** to cure the doom loop using:
- **Action Timeline (Last 8 Turns):** It reviews the specific trace of the last 8 turns, including the tool name, input arguments, result status (completed/error), and the actual **output or error message**.
- **Stall Reason:** It receives an explicit `interventionHint` (e.g., `repetition`, `rambling_hallucination`, or `empty_turn`) from the engine.
- **Continuity Report:** It leverages the `.epoch-continuity.toon` report to understand the broader project state and existing blockers (e.g., unresolved `<template>` tags).

### Prescription: The Loop Breaker
The Clerk generates a **Context-Aware Directive**. By analyzing the error messages in the Action Timeline, it can provide specific technical corrections:
- **Example:** *"STOP calling sc_plan. The Action Timeline shows that sc_plan has failed 3 times with the error: 'Please remove all <template> tags from Tasks.md'. You must use the 'write' tool to populate Tasks.md with concrete steps before calling sc_plan again."*

### User Interruption Integrity
To ensure loop detection is robust, the engine distinguishes between genuine user feedback and system-injected messages. **Internal State Checks** (e.g., `[INTERNAL STATE CHECK]`) are explicitly ignored during the backward history scan. This prevents internal housekeeping from accidentally resetting the loop counters and allowing an agent to stagnate indefinitely.

### Enforcement
The instruction is injected as a `[CRITICAL INTERVENTION]` **Synthetic User Message**. This message sits at the top of the agent's immediate history, effectively overriding the agent's internal "Chain of Thought" and forcing a strategy shift for the next turn.

## 3. Workflow Monotonicity (The Spec Tool)

The `spec` tool ensures that the project state is moving forward.
- **State Stagnation:** If `sc_status` returns an identical state (tasks, requirements, phase) over multiple turns while tools are being called, a stagnation event is triggered regardless of the turn count.
- **Schema-Aware Recovery:** If an agent repeatedly fails a tool call due to syntax errors, the Clerk intervenes with a **Schema Comparison**, showing the agent exactly where its arguments deviate from the expected JSON schema.

## Why this is used
This system allows the agent to take 100+ turns on a massive refactor (where file writes are frequent) while catching a simple 4-turn loop during initialization in under two minutes. By feeding architectural context to the supervisor, we ensure that interventions provide a path forward rather than just a stop condition.