# roaster - Task List

## Implementation Tasks

- [ ] 1. **Project Scaffolding**
    - [x] 1.1. Create directory structure
        - *Goal*: Set up the necessary folder hierarchy for the tool.
        - *Details*: Create `.epochcli/tool/roaster/` directory.
        - *Requirements*: Core Features
    - [x] 1.2. Initialize `package.json`
        - *Goal*: Define dependencies and scripts.
        - *Details*: Include `bun`, `typescript`, and any necessary HTTP clients.
        - *Requirements*: Non-functional Requirements

- [ ] 2. **Core Logic Implementation**
    - [x] 2.1. Implement `roaster.ts`
        - *Goal*: Write the main utility logic.
        - *Details*: Implement project map reading, prompt construction, and LLM API call.
        - *Requirements*: Core Features, Non-functional Requirements
    - [ ] 2.2. Implement `project-map` integration
        - *Goal*: Interface with `project-map-cli`.
        - *Details*: Use the `pm_query` tool or similar to get codebase context.
        - *Requirements*: Core Features

- [ ] 3. **Testing and Documentation**
    - [x] 3.1. Implement test suite
        - *Goal*: Verify functionality with `bun test`.
        - *Details*: Write unit tests for prompt construction and integration tests for the LLM call.
        - *Requirements*: Non-functional Requirements
    - [x] 3.2. Create README.md
        - *Goal*: Provide usage instructions.
        - *Details*: Document how to run the tool and the expected output.
        - *Requirements*: Non-functional Requirements

## Task Dependencies

- Task 1 must be completed before Task 2.
- Task 2 must be completed before Task 3.
