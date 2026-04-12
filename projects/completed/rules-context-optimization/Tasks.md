# rules-context-optimization - Tasks Document

## Implementation Plan

- [x] 1.1 Refactor `parseGroundTruthRules` operational facts parsing
  - **Objective**: Implement logic to extract only the actual string content from the operational facts block, stripping metadata.
  - **Files**: `packages/epochcli/src/session/llm.ts`
  - **Details**:
    - Update `parseGroundTruthRules` signature to accept `activeAgent` if needed.
    - Write a regex or split/map loop over `zone1Match` to extract just the final element of the CSV format for operational facts.
    - Format them cleanly (e.g., as a bulleted list).
  - **Requirement Ref**: Operational Facts Extraction.

- [x] 1.2 Implement dynamic rule pack resolution
  - **Objective**: Add logic to map `activeAgent` to the corresponding `rule_pack`, and extract only those rules from the `RULE LIBRARY`.
  - **Files**: `packages/epochcli/src/session/llm.ts`
  - **Details**:
    - Map `build` -> `new_feature_pack`, `plan` -> `refactoring_pack` (or `code_review_pack`), etc.
    - Parse the `rule_packs` section to get the array of rule IDs for the target pack.
    - Parse the `RULE LIBRARY` section and filter it down to only rules matching the extracted IDs.
    - Format the matched rules into a dense string.
  - **Requirement Ref**: Dynamic Behavioral Rule Pack Filtering.

- [x] 1.3 Add unit tests for `parseGroundTruthRules`
  - **Objective**: Verify that the new parsing logic correctly strips metadata and filters rules based on the agent.
  - **Files**: `packages/epochcli/test/session/llm.test.ts` (create or update)
  - **Details**:
    - Pass a mock `.assistant_rules.toon` string to the function.
    - Assert that `operationalFacts` does not contain `fact_01` or `"zone_1"`.
    - Assert that `behavioralRules` only contains rules from the expected pack for a given agent.
  - **Requirement Ref**: Acceptance Criteria (Verified via unit testing).

- [x] 1.4 Wire the updated parser into the LLM payload flow
  - **Objective**: Ensure the `stream` function correctly passes the `input.agent.name` (or `identifiedAgent` from the Clerk) into the parser.
  - **Files**: `packages/epochcli/src/session/llm.ts`
  - **Details**:
    - Update calls to `parseGroundTruthRules(rulesContext, identifiedAgent || input.agent.name)`.
  - **Requirement Ref**: Acceptance Criteria (Only rule packs relevant to the active agent/intent are injected).
