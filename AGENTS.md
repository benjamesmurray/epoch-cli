## Style Guide

### General Principles
- Keep things in one function unless composable or reusable
- Avoid `try`/`catch` where possible
- Avoid using the `any` type
- Prefer single word variable names where possible
- Use Bun APIs when possible, like `Bun.file()`
- Rely on type inference when possible; avoid explicit type annotations or interfaces unless necessary for exports or clarity
- Prefer functional array methods (flatMap, filter, map) over for loops; use type guards on filter to maintain type inference downstream

### Naming & Enforcement (MANDATORY)
- Use single word names by default for new locals, params, and helper functions (e.g., `pid`, `cfg`, `err`, `opts`, `dir`, `root`, `child`, `state`, `timeout`).
- Multi-word names are allowed only when a single word would be unclear or ambiguous. Do not introduce new camelCase compounds when a short single-word alternative is clear.
- Before finishing edits, review touched lines and shorten newly introduced identifiers where possible.

### Coding Patterns
- **Inlining:** Reduce total variable count by inlining when a value is only used once.
- **Destructuring:** Avoid unnecessary destructuring. Use dot notation to preserve context.
- **Variables:** Prefer `const` over `let`. Use ternaries or early returns instead of reassignment.
- **Control Flow:** Avoid `else` statements. Prefer early returns.
- **Schema Definitions (Drizzle):** Use snake_case for field names so column names don't need to be redefined as strings.

## Testing & Type Checking
- Avoid mocks as much as possible. Test actual implementation, do not duplicate logic into tests.
- Tests cannot run from repo root (guard: `do-not-run-tests-from-root`); run from package dirs like `packages/epochcli`.
- Always run `bun typecheck` from package directories (e.g., `packages/epochcli`), never `tsc` directly. If creating a new package, define the script as `"typecheck": "tsc --noEmit"`.

## MCPX Tooling & Execution Guide

You have access to a terminal environment with pre-installed command shims for MCP capabilities. You must interface with all external capabilities using standard shell commands.

**Universal Syntax:**
`<shim_name> <tool_name> [--flag=value]`

**Self-Discovery (CRITICAL):**
If you do not know the exact arguments for a specific tool, **do not guess**. Run the help command first:
`<shim_name> <tool_name> --help`

### 1. Project Constitution & Rules (`ground`)
Use this to read behavioral constraints. *Always run the scan to orient yourself in a new session.*
* **Check Orientation:** `ground gt_status`
* **Scan Repo & Build Rules:** `ground gt_exec --action="scan" --path="."`
* **Force Rule Refresh:** `ground gt_refresh`

### 2. Workflow State Machine (`spec`)
Use this to manage your workflow state (Requirements → Design → Tasks).
* **Start a New Feature:** `spec sc_init --name="<feature_name>"`
* **Check Status:** `spec sc_status`
* **Verify Project State:** `spec sc_verify`
* **Pull Phase Instructions:** `spec sc_guidance`
* **Progress the Workflow:** `spec sc_plan --instruction="<optional_context>"`
* **Approve Drafted Phase:** `spec sc_approve`
* **Manage Tasks:** `spec sc_todo_list` / `spec sc_todo_start --id="<task_id>"` / `spec sc_todo_complete --id="<task_id>"`
* **Update Context:** `spec sc_epoch --focus="<focus>"`
* **Provide Feedback:** `spec sc_feedback --feedback="<feedback>"`
* **Toggle Mode:** `spec sc_mode --mode="one-shot"`
* **Archive Feature:** `spec sc_archive`

### 3. Codebase Navigation (`map`)
Use this to understand repository architecture via dense TOON (Token-Oriented Object Notation).
* **Initialize/Refresh Map:** `map pm_init --profile=light`
* **Check Map Status:** `map pm_status`
* **Search for Symbols/Context:** `map pm_query --query="<search_string>"` or `--path="<file_path>"`
* **Analyze Blast Radius:** `map pm_plan --fqn="<fully_qualified_name>"`

**Execution Rule:** When invoking these via your `mcpx` JSON tool, map the shim name (e.g., `spec`) to the `server` parameter, the tool name (e.g., `sc_init`) to the `tool` parameter, and supply flags in the `flags` payload.

## Behavioral Constraints
Trigger: Generating code in response to a user prompt.
Behaviour: Suppress conversational filler, apologies, and concluding remarks. Output ONLY context and code.
Example: Correct: 'Update condition: if (x > 0).' Incorrect: 'Certainly! I can help. if (x > 0). Let me know!'

Trigger: User asks a non-coding general knowledge question.
Behaviour: Keep the answer strictly under 2 sentences and immediately pivot back to the codebase.
Example: Correct: 'Docker isolates environments. Should we write a Dockerfile for this repo?' Incorrect: '[3 paragraphs on the history of containerization]'