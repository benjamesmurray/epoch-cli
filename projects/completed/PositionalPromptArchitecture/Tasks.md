# PositionalPromptArchitecture - Task List

## Implementation Tasks

- [ ] 1. **Implement Ground Truth TOON Parser Utility**
    - [x] 1.1. Create the regex-based TOON extraction function
        - *Goal*: Extract Operational Facts, Behavioral Rules, and Project-Specific Rules from `.assistant_rules.toon` or `gt_status` response.
        - *Files*: `packages/epochcli/src/session/llm.ts`
        - *Dependencies*: None
        - *Details*: Create a helper function `parseGroundTruthRules(raw: string)` that splits the raw text into `operationalFacts` (from ZONE 1 & 3 header), `behavioralRules` (from ZONE 2 header), and `projectSpecific` (from ZONE 2: PROJECT-SPECIFIC header).
        - *Requirements*: "Correctly parse `.assistant_rules.toon` so that its components... are placed into the correct zones (1, 2, and 3)."
    - [x] 1.2. Write unit tests for the parser utility
        - *Goal*: Ensure extraction is robust against varying text structures.
        - *Files*: `packages/epochcli/test/session/llm.test.ts` (or create a new test file).
        - *Dependencies*: 1.1
        - *Details*: Provide mock TOON strings and assert that the correct subsections are extracted.
        - *Requirements*: "Modularity: Ensure the parsing of `gt_status` / `.assistant_rules.toon` cleanly separates the zones."

- [ ] 2. **Refactor PromptPayload to ZoneStructuredPayload**
    - [x] 2.1. Update `PromptPayload` type
        - *Goal*: Modify the structure to explicitly receive the parts described in the spec.
        - *Files*: `packages/epochcli/src/session/prompt/builder.ts`
        - *Dependencies*: None
        - *Details*: Update `PromptPayload` to use clearer keys: `zone1_critical_rules`, `zone2_context_files`, `zone3_active_cursor` (or keep as `zone1`, `zone2`, `zone3` arrays but ensure type safety for cursor data).
        - *Requirements*: "modify the payload structure to explicitly receive this from the editor extension"
    - [x] 2.2. Simplify construction logic
        - *Goal*: Consolidate prompt construction to `llm.ts`.
        - *Files*: `packages/epochcli/src/session/llm.ts`, `packages/epochcli/src/session/prompt.ts`
        - *Dependencies*: 2.1
        - *Details*: Move `env`, `skills`, and `wrapUpDirective` logic from `prompt.ts` into `llm.ts`. `llm.ts` should be the single place where `PromptBuilder.build` is called and final zones are assembled. `prompt.ts` simply passes these inputs down via the `stream` parameters.
        - *Requirements*: "Refactor to simplify the construction"

- [ ] 3. **Implement Active Cursor Handshake**
    - [x] 3.1. Update VS Code extension to push cursor state
        - *Goal*: Send active cursor selection to the orchestration layer.
        - *Files*: `sdks/vscode/src/extension.ts`
        - *Dependencies*: None
        - *Details*: Update API calls to the server to include a raw JSON field containing the active line/selection context when triggering a chat.
        - *Requirements*: "Have your Editor Extension push the `active_cursor_line` to the Clerk"
    - [x] 3.2. Pass cursor data down to LLM stream
        - *Goal*: Ensure API endpoints receive the cursor and pass it into the `input.user` or directly to `stream()`.
        - *Files*: `packages/epochcli/src/server/routes/tui.ts` (or relevant API route), `packages/epochcli/src/session/message-v2.ts`
        - *Dependencies*: 3.1
        - *Details*: Update `MessageV2.User` or session input payload to accept `active_cursor_line`.
        - *Requirements*: "This object is passed as a raw field in the initial JSON request"
    - [x] 3.3. Clerk injects cursor into Zone 3
        - *Goal*: Format the cursor data and place it into Zone 3.
        - *Files*: `packages/epochcli/src/session/llm.ts`
        - *Dependencies*: 1.1, 2.2, 3.2
        - *Details*: If `active_cursor_line` is present, format it with `File: ...`, `Line X: ... # <--- CURSOR HERE`, and push to Zone 3 alongside Fact Repetition.

- [ ] 4. **Testing & Validation**
    - [x] 4.1. Run end-to-end tests to verify zone extraction
        - *Goal*: Ensure chat tests pass and prompt generation does not error out.
        - *Files*: `packages/epochcli/test/session/llm.test.ts`
        - *Dependencies*: 3.3
        - *Details*: Execute `npm test` and ensure all prompt builder tests and LLM orchestration tests pass.
        - *Requirements*: "Performance: Ensure that parsing the TOON format and segregating the rules doesn't add noticeable latency."

## Task Dependencies

- Task 1 can be done independently.
- Task 2 builds on the parsing logic and cleans up the architecture.
- Task 3 builds on Task 2's new payload structure.
- Task 4 validates everything.

## Estimated Timeline

- Task 1: 1 hour
- Task 2: 1 hour
- Task 3: 2 hours
- Task 4: 1 hour
- **Total: 5 hours**
