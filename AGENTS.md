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
- Always run `bun typecheck` from package directories (e.g., `packages/epochcli`), never `tsc` directly.

## MCPX Tooling & Execution Guide

You have access to a terminal environment via the `mcpx` tool. You must not look for raw JSON-RPC schemas; instead, you will interface with all external capabilities using standard shell commands.

**Universal Syntax:** You must always route your commands through the `mcpx` CLI using the following exact structure:
`mcpx <server_name> <tool_name> [--flag=value]`

**Self-Discovery (CRITICAL):**
If you do not know the exact arguments for a specific tool, **do not guess**. Run the help command first to pull the schema-aware documentation:
`mcpx <server_name> <tool_name> --help`

### 1. Project Constitution & Rules (`ground-truth-cli`)
Use this server to read the rigid behavioral constraints and technical context of the current repository. *If starting a new session, run the scan to orient yourself.*
* **Check Orientation:** `mcpx ground-truth-cli gt_status`
* **Scan Repo & Build Rules:** `mcpx ground-truth-cli gt_exec --action="scan" --path="."`
* **Force Rule Refresh:** `mcpx ground-truth-cli gt_refresh`

### 2. Workflow State Machine (`mcp-spec-cli`)
Use this server to manage your workflow state (Requirements → Design → Tasks). Do not manage this state in your own memory; rely on the CLI.
* **Start a New Feature:** `mcpx mcp-spec-cli sc_init --name="<feature_name>"`
* **Pull Phase Instructions:** `mcpx mcp-spec-cli sc_guidance` (Run this if you are ever confused about what to do next).
* **Progress the Workflow:** `mcpx mcp-spec-cli sc_plan --instruction="<optional_context>"`
* **Approve Drafted Phase:** `mcpx mcp-spec-cli sc_approve`
* **Manage Tasks:** `mcpx mcp-spec-cli sc_todo_list` / `mcpx mcp-spec-cli sc_todo_start --id="<task_id>"` / `mcpx mcp-spec-cli sc_todo_complete --id="<task_id>"`

### 3. Codebase Navigation (`project-map-cli`)
Use this server to read and understand the repository architecture without reading raw, token-heavy files. It responds in dense TOON (Token-Oriented Object Notation).
* **Initialize/Refresh Map:** `mcpx project-map-cli pm_init --profile=light`
* **Check Map Status:** `mcpx project-map-cli pm_status`
* **Search for Symbols/Context:** `mcpx project-map-cli pm_query --query="<search_string>"` or `--path="<file_path>"`
* **Analyze Blast Radius:** `mcpx project-map-cli pm_plan --fqn="<fully_qualified_name>"`

**Execution Rule:** When invoking these via your `mcpx` JSON tool, map the server name to the `server` parameter, the tool name to the `tool` parameter, and supply the flags accurately in the `flags` or `args` payload.

## Behavioral Constraints
Trigger: Generating code in response to a user prompt.
Behaviour: Suppress conversational filler, apologies, and concluding remarks. Output ONLY context and code.
Example: Correct: 'Update condition: if (x > 0).' Incorrect: 'Certainly! I can help. if (x > 0). Let me know!'

Trigger: User asks a non-coding general knowledge question.
Behaviour: Keep the answer strictly under 2 sentences and immediately pivot back to the codebase.
Example: Correct: 'Docker isolates environments. Should we write a Dockerfile for this repo?' Incorrect: '[3 paragraphs on the history of containerization]'