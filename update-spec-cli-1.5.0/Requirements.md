# update-spec-cli-1.5.0 - Requirements Document

The objective of this project is to update the Epoch CLI project to use the latest version of `mcp-spec-cli` (v1.5.0) and leverage its new features for improved development workflows.

## Core Features

- **Version Upgrade:** Upgrade `mcp-spec-cli` to v1.5.0 in the local development environment.
- **GPS Breadcrumb Integration:** Enable the "Next Step" directives in tool outputs to guide the development process autonomously.
- **State-Aware Autopilot:** Utilize the tool's ability to track project stages (Requirements, Design, Tasks) automatically.
- **Autonomous Ambiguity Check:** Incorporate the new requirement to explicitly check for and resolve ambiguities before proceeding to the next stage.
- **Persistent Task-Epoch Memory:** Use the `.epoch-context.md` system for tracking focus and intentions across sessions.
- **Markdown Lexer Reliability:** Ensure task organization and updates use the new robust Markdown lexer.

## User Stories

- As a developer, I want the CLI to tell me the next step in the workflow so I don't have to keep track of it manually.
- As a developer, I want my active focus and hypotheses to persist across sessions so I can resume work exactly where I left off.
- As a developer, I want the tool to help me identify and resolve ambiguities in requirements and design before I start implementation.

## Acceptance Criteria

- [ ] `mcp-spec-cli` is confirmed at version 1.5.0.
- [ ] All `sc_status` calls for the `update-spec-cli-1.5.0` feature provide clear "Next Step" directives.
- [ ] The `.epoch-context.md` file for this feature is updated correctly via `sc_exec epoch`.
- [ ] The workflow transitions (e.g., from Requirements to Design) are enforced by user approval as per 1.5.0 standards.
- [ ] Tasks are organized and refreshed using the new lexer-based system.

## Non-functional Requirements

- **Performance:** The update should not introduce noticeable latency in tool execution.
- **Compatibility:** The new version must be compatible with the existing Epoch CLI project structure.
- **Reliability:** Document parsing and task updates must be 100% accurate.
