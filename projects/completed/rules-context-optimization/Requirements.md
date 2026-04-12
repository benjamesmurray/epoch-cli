# rules-context-optimization - Requirements Document

Refactor the rules loading in LLM session to be more efficient, reducing bloat. It should only load operational facts without the verbose ID/Zone definitions and should only load behavioral rule packs relevant to the current user intent as per Section 7 of the Epoch Spec.

## Core Features

- Refactor `parseGroundTruthRules` in `packages/epochcli/src/session/llm.ts` to parse the `.assistant_rules.toon` format more intelligently.
- **Operational Facts Extraction**: When extracting operational facts for Zone 1 and 3, strip out the verbose CSV-style metadata (e.g., `fact_01, "zone_1", "Always", `) and only inject the actual fact string into the prompt to save tokens.
- **Dynamic Behavioral Rule Pack Filtering**: Instead of injecting the entire `ZONE 2: RULE LIBRARY` (which contains thousands of tokens for every domain), parse the `rule_packs` mapping. Based on the `identifiedAgent` or intent, select the appropriate pack (e.g., `new_feature_pack` for `build`, `context_mgmt_pack` for `explore`), lookup the specific rules referenced in that pack, and only inject those into Zone 2.
- Ensure fallback logic if the file format isn't strictly adhered to.

## User Stories

- As an LLM operating under a strict 32K context limit (Gemma 4), I want my system prompt to only contain the rules relevant to my immediate task, so that I have more token budget for conversation history and code context.

## Acceptance Criteria

- [ ] Operational facts injected into the LLM payload omit the fact ID, zone, and circumstance metadata.
- [ ] Only rule packs relevant to the active agent/intent are injected into Zone 2.
- [ ] The overall size of the initial system prompt is significantly reduced (verified via token counting or string length).

## Non-functional Requirements

- Performance: The TOON parsing should remain fast (synchronous regex or simple split logic).
- Compatibility: Must correctly parse the existing `.assistant_rules.toon` structure.
