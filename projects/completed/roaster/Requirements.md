# roaster - Requirements Document

## Core Features

- Read the local project map to understand the codebase structure and contents.
- Construct a roast-themed prompt based on the project map data.
- Send an HTTP POST request to a local LLM endpoint (`http://localhost:8085/v1/chat/completions`) with the constructed prompt.
- Output the generated roast blog article to the console.

## User Stories

- As a developer, I want to receive a humorous roast of my codebase so that I can laugh at my mistakes and improve my code quality.

## Acceptance Criteria

- [ ] Successfully parses the project map file.
- [ ] Correctly formats a JSON payload for the OpenAI-compatible chat completions API.
- [ ] Handles HTTP errors from the local LLM gracefully.
- [ ] The utility is written in TypeScript and uses Bun APIs where appropriate.
- [ ] Includes a comprehensive test suite using `bun test`.
- [ ] Includes a README.md explaining usage.

## Non-functional Requirements

- The utility should be lightweight and have minimal dependencies.
- The tool should reside in `.epochcli/tool/roaster`.
