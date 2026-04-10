# roaster - Design Document

## Overview

The `roaster` utility is a TypeScript-based CLI tool designed to provide humorous, AI-generated critiques (roasts) of a codebase. It achieves this by reading the local project map, which provides context about the files and structure, and sending a prompt to a local LLM.

## Architecture

The utility will follow a simple, linear execution flow:
1. **Context Gathering**: Read the project map file.
2. **Prompt Construction**: Transform the project map data into a descriptive, roast-oriented prompt.
3. **LLM Interaction**: Send the prompt via HTTP POST to the local LLM endpoint.
4. **Output**: Print the resulting roast to the standard output.

## Components and Interfaces

### `Roaster` Class/Module
- `readProjectMap()`: Reads the project map from the filesystem.
- `buildPrompt(mapData)`: Generates the text prompt.
- `fetchRoast(prompt)`: Handles the network request to the LLM.
- `run()`: Orchestrates the execution.

### External Interfaces
- **Project Map**: A file containing the codebase structure (to be determined by the availability of project map files in the environment).
- **LLM API**: OpenAI-compatible endpoint at `http://localhost:8085/v1/chat/completions`.

## Data Models

### Prompt Schema
A string containing instructions to the LLM to act as a "savage software engineer" and roast the provided project structure.

### LLM Response Schema (OpenAI compatible)
```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "string"
      }
    }
  ]
}
```

## Error Handling

- **File System Errors**: Handle missing or unreadable project map files.
- **Network Errors**: Handle connection failures or timeouts when contacting the local LLM.
- **API Errors**: Handle non-200 HTTP responses from the LLM endpoint.
- **Parsing Errors**: Handle malformed JSON responses from the LLM.

## Testing Strategy

- **Unit Tests**: Test prompt construction logic and project map parsing.
- **Integration Tests**: Mock the HTTP request to verify the orchestration logic and error handling.
- **Framework**: Use `bun test`.

## Implementation Plan

1. Create directory `.epochcli/tool/roaster`.
2. Initialize `package.json` and install minimal dependencies (e.g., `zod` for validation).
3. Implement `readProjectMap`.
4. Implement `buildPrompt`.
5. Implement `fetchRoast`.
6. Implement the CLI entry point.
7. Write and run tests.
8. Write README.md.
