# rules-context-optimization - Design Document

## Overview

The `parseGroundTruthRules` function in `packages/epochcli/src/session/llm.ts` currently injects large, verbose blocks of text from `.assistant_rules.toon` directly into the LLM system prompt. This consumes unnecessary tokens and degrades model performance (especially on strict 32K context models like Gemma 4).

This design refactors the parsing logic to extract only the necessary text for `operational_facts` (dropping metadata like "zone_1") and to dynamically resolve the `rule_packs` based on the active agent/intent, ensuring only relevant behavioral rules are included in Zone 2.

## Architecture

The changes will be entirely contained within the `packages/epochcli/src/session/llm.ts` file, specifically targeting the `parseGroundTruthRules` function.

### 1. Stripping Operational Facts
The TOON format for operational facts is CSV-like:
`fact_17, "zone_1", "When refreshing project rules", "Use the Ground Truth tool gt_exec..."`

The parser will use a Regex to match lines following this pattern, extract the final quoted string, and compile them into a dense, token-efficient list (e.g., `- Use the Ground Truth tool gt_exec...`).

### 2. Dynamic Behavioral Rule Packs
The TOON format defines `rule_packs` (e.g., `new_feature_pack: [domains.epistemic_integrity.epi_03, ...]`) and a `ZONE 2: RULE LIBRARY` containing the actual rule definitions in CSV format.

The parser will:
1. Accept the `identifiedAgent` (or fallback to `"build"`) as an argument.
2. Determine the active rule pack based on the agent (e.g., `build` -> `new_feature_pack`, `plan` -> `code_review_pack` or `refactoring_pack`, `explore` -> `context_mgmt_pack`).
3. Extract the list of rule IDs from the target `rule_pack`.
4. Scan the `RULE LIBRARY` and extract only the rules matching those IDs.
5. Format the extracted rules concisely (Trigger -> Behaviour -> Example) and return that string for Zone 2.

## Components and Interfaces

- Modify signature: `export function parseGroundTruthRules(raw: string, activeAgent?: string): { operationalFacts: string; behavioralRules: string; projectSpecific: string }`
- Internal helper logic for regex extraction of TOON arrays and dictionaries.

## Data Models

No new data models.

## Error Handling

If the regex fails to parse the TOON file due to unexpected formatting, it will fall back to returning the raw blocks as it currently does. This ensures backward compatibility.

## Testing Strategy

Unit tests in a new or existing test file for `packages/epochcli/src/session/llm.ts` (or testing the parser directly) to verify:
1. Operational facts are correctly stripped of metadata.
2. Behavioral rules return only the subset of rules matching the target pack for the given agent.
3. Fallback logic behaves safely if the format is corrupted.
