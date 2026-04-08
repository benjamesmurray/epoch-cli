# roaster - Requirements Document

Initial requirements for the roaster utility.

## Core Features

- Read the local project map using `project-map-cli`.
- Construct a roast prompt based on the project structure.
- Make an HTTP POST request to `http://localhost:8085/v1/chat/completions`.
- Output a roast blog article about the codebase.

## User Stories

- As a developer, I want to roast my codebase so that I can laugh at my own technical debt.

## Acceptance Criteria

- [ ] The utility correctly reads the project map.
- [ ] The HTTP request is sent with the correct payload.
- [ ] The utility outputs the LLM response.

## Non-functional Requirements

- Must be written in TypeScript.
- Must include a test suite using `bun test`.
- Must include a README.
