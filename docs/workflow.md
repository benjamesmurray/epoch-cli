# Deterministic Agent Workflow & Persona Routing

This document outlines the architectural approach to managing agent personas and tool permissions within the Gemini CLI, specifically focusing on the transition from probabilistic to deterministic routing.

## 1. Overview

The Gemini CLI uses a multi-persona architecture to enforce engineering discipline. Agents are assigned specific personas based on their current task:

- **`plan`**: Restricted to high-level specification drafting and implementation planning.
- **`build`**: Authorized to write source code, execute complex bash commands, and run tests.
- **`explore`**: A read-only persona for codebase discovery and research.

## 2. Deterministic State-Driven Routing

Previously, a "Clerk" (supervisor) model attempted to guess the appropriate persona by analyzing conversation transcripts. This probabilistic approach was replaced with **Deterministic Routing** to eliminate execution stalls and "persona lock."

### How it Works

The orchestration loop identifies the active persona by reading the **Project State** directly from the `.epoch-continuity.toon` report and the `spec` MCP server:

1.  **State Detection**: At the start of every turn, the middleware parses the `workflow_map` in the continuity report.
2.  **Phase Mapping**:
    *   If the current phase is `Specification` or `Tasks`, the agent is pinned to the **`plan`** persona.
    *   If the current phase is `Implementation` or if the status indicates tasks are ready, the agent is elevated to the **`build`** persona.
3.  **Auto-Elevation**: The transition is automatic. The moment a planning document is approved (e.g., via `mcpx [spec.sc_approve]`), the system detects the state change and elevates the agent's permissions for the very next turn.

## 3. Removal of the Arbitration Mechanism

With the introduction of deterministic routing, the `object_to_supervisor` tool and the associated arbitration logic have been **deprecated and removed**. 

- **No More Permission Requests**: Agents no longer need to "object" or request a phase shift. The environment simply grants the necessary tools as soon as the project state warrants it.
- **Actionable Tool Errors**: Instead of a "Supervisor" restricting the agent, tool-level permissions provide immediate feedback. If an agent attempts to write code prematurely, it receives a technical error explaining which planning step is missing.

## 4. Spec Workflow Integration

Deterministic routing is tightly coupled with the `spec` tool's mandatory sequence:

1.  **`sc_init`**: Initializes the feature (Agent set to `plan`). Scaffolds `Specification.md`.
2.  **Drafting**: `Specification.md` is written (combining requirements and design).
3.  **`sc_approve`**: Finalizes the specification phase.
4.  **`sc_plan`**: Scaffolds `Tasks.md`.
5.  **`sc_approve`**: Finalizes the planning phase.
6.  **Auto-Shift**: The orchestrator detects approval and shifts the agent to `build`.
7.  **Implementation**: The agent gains access to `write`, `edit`, and `bash`. 
    *   **Action Bias Requirement:** Once elevated to `build`, the agent is expected to prioritize immediate implementation over further discovery.
    *   **Task Management**: Use `sc_todo_start --id <id>` and `sc_todo_complete --id <id>` for atomic tracking.
    *   **Epoch Context**: Use `sc_epoch` to maintain short-term memory in `.epoch-context.md`.

## 5. Benefits

- **Reliability**: Eliminates "persona lock" where an agent is ready to code but lacks permission.
- **Efficiency**: Reduces token waste by removing the need for agents to explain their reasoning to a supervisor.
- **Clarity**: The agent always knows its current phase and exactly what is required to advance.
