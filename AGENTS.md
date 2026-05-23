# Epoch CLI Agent Guidelines

## 1. Mandatory Workflows
- **`mcpx` (Unified MCP Interface)**: Use for ALL MCP interactions (spec, map, ground, github).
    - **Syntax**: Pass arguments via standard flags, `key=value` strings, or structured JSON.
    - **Self-Discovery**: Use `tool="--help"` or `args=["--help"]` to inspect servers/tools.
- **`spec` (State Management)**: Maintain project state via `mcpx` server="spec".
    - **Linear Progression**: `sc_init` -> `write Specification.md` -> `sc_approve` -> `write Tasks.json` -> `sc_approve` -> `Build`.
    - **Arguments**: `sc_init` MANDATES the `name` parameter (e.g., `flags: {"name": "my-feature"}`). `sc_plan` and `sc_approve` take NO arguments. `sc_todo_*` requires `--id`.
- **`map` (Architectural Discovery)**: Use `mcpx` server="map" for navigation. Prefer `pm_status` and `pm_query` over manual `ls` or `glob`.

## 2. Enforcement
- **Drafting Wall**: All template tags in `Specification.md` must be cleared and `template_tags_present` set to `false` before implementation.
- **Orientation**: Trust the provided context. If `ORIENTATION_REQUIREMENTS: SATISFIED` is present, do not repeat discovery tools.
- **YOLO Mode**: Proceed autonomously until `task_complete` is called.

## 3. Subagent Guardrails
- **No State Mutation**: Subagents (e.g., `@explore`, `@general`) are STRICTLY FORBIDDEN from calling `sc_init` or `sc_approve`. Only the primary `plan` or `build` agent may mutate the global project lifecycle state.
- **Architectural Discovery**: Subagents MUST prioritize `mcpx map` tools (`pm_query` for context, `pm_fetch_symbol` for precise code extraction) to navigate the codebase efficiently. Avoid wide `glob` or `read` loops on large files.
