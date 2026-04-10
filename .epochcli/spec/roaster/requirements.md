# Roaster Feature Requirements

## Overview

A TypeScript utility located at `.epochcli/tool/roaster` that generates a roast blog article about the current codebase by leveraging the project map and a local LLM.

## Functional Requirements

1. **Project Map Access**: Read the current project map (via `project-map-cli` or similar mechanism/file).
2. **Prompt Construction**:
   - Synthesize the project structure and key symbols into a prompt.
   - The prompt must instruct the LLM to write a humorous, critical "roast" blog article about the codebase.
3. **LLM Integration**:
   - Make an HTTP POST request to `http://localhost:8085/v1/chat/completions`.
   - Use standard OpenAI-compatible payload format.
4. **Output**: Print the generated roast to the console.

## Technical Constraints

- **Language**: TypeScript.
- **Runtime**: Bun.
- **Location**: `.epochcli/tool/roaster.ts`.
- **Testing**: Use `bun test`.

## Deliverables

- `roaster.ts`: The main utility.
- `roaster.test.ts`: Test suite.
- `README.md`: Documentation for the tool.
