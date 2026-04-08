# cli-only-streamlining - Design Document

## Overview

The objective is to streamline the current multi-package monorepo into a CLI-only application. By removing the graphical desktop application (Electron), the web application, the console, and their associated shared UI components, we will significantly reduce build times, minimize the codebase surface area, and focus development solely on the CLI/Terminal experience. This ensures the coding assistant is lightweight and optimized for use within IDE terminals like VSCode.

## Architecture

We are transitioning from a dual CLI/GUI architecture to a strictly CLI-based architecture. The core application logic and MCP integrations residing in `packages/epochcli`, `packages/plugin`, `packages/sdk`, `packages/util`, and `packages/script` will be retained as the foundation. The primary entry point for users will be the Terminal User Interface (TUI) located in `packages/epochcli/src/cli/cmd/tui`. 

The VSCode extension (`sdks/vscode`) is also retained to ensure seamless IDE integration. Root configuration files (`package.json`, `turbo.json`, `sst.config.ts`, `flake.nix`) will be systematically updated to remove all references to the deleted packages and deployment targets.

## Components and Interfaces

- **Components to be Removed:** 
  - `packages/app` (React/Solid graphical app)
  - `packages/console` (Web-based dashboard/billing)
  - `packages/desktop-electron` (Electron wrapper)
  - `packages/ui` (Shared component library)
  - `packages/web` (Web application and documentation)
  - `packages/storybook` (Component playground)
  - UI-specific configurations in the `infra/` directory.
  - UI-specific E2E tests and CI workflows.

- **Components to be Retained & Adjusted:**
  - `packages/epochcli`: Core CLI engine, TUI, and session management.
  - `packages/plugin`: Plugin management logic.
  - `packages/sdk`: Programmatic interfaces.
  - `packages/util`: Shared utility functions.
  - `packages/script`: Build and utility scripts.
  - `sdks/vscode`: VSCode extension integration.
  
- **Interfaces:** Imports and build scripts in retained packages will be audited to ensure no residual dependencies on the removed packages exist. 

## Data Models

Core data models managing sessions, LLM interactions, storage, and MCP communication inside `packages/epochcli` will remain unchanged. Data models and state structures strictly bound to the graphical user interface (e.g., React Contexts in `packages/app`) will be removed along with their respective packages.

## Error Handling

Error handling will rely exclusively on the existing terminal-based TUI error reporting mechanisms. The focus will be on ensuring that configuration issues, network errors, and MCP connection failures are clearly communicated to the user via the command-line interface. Any error boundaries or UI toasts previously used in the App will be obsolete.

## Testing Strategy

- **Retained Tests:** Unit tests, integration tests, and library-specific tests for `packages/epochcli`, `packages/plugin`, and SDKs will be preserved to ensure core functionality remains intact.
- **Removed Tests:** Playwright E2E tests specifically written for the GUI (`packages/app/e2e`), storybook tests, and web interface tests will be deleted.
- **CI/CD Pipeline:** GitHub Actions workflows will be streamlined to only run build, lint, and test steps for the CLI and its underlying core packages.
