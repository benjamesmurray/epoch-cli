# Implementation Plan: Positional Prompt Architecture

- [ ] 1.1 Implement `PromptBuilder` Utility
  - **Objective**: Create a `PromptBuilder` utility that structures the system prompt into 3 distinct zones (Head, Body, Tail) according to the U-shaped attention curve optimization design. Implement unit tests to verify proper concatenation and delimiting.
  - **Files**: `packages/epochcli/src/session/prompt/builder.ts`, `packages/epochcli/test/session/prompt/builder.test.ts`
  - **Dependencies**: None
  - **Requirements**: Req 1 (3-Zone Prompt Structure)

- [ ] 1.2 Implement `RuleRouter` (Classifier) Service
  - **Objective**: Create a lightweight classifier (`RuleRouter`) that analyzes the user's intent from their prompt and returns appropriate rule pack IDs (e.g., `refactoring_pack`, `debugging_pack`). Implement unit tests simulating various user prompts.
  - **Files**: `packages/epochcli/src/session/prompt/router.ts`, `packages/epochcli/test/session/prompt/router.test.ts`
  - **Dependencies**: None
  - **Requirements**: Req 3 (Rule Router)

- [ ] 1.3 Refactor Circumstance-Aware Extraction
  - **Objective**: Update the background fact extraction logic to output circumstance-aware TOON formats (`rules[fact_id, trigger, behaviour]`) rather than flat lists. Update extraction system prompt. Update or add unit tests to verify the parsed output format.
  - **Files**: `packages/epochcli/src/session/worker.ts`, `packages/epochcli/test/session/worker.test.ts`
  - **Dependencies**: None
  - **Requirements**: Req 2 (Correction Persistence Pipeline)

- [ ] 1.4 Refactor `.assistant_rules.toon` Circumstance Mapping
  - **Objective**: Update the `ground_truth_rules.toon` template and the `synthesizeRules` logic in `ground-truth-cli/src/index.ts` to ensure all operational facts (Zones 1&3) and Ground Truth Rules (Zone 2) are explicitly mapped to circumstances. This enables the `RuleRouter` to fetch only the relevant rules based on the detected context.
  - **Files**: `ground-truth-cli/ground_truth_rules.toon`, `ground-truth-cli/src/index.ts`
  - **Dependencies**: None
  - **Requirements**: Req 2 (Correction Persistence Pipeline)

- [ ] 1.5 Integrate `PromptBuilder` and `RuleRouter` into `llm.ts`
  - **Objective**: Refactor the prompt generation pipeline to utilize the new `PromptBuilder`. Wire up the context fetching for Zone 1 (Spec CLI, Project Map, persistent facts), Zone 2 (RuleRouter-injected rule packs, tool schemas, general context), and Zone 3 (Fact repetition, active cursor context). Fallback to reading `.assistant_rules.toon` if the Ground Truth MCP is unavailable.
  - **Files**: `packages/epochcli/src/session/llm.ts`, `packages/epochcli/test/session/llm.test.ts`
  - **Dependencies**: 1.1, 1.2, 1.4
  - **Requirements**: Req 1 (3-Zone Prompt Structure)

- [ ] 1.6 Enforce Code Bounding Token `<|">`
  - **Objective**: Inject the strict Context Communication Rule requiring the `<|">` token for string literals and code blocks into Zone 2/3. Add post-generation validation or transformation rules if necessary in the session processor to warn or handle standard backticks.
  - **Files**: `packages/epochcli/src/session/llm.ts`, `packages/epochcli/src/session/processor.ts`
  - **Dependencies**: 1.5
  - **Requirements**: Req 4 (Code Bounding Enforcement)
