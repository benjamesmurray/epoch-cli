# roaster - Implementation Plan

## Tasks

- [ ] 1. Initialize the project environment
    - [ ] 1.1 Create directory `.epochcli/tool/roaster` and `src` subdirectory
    - [ ] 1.2 Initialize `package.json` with `type: module` and Bun configuration
    - [ ] 1.3 Install dependencies: `zod` for schema validation
    - [ ] 1.4 Setup `tsconfig.json` for TypeScript/Bun
    - [ ] *Requirements*: Core Features, Non-functional Requirements

- [ ] 2. Implement Core Logic (Test-Driven)
    - [ ] 2.1 Implement `readProjectMap` in `src/map.ts`
        - [ ] 2.1.1 Write unit test in `src/map.test.ts` for successful file reading
        - [ ] 2.1.2 Write unit test for missing file error handling
        - [ ] 2.1.3 Implement `readProjectMap` to read project map file
        - [ ] *Requirements*: Core Features, Acceptance Criteria
    - [ ] 2.2 Implement `buildPrompt` in `src/prompt.ts`
        - [ ] 2.2.1 Write unit test in `src/prompt.test.ts` verifying prompt contains roast instructions and map data
        - [ ] 2.2.2 Implement `buildPrompt` to transform map data into a savage roast prompt
        - [ ] *Requirements*: Core Features, Acceptance Criteria
    - [ ] 2.3 Implement `fetchRoast` in `src/llm.ts`
        - [ ] 2.3.1 Write integration test in `src/llm.test.ts` using `mock` to simulate OpenAI-compatible response
        - [ ] 2.3.2 Implement `fetchRoast` using `fetch` to call `http://localhost:8085/v1/chat/completions`
        - [ ] 2.3.3 Implement error handling for network and API failures
        - [ ] *Requirements*: Core Features, Acceptance Criteria, Error Handling

- [ ] 3. Final Integration and Documentation
    - [ ] 3.1 Implement CLI entry point in `src/index.ts`
        - [ ] 3.1.1 Orchestrate `readProjectMap` -> `buildPrompt` -> `fetchRoast` -> `console.log`
        - [ ] *Requirements*: Core Features
    - [ ] 3.2 Create `README.md` with usage instructions
        - [ ] *Requirements*: Acceptance Criteria
    - [ ] 3.3 Verify full workflow with a mock local server
