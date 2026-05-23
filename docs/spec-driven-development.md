# Spec-Driven Development & Handover Mechanics

This document is the authoritative reference for the Gemini CLI's Spec-Driven Development (SDD) workflow and the deterministic mechanics that manage agent personas and tool permissions.

---

## 1. Multi-Persona Architecture

To enforce engineering discipline, the Gemini CLI uses a deterministic, state-driven persona system. Tool permissions are gated by the active persona:

- **`plan`**: Restricted to high-level specification drafting and implementation planning. Authorized for `read`, `mcpx spec`, and `mcpx map`. Forbidden from source code modification.
- **`build`**: Authorized to write source code, execute complex bash commands, and run tests. Gains access to `write`, `replace`, and `run_shell_command`.
- **`explore`**: A read-only persona for codebase discovery and research. Default state when no project is active.

---

## 2. The 4-Phase Lifecycle

The workflow follows a mandatory sequence enforced by the `spec` MCP server.

1.  **Specification (`sc_init`)**: Initialize requirements and design in `Specification.md`. **Note**: A project name is MANDATORY (e.g., `flags: { "name": "my-feature" }`).
2.  **Implementation Planning (`sc_plan`)**: Define atomic tasks in `Tasks.json`.
3.  **Build (Implementation)**: Execute tasks using `sc_todo_start` and `sc_todo_complete`.
4.  **Archive (`sc_plan` / `sc_todo_complete`)**: Move the completed project to `projects/completed/`.

---

## 3. The "Drafting Wall" & Blockers

You cannot advance the workflow until specific "blockers" are cleared. This is verified programmatically during `sc_approve`.

- **Specification Blockers**: All `<template-specification>` tags must be removed from `Specification.md`.
- **Task List Blockers**: The `Tasks.json` file must have `"template_tags_present": false`. **Note**: This check is *adaptive*; the system will automatically clear the blocker if it detects significant implementation detail (e.g., more than 2 tasks or custom titles), ensuring agents are not blocked by a minor flag oversight after drafting a real plan.

---

## 4. Deterministic State Table

The active persona is determined by the output of `mcpx spec sc_status`.

| Phase | Status | Agent Persona | Next Step Requirement |
| :--- | :--- | :--- | :--- |
| `specification` | `drafting` | `plan` | Clear template tags in `Specification.md`. |
| `specification` | `reviewing` | `plan` | Call `sc_approve` (Human). |
| `tasks` | `drafting` | `plan` | Clear template flags in `Tasks.json`. |
| `tasks` | `reviewing` | `plan` | Call `sc_approve` (Human). |
| `implementation` | `active` | **`build`** | Call `sc_todo_start` to begin work. |
| `implementation` | `building` | **`build`** | Complete task and call `sc_todo_complete`. |

---

## 5. Handover Technical Mechanics

The transition from `plan` to `build` is managed via a deterministic synchronization layer:

### Semaphore Files
Upon successful `sc_approve` of the Tasks phase, the system creates a hidden marker file:
- Path: `projects/active/<feature-id>/.spec-tasks-approved`
- This file is the "Physical Source of Truth."

### Immediate Epoch Reset
The moment the `.spec-tasks-approved` semaphore is created, the system MUST trigger a **Hard Reset** (start a new epoch). This clears previous conversational context, enforces a clean cognitive break, and prevents the agent from falling into exploratory loops.

### Deterministic Persona Routing (The Clerk)
The system middleware (Clerk) detects the semaphore file at the start of every turn. If `.spec-tasks-approved` exists, the agent is **automatically and deterministically assigned the `build` persona**, bypassing LLM-based classification. This ensures an absolute handover that unlocks write access even across context rotations (Epochs).

### Epoch Initiation Models & Grounding Protocols
To prevent orientation loops and the Stagnation Trap, the system injects specific grounding protocols depending on the phase. There are three distinct Epoch Initiation Models:

1. **Type 1: Planning Phase**
   - **Context:** Agent is in the `plan` persona drafting specs or tasks.
   - **Directive:** Focuses the agent on discovery, architecture mapping, and drafting. Expects the agent to conclude with `sc_approve`.
2. **Type 2: First Handover to Build Phase (The Kickoff)**
   - **Context:** Injected immediately after the Tasks.json `sc_approve` triggers the Hard Reset.
   - **Directive:** Explicitly states: `ORIENTATION_REQUIREMENTS: SATISFIED. Deep Inception applied. You are in the Build Phase.` It dynamically extracts the actual ID of the first task from `Tasks.json` and mandates that the agent's **IMMEDIATE first action MUST be executing `mcpx spec sc_todo_start`** for that specific task (e.g., `id="1"` or `id="backend-setup"`). It expressly forbids redundant reads of `Specification.md` or `Tasks.json`.
3. **Type 3: Continue the Build Phase**
   - **Context:** Injected for any subsequent epoch transitions during active implementation.
   - **Directive:** Dynamically reminds the agent of the current or next pending task ID. Provides pointers to the `.history/` directory for orientation, explicitly instructs the agent to use `mcpx map context` or `mcpx map fetch` for codebase awareness instead of repetitive `read` loops on large files, and directs it to use `mcpx spec sc_status` if unsure of the current task.

---

## 6. Verification & Troubleshooting Checklist

If an agent is "stuck" in Plan Mode or cannot write code, follow this verification sequence:

1.  **Check Semaphore**: Does `projects/active/<feature-id>/.spec-tasks-approved` exist?
    - *No*: The implementation plan was never officially approved via `sc_approve`.
2.  **Verify sc_status**: Run `mcpx spec sc_status`.
    - Does it show `phase: implementation` and `status: active`?
    - If it still shows `phase: tasks`, the agent hasn't cleared the "Drafting Wall."
3.  **Inspect Continuity Report**: Check `.epoch-continuity.toon`.
    - Does it contain `phase: 'implementation'`?
    - If not, the Clerk cannot route the persona correctly.
4. **Check Persona in TUI**: Look at the "Agent" badge in the TUI.
    - If it says `plan` while the project is in `implementation`, the persona routing has failed. Restart the session to force a fresh state scan.
5. **Look for Handover Protocol**: Inspect the system prompt (Zone 1) for the `BUILD PHASE HANDOVER` block. If missing, the prompting engine did not detect the transition.
6. **Detect Orientation Loops**: Check logs for `stallReason=orientation_loop` or `stallReason=repetition`. 
    - This happens if the agent ignores the `ORIENTATION_REQUIREMENTS: SATISFIED` directive and repeatedly re-reads files instead of taking action.

---

## 7. Tasks.json Schema Requirements

To ensure the `spec` MCP server and the internal TUI synchronization function correctly, `Tasks.json` MUST follow a specific schema. The `sc_approve` tool enforces these requirements programmatically.

- **Root Structure**: MUST be an **OBJECT** with a `"tasks"` key. Top-level arrays are forbidden.
- **Required Task Fields**:
  - `id`: A unique identifier (string or number). **MANDATORY: Must follow a numeric pattern (e.g., "1", "1.1") to satisfy hierarchy requirements.**
  - `title`: A short, descriptive name for the task. **(MANDATORY)**
  - `description`: A detailed explanation of the implementation steps. **(MANDATORY)**
  - `status`: The current state, usually initialized as `"pending"`.
  - `dependencies`: (Optional) An array of task IDs that must be completed first.

**Common Pitfalls:**
- **Top-level Array**: The `spec` server will fail if the file is a raw `[...]`. Wrap it in `{ "tasks": [...] }`.
- **Non-numeric IDs**: Using descriptive strings (e.g., `"setup-project"`) as IDs will cause errors in the `spec` server. Use numbers.
- **Missing `title`**: The `spec` server will fail with a `missing field title` error if this is omitted. Do NOT use `details` or only `description`.
- **Tool Argument Confusion**: If you receive a `missing field title` error, it refers to the **schema of Tasks.json**, NOT a missing flag for the `sc_todo_start` command. Do NOT try to pass `--title` to `sc_todo_start`. Fix the JSON file instead.
- **Missing Field ID**: If `sc_todo_start` fails with `missing field id`, check that you are using the `--id` flag and that the ID in your JSON file is numeric.
- **Ghost Tags**: Ensure `template_tags_present` is set to `false` after drafting your real plan.

---

## 8. Operational Rules

- **No Permission Requests**: The `object_to_supervisor` tool is deprecated. The system elevates permissions automatically.
- **Action Bias**: Once in `build` mode, prioritize implementation over discovery.
- **Trust Deep Inception**: During Epoch transitions, trust the pre-injected context. Do NOT re-run `sc_status` or `read` on files explicitly provided in the handshake.
- **Stale Write Protection (Safer Auto-Read)**: To prevent blind-overwriting, the CLI enforces a "Read-Before-Write" policy. If an agent attempts to `write` or `edit` a file it hasn't read, the system triggers a **Safer Auto-Read** intervention:
    1. **Auto-Injection**: The system reads the file and injects its content into the error result.
    2. **Lock Release**: The system marks the file as "read," satisfying the safety requirement for the next turn.
    3. **Recovery**: The agent must review the injected content and re-issue the command.

---

## 10. Continuity & Orientation (Lazy Injection)

To prevent wasting context window on re-discovery while avoiding payload bloat, the system uses a **Lazy Injection** protocol during Epoch transitions. This is critical during Type 2 and Type 3 epoch initiations:

### The Trust-Based Handshake
When a new epoch starts, the system provides explicit pointers to the `.history/` directory and active project artifacts. It accompanies this with a mandatory directive:
`ORIENTATION_REQUIREMENTS: SATISFIED. Do NOT repeat discovery.`

### The Stagnation Trap
Agents must resist the urge to "re-verify" the state using blind `read` or `glob` loops. They must instead rely on targeted Project Map tooling (`mcpx map context` or `mcpx map fetch`) to pull only the specific code or spec sections needed for the immediate sub-task. The internal **Heuristics Engine** monitors for redundant actions. If an agent performs discovery on state that has already been satisfied, the system will flag a **Terminal Stagnation**. 

**Note**: The **Safer Auto-Read** mechanic (Section 9) is specifically designed to prevent stagnation loops caused by the Read-Before-Write safety lock by automatically providing the necessary context in a single failing turn.

---

## 11. Automated Testing

The handover mechanics and deterministic routing are verified by the following test suite:
- **Location**: `packages/epochcli/test/session/deterministic-handover.test.ts`
- **Coverage**:
    - Automatic semaphore file creation on `sc_approve`.
    - Immediate agent persona shift and synthetic message injection.
    - Drafting Wall enforcement (blocking approval with template tags).

Run the tests using: `bun test packages/epochcli/test/session/deterministic-handover.test.ts`
