# update-spec-cli-1.5.0 - Design Document

## Overview

The design for updating `mcp-spec-cli` to v1.5.0 focuses on integrating the new state-aware autopilot and GPS breadcrumb system into the Epoch CLI project. This will improve the autonomy and reliability of the development workflow.

## Architecture

The upgrade involves replacing the local `mcp-spec-cli` binaries and updating the project-specific configurations to leverage the new features.

1.  **Binary Update:** The `mcp-spec-cli` directory in the root of the project is updated from the remote repository.
2.  **Configuration:** The `.gemini/settings.json` file is verified to point to the correct build artifacts (`dist/index.js`).
3.  **Workflow State:** The `mcp-spec-cli` internal state manager will now automatically handle phase transitions based on user approval.
4.  **Short-term Memory:** The `.epoch-context.md` file will be managed by the new state-aware system.

## Components and Interfaces

- **`sc_status`:** Updated to provide `Next Step` directives derived from the internal state machine.
- **`sc_exec plan`:** Updated to enforce approval-based transitions.
- **`sc_exec epoch`:** Updated to maintain persistent focus and hypotheses.
- **Task Lexer:** A new `marked`-based lexer handles surgical updates to `Tasks.md`.

## Data Models

The project continues to use Markdown-based specifications:
- `Requirements.md`
- `Design.md`
- `Tasks.md`
- `Testing.md`
- `.epoch-context.md` (Updated format for 1.5.0)

## Error Handling

- **Validation Errors:** The `sc_verify` tool will be used to check if transitions and task updates were successful.
- **State Mismatch:** The tool will provide clear error messages if a command is executed out of phase.

## Testing Strategy

- **Version Verification:** Run `npm list mcp-spec-cli` (or check `package.json`) and verify the build.
- **Workflow Validation:** Perform a full cycle (Requirements -> Design -> Tasks) for a dummy feature to ensure "Next Step" directives and approval gates are working.
- **Task Update Test:** Manually start and complete a task via `sc_exec todo` and verify the `Tasks.md` file is updated correctly without formatting issues.
