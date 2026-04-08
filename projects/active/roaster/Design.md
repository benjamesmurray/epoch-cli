# roaster - Design Document

## Overview

The `roaster` utility is a TypeScript-based tool designed to provide humorous and critical feedback ("roasts") on a codebase. It achieves this by analyzing the project structure via the `project-map-cli` and sending a structured prompt to a local LLM.

## Architecture

The utility follows a simple procedural architecture:
1. **Context Extraction**: Uses `project-map-cli` to retrieve a high-level overview of the codebase.
2. **Prompt Construction**: Combines the extracted context with a predefined "roast" persona and instructions.
3. **LLM Interaction**: Sends the prompt via an HTTP POST request to a local LLM endpoint.
4. **Output**: Displays the resulting roast article to the user.

## Components and Interfaces

- **Roaster Engine**: The main logic handler.
- **Context Provider**: Interface for interacting with `project-map-cli`.
- **LLM Client**: Handles HTTP communication with `http://localhost:8085/v1/chat/completions`.

## Data Models

- **ProjectContext**: A representation of the codebase structure.
- **RoastPrompt**: The constructed text payload for the LLM.
- **LLMResponse**: The parsed JSON response from the chat completion endpoint.

## Error Handling

- **Missing Project Map**: If `project-map-cli` fails or returns empty, the utility will exit with a descriptive error.
- **LLM Connectivity**: Handles connection timeouts or non-200 HTTP responses from the local LLM.
- **Invalid JSON**: Gracefully handles malformed responses from the LLM.

## Testing Strategy

- **Unit Tests**: Using `bun test` to verify prompt construction and JSON parsing logic.
- **Integration Tests**: Mocking the LLM endpoint to ensure the HTTP client behaves correctly.
- **End-to-End Tests**: Running the utility against a dummy project structure (simulated via mock data).
