# cli-only-streamlining - Task List

## Implementation Tasks

- [ ] 1. **Delete GUI and Web Packages**
    - [x] 1.1. Remove specific package directories.
        - *Goal*: Eliminate the source code for the graphical app, web UI, console, and related UI components.
        - *Details*: Use shell commands to recursively delete `packages/app`, `packages/console`, `packages/desktop-electron`, `packages/ui`, `packages/web`, and `packages/storybook`.
        - *Requirements*: "The packages/app and packages/web (or equivalent UI packages) are completely removed from the repository."
- [x] 2. **Clean up Configuration Files**
    - [x] 2.1. Update Root `package.json`
        - *Goal*: Remove any workspace scripts or devDependencies that specifically target the deleted packages.
        - *Details*: Audit `scripts` for commands like `dev:app`, `build:web`, etc., and remove them.
        - *Requirements*: "All UI-specific dependencies and build steps are removed from package.json..."
    - [x] 2.2. Update `turbo.json`
        - *Goal*: Remove build/test pipeline definitions for the deleted packages.
        - *Details*: Remove pipeline configurations specific to the deleted packages to ensure Turbo doesn't fail trying to build non-existent projects.
        - *Requirements*: "All UI-specific dependencies and build steps are removed from... turbo.json"
    - [x] 2.3. Clean up `sst.config.ts` and Infrastructure Code
        - *Goal*: Remove AWS/infrastructure deployment configuration for the deleted Web and Console apps.
        - *Details*: Edit `sst.config.ts` and any relevant files in `infra/` to exclude the console and web stacks.
        - *Requirements*: "Streamline the remaining codebase by removing unneeded dependencies... specific to the web or GUI app."
    - [x] 2.4. Update Nix Configurations
        - *Goal*: Ensure Nix flake and related configs don't attempt to build the desktop app.
        - *Details*: Remove references to `desktop.nix` in `flake.nix` and delete `nix/desktop.nix` if it solely serves the desktop app.
        - *Requirements*: "All UI-specific dependencies and build steps are removed from... other configuration files."
- [x] 3. **Clean up CI Workflows and Internal Scripts**
    - [x] 3.1. Update GitHub Actions
        - *Goal*: Remove CI steps that test or build the deleted UI components.
        - *Details*: Audit files in `.github/workflows/` (e.g., removing Playwright e2e workflows for the App).
        - *Requirements*: "Streamline the remaining codebase by removing unneeded dependencies, packages, and infrastructure"
    - [x] 3.2. Update Build/Dev Scripts
        - *Goal*: Ensure any custom scripts in `script/` do not reference the deleted packages.
        - *Details*: Check scripts like `script/beta.ts` or `script/publish.ts` and remove references to `packages/app`, `packages/desktop-electron`, etc.
        - *Requirements*: "The core CLI assistant can be built, installed, and run without errors."
- [x] 4. **Validation and Fixing Breakages**
    - [x] 4.1. Run Full Workspace Build
        - *Goal*: Verify that the remaining workspace builds successfully.
        - *Details*: Run the root build command (e.g., via turbo or npm scripts) and fix any compilation errors or missing dependencies caused by the deletions (e.g., unresolved workspace imports).
        - *Requirements*: "The core CLI assistant can be built, installed, and run without errors."
    - [x] 4.2. Run Core Tests
        - *Goal*: Ensure that the CLI functionality is intact.
        - *Details*: Run tests for `packages/epochcli`, `packages/plugin`, and `packages/sdk` to verify everything works.
        - *Requirements*: "Automated tests verify that the CLI functionality is intact."

## Task Dependencies

- Task 1 (Deletion) must be completed first to reveal configuration and build breakages.
- Task 2 (Configuration Cleanup) and Task 3 (Workflow Cleanup) can be done in parallel or sequentially.
- Task 4 (Validation) must be done last to catch any lingering issues from the cleanup steps.
