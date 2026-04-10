# Design Document: Positional Prompt Architecture

## Overview
This design implements a 3-zone positional architecture for the system prompt to optimize LLM performance by exploiting the U-shaped attention curve. It also introduces a more intelligent "Correction Persistence" mechanism with circumstance-aware rule injection.

## Architecture

### 3-Zone Prompt Model
We will use a `PromptBuilder` utility to assemble the system prompt into three distinct regions:
- **Zone 1 (Head)**: Immediate context and persistence. High attention.
- **Zone 2 (Body)**: Behavioral rules, tool definitions, and broad context. Lower attention (middle).
- **Zone 3 (Tail)**: Fact repetition and local cursor context. High attention.

### Rule Router (Classifier)
A lightweight "pre-generation" classification step will determine the user's intent and select the appropriate behavioral rule packs from the Ground Truth library to be injected into Zone 2.

### Correction Persistence
The extraction process in `worker.ts` will be upgraded to categorize facts into "Circumstances" (Triggers). The `PromptBuilder` will then only inject rules relevant to the current session's context.

## Components and Interfaces

### `PromptBuilder` (Utility)
- **Interface**: `build(payload: PromptPayload): string`
- **Responsibility**: Joins the three zones with appropriate delimiters.

### `RuleRouter` (Service)
- **Interface**: `classify(input: string): Promise<RulePack[]>`
- **Responsibility**: Analyzes user input and returns a list of rule pack IDs (e.g., `refactoring_pack`, `debugging_pack`).

### `ExtractionWorker` (Update to `worker.ts`)
- **Responsibility**: Uses a refined system prompt to extract facts in TOON format with `Trigger` and `Behaviour` fields.

## Data Models

### TOON Rule Schema (Circumstance Map)
```toon
rules[fact_id, trigger, behaviour]:
  fact_01, "When editing CSS", "Use CSS variables for theme colors."
  fact_02, "When refactoring Effect code", "Ensure all generators use yield*."
```

## Error Handling
- **Missing MCP**: If `ground-truth-cli` fails, fall back to reading `.assistant_rules.toon` directly.
- **Classification Failure**: Default to the `core_interaction_pack` if the router fails or is uncertain.

## Testing Strategy
- **Unit Tests**: Test `PromptBuilder` to ensure correct zone ordering and delimiter usage.
- **Integration Tests**: Verify that `llm.ts` correctly fetches context from Spec, Project Map, and Ground Truth MCPs.
- **Prompt Fidelity Tests**: Use a test model to verify that Zone 1/3 facts are prioritized over Zone 2 clutter.
