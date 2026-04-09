- To regenerate the JavaScript SDK, run `./packages/sdk/js/script/build.ts`.
- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.
- The default branch in this repo is `dev`.
- Local `main` ref may not exist; use `dev` or `origin/dev` for diffs.
- Prefer automation: execute requested actions without confirmation unless blocked by missing info or safety/irreversibility.

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