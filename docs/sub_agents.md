# Epoch CLI Subagent Architecture

The Epoch CLI utilizes a multi-agent delegation system to maintain context efficiency and handle complex, turn-intensive tasks without bloating the primary agent's memory. Subagents are specialized, ephemeral personas launched via the `task` tool.

---

## Core Philosophy: The Delegation Pattern
Subagents act as "compressed" cognitive units. By offloading repetitive search, research, or batch processing to a subagent, the **Primary Agent** (Plan or Build) preserves its context window. Once a subagent finishes, it returns only a dense summary of its findings, effectively "zipping" dozens of turns of exploration into a single context-friendly result.

---

## Available Subagents

### 1. The Explorer (`@explore`)
**Purpose:** Specialized in codebase navigation, architectural discovery, and deep-dive research.
*   **Powers:**
    *   **Architectural Discovery (`mcpx map`)**: Empowered to use the full high-density map toolset (`pm_query` for context, `pm_fetch_symbol` for precise extraction).
    *   **High-Fidelity Search**: Access to `glob`, `grep`, and targeted `read` operations.
    *   **Context Pulling**: Extracts specific implementation details or patterns across the monorepo.
*   **Guardrails:**
    *   **Read-Only**: Forbidden from modifying any files.
    *   **No Lifecycle Mutation**: STRICTLY FORBIDDEN from calling `sc_init` or `sc_approve`.
    *   **Context Aware**: Automatically injected with the `ACTIVE PROJECT CONTEXT` so it knows which feature it is exploring.

### 2. The Generalist (`@general`)
**Purpose:** Handles multi-step, batch, or "turn-intensive" logic that doesn't fit a specific research pattern (e.g., "Review all tests and identify missing edge cases").
*   **Powers:**
    *   **Full Tool Arsenal**: Has access to all standard engineering tools (`bash`, `read`, `mcpx`).
    *   **Chain of Thought**: Excellent for reasoning through complex instructions and returning a synthesized conclusion.
*   **Guardrails:**
    *   **State Protection**: Like the Explorer, it is forbidden from mutating global project lifecycle state (`sc_init`, `sc_approve`).
    *   **Scoped Execution**: Restricted by the specific prompt provided by the primary agent.

---

## Common Subagent Mandates (System Guardrails)

To ensure system integrity, all subagents operate under the following clinical rules:

1.  **Trust Primary Intent**: Subagents are injected with pointers to the `.history/` directory and the current `ACTIVE PROJECT CONTEXT`. They must assume the primary agent has already performed basic orientation.
2.  **Architectural Discovery First**: Subagents MUST prioritize `mcpx map` tooling over blind `ls` or `glob` loops. They are trained to "Pull" specific code sections using symbols rather than "Pushing" entire files into context.
3.  **State Isolation**: Subagents provide labor, not leadership. They cannot advance the Project Lifecycle or initialize new features.
4.  **Brevity in Reporting**: Subagents are required to return technical, high-signal results without conversational filler, ensuring the primary agent receives only what is necessary to continue.

---

## When to Delegate
The primary agent is instructed to launch a subagent when:
*   **Context is Low**: To avoid a 32K overflow during deep research.
*   **Search is Wide**: When looking for symbols or patterns across many directories.
*   **Logic is Repetitive**: When a task requires inspecting more than 3-5 files individually.
