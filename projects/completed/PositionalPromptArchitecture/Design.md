# PositionalPromptArchitecture - Design Document

## Overview

The `epochcli` system prompt construction logic currently fails to utilize the 3-zone architecture effectively. Specifically, `zone3` is initialized as empty and never populated, and the Ground Truth Rules from `.assistant_rules.toon` are shoved entirely into `zone2` instead of being partitioned into their respective zones (Zone 1 for Operational Facts, Zone 2 for Behavioral Rules, Zone 3 for Fact Repetition).

This design refactors the `llm.ts` and `prompt.ts` code to correctly parse the `.assistant_rules.toon` content, splitting it into strings that map to `zone1`, `zone2`, and `zone3`, and adjusts the `PromptPayload` pipeline to align with Section 7 of `Epoch_spec.md`.

## Architecture

The orchestration occurs in `packages/epochcli/src/session/llm.ts` (where Phase 1 Context Gathering occurs) and `packages/epochcli/src/session/prompt.ts` (where final assembly occurs).

1. **Context Extraction:** Instead of treating `rulesContext` as a single monolithic string, `llm.ts` will parse the `gt_status` output (or `.assistant_rules.toon` file) via regex or string splitting to separate:
    - **Operational Facts:** `ZONE 1 & 3: OPERATIONAL FACTS` block.
    - **Behavioral Rule Packs:** `ZONE 2: BEHAVIORAL RULE PACKS` and `ZONE 2: RULE LIBRARY`.
    - **Project-Specific Rules:** `ZONE 2: PROJECT-SPECIFIC RULES` block.

2. **Payload Population:**
    - `payload.zone1` will receive: Project Map & Spec CLI (`mcpContext`), Operational Facts.
    - `payload.zone2` will receive: Behavioral Rules, Project-Specific Rules, Provider Prompt, and Agent Instructions.
    - `payload.zone3` will receive: Operational Facts (Repeated), and the Active Cursor (if available).

3. **Prompt Pipeline (`prompt.ts`):** Ensure the `env`, `skills`, and `wrapUpDirective` are appended to `zone1` in `prompt.ts`. (This currently happens, but we must ensure it doesn't conflict with the `zone1` data produced by `llm.ts`).

## Components and Interfaces

- **`PromptPayload` (`builder.ts`):** The interface remains unchanged (`zone1`, `zone2`, `zone3`), but `zone3` is now meaningfully utilized.
- **`RuleParser` (New/Inline in `llm.ts`):** A small parsing utility function within `llm.ts` that takes the raw TOON string and splits it:
  ```typescript
  function parseGroundTruthRules(raw: string): { zone1: string, zone2: string } {
      // Regex extraction logic based on "ZONE 1 & 3:" and "ZONE 2:" headers
  }
  ```
- **`llm.ts` modifications:** Update the pre-generation block handling `gt_status` to call the parsing utility and push selectively to `payload.zone1`, `payload.zone2`, and `payload.zone3`.

## Data Models

No new database tables or complex data structures are required. We are simply refining how we populate the `PromptPayload` string arrays.

## Error Handling

If parsing of `.assistant_rules.toon` fails to find the expected Zone markers, the fallback behavior will push the entire content into `zone2` (the legacy behavior), logging a debug message indicating that structured zone extraction failed.

## Testing Strategy

- Ensure `zone3` is populated in logs when running chat commands.
- Add unit tests for the `parseGroundTruthRules` utility to ensure it safely extracts blocks even if the format changes slightly.
- Verify through `npm test` that the `llm.test.ts` and `telemetry.test.ts` (which checks `zone3_active_cursor` logic) are still passing.