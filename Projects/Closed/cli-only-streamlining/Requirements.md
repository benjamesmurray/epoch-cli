# cli-only-streamlining - Requirements Document

Streamline the codebase to retain only the CLI assistant, removing the app and web UI components.

## Core Features

- Remove the graphical application (App) and web user interface (Web UI) from the repository.
- Retain the CLI assistant as the sole entry point and primary method of interacting with the coding assistant.
- Streamline the remaining codebase by removing unneeded dependencies, packages, and infrastructure specific to the web or GUI app.
- Ensure the CLI tool is fully functional when run inside an IDE terminal (like VSCode).
- Preserve existing MCP tool integrations and core capabilities used by the CLI.

## User Stories

- As a developer, I want to use the coding assistant purely from the CLI so that I have a lightweight, terminal-native experience without overhead from a GUI application.
- As a project maintainer, I want the codebase to be dramatically streamlined by stripping out app and web UI components so that it is easier to maintain and faster to build.

## Acceptance Criteria

- [ ] The `packages/app` and `packages/web` (or equivalent UI packages) are completely removed from the repository.
- [ ] All UI-specific dependencies and build steps are removed from `package.json`, `turbo.json`, and other configuration files.
- [ ] The core CLI assistant can be built, installed, and run without errors.
- [ ] The CLI assistant retains all expected core functionality, including the ability to run within a VSCode terminal.
- [ ] Automated tests verify that the CLI functionality is intact.

## Non-functional Requirements

- **Performance:** Building the project should be significantly faster due to the removed UI and web dependencies.
- **Maintainability:** The codebase complexity should be reduced by eliminating the dual (CLI/GUI) architecture.
