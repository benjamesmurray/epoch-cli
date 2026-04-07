# `mcp-spec-cli` v1.5.0 Evaluation Report

## Overview
This report details the findings, friction points, and necessary bug fixes encountered while upgrading and utilizing `mcp-spec-cli` v1.5.0 within the Epoch CLI project. These insights should be considered for the v1.6.0 release to ensure a smoother developer experience.

## Positive Findings
*   **GPS Breadcrumb System:** The `Next Step` directives in `sc_status` provide excellent, autonomous guidance, significantly reducing the cognitive load of managing workflow transitions.
*   **Structured Workflow:** The enforcement of the Requirements -> Design -> Tasks pipeline ensures a methodical approach to feature development.
*   **Task Management:** The introduction of a dedicated `TaskLexer` and `TaskParser` is a significant architectural improvement over brittle regex-based updates, paving the way for more robust task management.

## Friction Points & Difficulties

### 1. Incomplete Command Documentation
*   **Issue:** The `sc_exec epoch` command is functional and registered in `mcp-spec-cli/src/tools/specTools.ts` but is missing from the CLI help output (`sc_help`). Furthermore, when calling `sc_exec` via the MCP server with the `epoch` action, it failed with `params/action must be equal to one of the allowed values` because `epoch` was not included in the `z.enum(['init', 'plan', 'todo'])` definition in `specTools.ts`.
*   **Impact:** Users (and AI agents) are unaware of the `epoch` command's availability or how to use its flags (`--focus`, `--intentions`, etc.) without inspecting the source code, and MCP execution of the command is broken.
*   **Recommendation for v1.6.0:** 
    *   Update the `help` output in `cli.ts` to include the `epoch` command and its options.
    *   **Crucially:** Update `specTools.ts` to include `'epoch'` in the Zod enum for `action`: `action: z.enum(['init', 'plan', 'todo', 'epoch'])`.

### 2. Working Directory Resolution
*   **Issue:** When executing `sc_exec` commands via the built `dist/cli.js` (e.g., `node /path/to/dist/cli.js exec plan --feature my-feature`), the tool frequently failed to locate the feature directory, throwing "Error: Directory does not exist". This occurred specifically when the command was run from *within* the `mcp-spec-cli` directory rather than the project root.
*   **Impact:** Requires strict execution from the project root or brittle path handling.
*   **Recommendation for v1.6.0:** Ensure `SpecManager.resolveFeaturePath` robustly handles path resolution relative to the user's intended workspace root, rather than strictly relying on `process.cwd()` which might be the MCP server's directory instead of the target project directory.

## Bugs Fixed During Upgrade

### 1. ESM/CommonJS Incompatibility (`require is not defined`)
*   **Issue:** `mcp-spec-cli` is configured as an ES Module (`"type": "module"` in `package.json`). However, `src/cli.ts` contained a dynamic `require` call: `const TaskParser = require('./features/shared/taskParser.js').TaskParser;`. This caused a runtime crash (`Error: require is not defined`) when `sc_exec plan` reached the task validation stage.
*   **Fix Applied:** Replaced the dynamic `require` with a static import at the top of the file: `import { TaskParser } from './features/shared/taskParser.js';`.
*   **Recommendation for v1.6.0:** Ensure all imports strictly follow ESM syntax and avoid dynamic `require` calls in ESM-configured projects.

### 2. Markdown Lexer Grouping Error (Task ID Parsing Failure)
*   **Issue:** The new `TaskLexer` (using `marked`) incorrectly grouped multi-line list items or nested subtasks into the parent list item's `text` property. Consequently, the regex in `TaskParser.ts` (`/^(\d+(?:\.\d+)*)\.?(.*)$/`) failed to match the task ID because `token.text` started with markdown formatting (e.g., `- [ ] 1.1...`) or contained newlines from nested content. This caused `sc_exec todo complete` to fail with "Task does not exist".
*   **Fix Applied:** Modified `TaskParser.ts` to only evaluate the *first line* of `token.text` and explicitly strip markdown checkbox syntax before applying the regex match:
    ```typescript
    // In src/features/shared/taskParser.ts
    const firstLine = token.text.split('\n')[0];
    const textToMatch = firstLine.replace(/^\[[ xX]\]\s+/, '').trim();
    const match = textToMatch.match(/^(\d+(?:\.\d+)*)\.?(.*)$/);
    ```
*   **Recommendation for v1.6.0:** Integrate this fix to ensure robust task ID extraction regardless of list item nesting, formatting, or spacing within `Tasks.md`.
