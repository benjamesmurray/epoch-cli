# PositionalPromptArchitecture - Requirements Document

Refine system prompt construction to align with 3-zone architecture spec.

## Core Features

- Refactor `epochcli`'s prompt construction logic to strictly align with Section 7 of the `Epoch_spec.md`.
- Ensure **Zone 1** (Absolute Beginning) handles critical, immediate context: Operational Facts (from `.assistant_rules.toon`), Current Spec State, and Critical Symbols (from `project-map-cli`).
- Ensure **Zone 2** (The Engine) handles less critical, behavioral rules: General Behavioral Rule Packs, General Context, and Communication Discipline.
- Ensure **Zone 3** (Reinforcement & Focus) handles high-attention exit data: Verbatim repetition of Operational Facts, Persistent Correction rules, and the Local Cursor Context.
- Specifically fix the current issue where `zone3` is initialized as empty and remains unused.
- Correctly parse `.assistant_rules.toon` so that its components (Operational Facts vs. Behavioral Rules vs. Specific Rules) are placed into the correct zones (1, 2, and 3).

## User Stories

- As an LLM Agent, I want my system prompt to exploit the U-shaped attention curve, so that I don't hallucinate or forget critical operational facts or the exact code I'm supposed to be editing.
- As a Developer, I want the CLI to properly utilize the output of `ground-truth-cli` and `mcp-spec-cli`, placing them in the correct prompt zones to guarantee compliance and context fidelity.

## Acceptance Criteria

- [ ] `packages/epochcli/src/session/llm.ts` (and/or `prompt.ts`) is updated to correctly partition `mcpContext`, `rulesContext`, and other data into `zone1`, `zone2`, and `zone3`.
- [ ] Zone 1 contains Operational Facts, Spec Context, and Project Map context.
- [ ] Zone 2 contains Behavioral Rule Packs and provider/system prompt info.
- [ ] Zone 3 contains Fact Repetition, Persistent Corrections, and Active Cursor context.
- [ ] The `PromptBuilder` effectively receives and processes the properly separated payload.

## Non-functional Requirements

- Performance: Ensure that parsing the TOON format and segregating the rules doesn't add noticeable latency.
- Modularity: Ensure the parsing of `gt_status` / `.assistant_rules.toon` cleanly separates the zones without brittle hardcoding if possible.
