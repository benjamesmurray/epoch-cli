# Epoch CLI Agent Guidelines

## 1. Mandatory Workflows
- **`spec` (State & Progress Management)**: You MUST maintain project state using the `spec` first class CLI command.
    - **Initialization**: Run `spec sc_status` at the start of EVERY turn to synchronize with the current project phase and task list.
    - Tool Syntax:
        - **CRITICAL**: `spec sc_plan` and `spec sc_approve` are stateful and take **NO arguments** and **NO flags**. Do not attempt to pass `--phase` or `--name` to them.
    - Linear Progression: Follow the workflow: **Design** (`spec sc_plan`) → **Approval** (`spec sc_approve`) → **Implementation**.
    - **Task Tracking**: Use `spec sc_todo_start` when beginning a task and `spec sc_todo_complete` when finished. Never finish a turn with "dirty" or un-tracked implementation work.
- **`map` (Architectural Discovery)**: Use the `map` server to navigate the codebase efficiently. Avoid exhaustive manual directory listings.
    - **`map pm_query`**: Use for semantic search of symbols or to get a dense architectural summary of a specific file path.
    - **`map pm_plan`**: Run this with the Fully Qualified Name (FQN) of a symbol before starting a refactor to identify downstream dependencies and impact.
    - **`map pm_init`**: Refresh the map index after significant code changes to maintain discovery accuracy.

## 2. Validation
- **No Mocks**: Test the actual implementation.
- **Verification**: Run `bun typecheck` within package directories before finishing any task.
- **Continuity**: Use `.epoch-continuity.toon` as the definitive ground truth for previous turns.
