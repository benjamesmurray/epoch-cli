# Epoch CLI Agent Guidelines

## 1. Mandatory Workflows
- **`mcpx` (Unified MCP Interface)**: Use this tool for ALL interactions with MCP servers (spec, map, ground, github).
    - **Argument Syntax**: You can pass tool arguments using standard flags (e.g., `--name "project x"`), positional `key=value` strings, or structured JSON `flags`. The `mcpx` interface is schema-aware and will automatically normalize your inputs to match the target server's required format.
        - **Example (CLI)**: `mcpx-rust spec sc_init --name "project x"`
        - **Example (AI Tool)**: `mcpx(server="spec", tool="sc_init", flags={"--name": "project-x"})`
    - **Self-Discovery**: If you are unsure of a server's capabilities or a tool's schema, you MUST use the `mcpx` tool to discover them:
        - **List Tools**: Call `mcpx` with `server="<server_name>"` and `tool="--help"`.
        - **Inspect Tool**: Call `mcpx` with `server="<server_name>"` and `tool="<tool_name>"` and include `"--help"` in the `args` array.
- **`spec` (State & Progress Management)**: You MUST maintain project state using the `mcpx` tool with the `spec` server.
    - **Project Naming**: When initializing a new project or feature (e.g., `sc_init`, `init`), ALWAYS use the `--name` flag to provide a descriptive, human-readable name (e.g., `smart-home-controller`).
    - **Initialization**: Run `mcpx` with `server="spec"` and `tool="sc_status"` followed by `sc_epoch` at the start of EVERY turn to synchronize with the current project phase, task list, and short-term focus.
    - **Tool Syntax**:
        - **CRITICAL**: `sc_plan` and `sc_approve` are stateful and take **NO arguments** and **NO flags**.
        - **Tasks**: `sc_todo_start` and `sc_todo_complete` require a mandatory `--id` flag (e.g., `sc_todo_start --id 1.1`).
    - **Linear Progression (The Documentation-to-Build Pipeline)**: You MUST follow this specific sequence to ensure architectural integrity:
        1. **Initialize**: `mcpx spec sc_init --name <project-name>` (scaffolds `Specification.md`)
        2. **Specification**: `write Specification.md` -> `sc_approve`
        3. **Tasks**: `sc_plan` (scaffolds `Tasks.md`) -> `write Tasks.md` -> `sc_approve`
        4. **Build**: `sc_todo_start --id <id>` -> `write [code]` -> `sc_todo_complete --id <id>`
- **`map` (Architectural Discovery)**: Use the `mcpx` tool with the `map` server to navigate the codebase efficiently. Avoid exhaustive manual directory listings.
    - **`pm_query`**: Use to get a dense architectural summary of a specific file path or find a symbol by name.
    - **`pm_semantic_search`**: Search for logic using natural language keywords (e.g., 'auth', 'database').
    - **`pm_fetch_symbol`**: Extract raw source code for a specific class or function (token-efficient hydration).
    - **`pm_check_blast_radius`**: Identify all components that depend on or import a specific symbol.
    - **`pm_plan`**: Analyze the architectural impact (fan-out) of a symbol before starting a refactor.
    - **`pm_init`**: Refresh the map index after significant code changes to maintain discovery accuracy.

## 2. Validation
- **No Mocks**: Test the actual implementation.
- **Verification**: Run `bun typecheck` within package directories before finishing any task.
- **Proactive Testing**: You MUST proactively write unit tests using the testing framework of your chosen language (e.g., `pytest` for Python, `cargo test` for Rust, `bun test` for JS/TS). The automated test harness requires these unit tests to pass during evaluation.
- **Continuity**: Use `.epoch-continuity.toon` and `.epoch-context.md` (managed by `sc_epoch`) as the definitive ground truth for previous turns.
    - **CRITICAL**: Your first priority is to resolve the `residual_blockers` from `.epoch-continuity.toon`.
    - **FOCUS**: Read `.epoch-context.md` to recover your immediate focus, pending intentions, and active hypotheses.
    - **NO REDUNDANCY**: Do NOT perform discovery (`ls`, `read`, `grep`, `sc_status`, `pm_query`, `pm_status`) for information already summarized in the report. Do NOT repeat successful actions (e.g., `sc_init`, `write` of a completed file) that are listed in `completed_tools` or `technical_progress`.
    - **ACTION BIAS**: Upon resumption (EPOCH_TRANSITION), you MUST immediately execute the next pending action listed in the report. Discovery tools are strictly prohibited for the first 3 turns of a new epoch unless the previous tool call failed.
    - **LONGITUDINAL MEMORY**: If you find yourself repeating discovery tools or are unsure of the implementation plan, `read .history/intent.toon` to recover the full architectural history of the project.

## 3. Behavioral Constraints
- **Decisive Action**: When you receive a "Stall Hint" (e.g., "Please finish editing Specification.md", "Tasks not complete"), do NOT perform more than one exploratory action (`read`, `ls`, `grep`, `mcpx map pm_query`) before applying a decisive fix using `edit` or `write`. Your primary priority is to resolve the blocker and progress the workflow.
- **Tone**: Maintain extreme technical brevity. Responses should be dense with architectural context, code-centric, and devoid of filler.