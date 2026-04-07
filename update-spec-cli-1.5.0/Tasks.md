# update-spec-cli-1.5.0 - Task List

## Implementation Tasks

- [x] 1. **Upgrade and Verify mcp-spec-cli Binary**
    - [x] 1.1. Confirm `mcp-spec-cli` version is 1.5.0 in its `package.json`.
        - *Goal*: Ensure the source code is at the correct version.
        - *Details*: Check `/home/benmurray/Projects/cli/mcp-spec-cli/package.json`.
        - *Requirements*: Version Upgrade
    - [x] 1.2. Verify build artifacts in `mcp-spec-cli/dist`.
        - *Goal*: Ensure the project is built and ready for use.
        - *Details*: Run `npm run build` in `mcp-spec-cli` and check for `dist/index.js` and `dist/cli.js`.
        - *Requirements*: Version Upgrade
- [x] 2. **Configure Epoch CLI to use mcp-spec-cli 1.5.0**
    - [x] 2.1. Verify `.gemini/settings.json` configuration.
        - *Goal*: Ensure the Epoch CLI uses the updated local build.
        - *Details*: Check that `mcp-spec-cli` points to `/home/benmurray/Projects/cli/mcp-spec-cli/dist/index.js`.
        - *Requirements*: Version Upgrade
- [x] 3. **Validate New Workflow Features**
    - [x] 3.1. Verify "GPS Breadcrumb" system via `sc_status`.
        - *Goal*: Confirm the tool provides "Next Step" directives.
        - *Details*: Run `sc_status` for the `update-spec-cli-1.5.0` feature and check for the `Next Step:` field.
        - *Requirements*: GPS Breadcrumb Integration
    - [x] 3.2. Validate State-Aware Autopilot transitions.
        - *Goal*: Ensure approval gates are working as intended.
        - *Details*: Call `sc_exec plan` and verify it requires user approval (as seen in previous steps).
        - *Requirements*: State-Aware Autopilot, Autonomous Ambiguity Check
    - [x] 3.3. Test Persistent Task-Epoch Memory.
        - *Goal*: Confirm `.epoch-context.md` updates correctly.
        - *Details*: Use `sc_exec epoch` to set focus and verify the content of `update-spec-cli-1.5.0/.epoch-context.md`.
        - *Requirements*: Persistent Task-Epoch Memory
- [x] 4. **Regression Testing for Task Management**
    - [x] 4.1. Verify Markdown Lexer reliability with a dummy task.
        - *Goal*: Ensure `Tasks.md` updates are surgical and accurate.
        - *Details*: Create a dummy task, start it, and complete it, then inspect `Tasks.md` for formatting issues.
        - *Requirements*: Markdown Lexer Reliability

## Task Dependencies

- Task 1 must be completed before all other tasks.
- Task 2 depends on Task 1.
- Task 3 and Task 4 depend on Task 2 being correctly configured.

## Estimated Timeline

- Task 1: 15 minutes
- Task 2: 5 minutes
- Task 3: 15 minutes
- Task 4: 10 minutes
- **Total: 45 minutes**
