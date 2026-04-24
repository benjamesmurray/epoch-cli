# Doom Loop Protection

This document outlines the multi-layered strategy used by Epoch CLI to detect and break non-productive repetitive cycles ("doom loops") in autonomous (YOLO) mode.

## Overview

Unlike traditional agents that rely on arbitrary turn limits, Epoch CLI employs a dynamic **Stall Scoring** system combined with **Context-Aware Semantic Analysis** to distinguish between high-complexity progress and genuine stagnation.

## 1. Stall Scoring (The Engine)

The core execution engine maintains a `stallScore` that increments based on the "advancing" nature of an agent's actions.

### Scoring Metrics
| Action Type | Score Adjustment | Description |
| :--- | :--- | :--- |
| **Advancing** | `Reset to 0` | File writes (`edit`, `write`), `task_complete`, `sc_todo_complete`. |
| **Neutral** | `+1` | Read-only operations (`read`, `grep`, `pm_query`, `sc_status`). |
| **Repetitive** | `+5` | Using the exact same tool with the exact same input as a previous turn. |
| **Invalid** | `+3` | Calling tools with arguments that fail schema validation. |

### Thresholds
*   **Threshold 1 (Score 10):** **System Nudge.** The engine injects a subtle warning advising the agent that it appears to be stalling.
*   **Threshold 2 (Score 15):** **Supervisor Intervention.** The engine triggers the Global Intervention Handler. The local-side Clerk performs a diagnostic turn and injects a forceful corrective instruction.

## 2. Supervisor Intervention (The Clerk)

The Supervisor (Clerk) is the "Cure" for doom loops. It operates as an out-of-band architectural referee.

### Diagnosis & Context Injection
When triggered, the Clerk does not just look at turn counts; it performs a **Dynamic Context Analysis**:
- **Action Timeline:** It reviews the sequence of failed tool calls and their specific arguments.
- **Stall Reason:** It receives an explicit `interventionHint` (e.g., `repetition` or `invalid_args`) from the engine.
- **Continuity Report:** It parses the `.epoch-continuity.toon` report from the current session. This allows the supervisor to see the same "ground truth" blockers (e.g., unresolved `<template>` tags) that the agent is struggling with.

### Prescription: The Loop Breaker
The Clerk generates a **Context-Aware Directive**. Unlike generic advice, this directive is specific and actionable:
- **Example:** *"STOP calling sc_plan. You have failed 3 times because of unresolved template tags in Requirements.md. You MUST use the edit tool to remove those tags before proceeding."*

### Enforcement
The instruction is injected as a `[CRITICAL INTERVENTION]` **Synthetic User Message**. This message sits at the top of the agent's immediate history, effectively overriding the agent's internal "Chain of Thought" and forcing a strategy shift for the next turn.

## 3. Workflow Monotonicity (The Spec Tool)

The `spec` tool ensures that the project state is moving forward.
- **State Stagnation:** If `sc_status` returns an identical state (tasks, requirements, phase) over multiple turns while tools are being called, a stagnation event is triggered regardless of the turn count.
- **Schema-Aware Recovery:** If an agent repeatedly fails a tool call due to syntax errors, the Clerk intervenes with a **Schema Comparison**, showing the agent exactly where its arguments deviate from the expected JSON schema.

## Why this is used
This system allows the agent to take 100+ turns on a massive refactor (where file writes are frequent) while catching a simple 4-turn loop during initialization in under two minutes. By feeding architectural context to the supervisor, we ensure that interventions provide a path forward rather than just a stop condition.