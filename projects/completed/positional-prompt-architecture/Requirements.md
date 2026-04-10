# Requirements: Positional Prompt Architecture

## Goal
Refactor Epoch CLI's prompt construction to implement the Positional Prompt Architecture (3-zone U-curve optimization) and the Correction Persistence Pipeline with circumstance-aware mapping.

## Functional Requirements
1. **3-Zone Prompt Structure**: Implement a structural partition of the system prompt to exploit the transformer's U-shaped attention curve.
    - **Zone 1 (The Absolute Beginning)**:
        - Correction Persistence Block: Permanent facts and user corrections from `.assistant_rules.toon`.
        - Current State (Spec CLI): Immediate active task and project phase.
        - Critical Symbols (Project Map): TOON-formatted list of relevant symbols for the active file.
    - **Zone 2 (The Middle - Attention Blind Spot)**:
        - Behavioral Rule Packs: Rules, trigger conditions, and formatting constraints.
        - General Context: Broad repository context, inactive file trees, and full linter logs.
        - Tool Definitions: JSON schemas for MCP servers and tools.
    - **Zone 3 (The Absolute End)**:
        - Fact Repetition: Brief reiteration of critical facts/active task.
        - Local Cursor Context: Exact line of code/highlighted context.

2. **Correction Persistence Pipeline**:
    - Refactor extraction in `worker.ts` to generate "circumstance-aware" rules.
    - Maintain a map of circumstances in `.assistant_rules.toon` for targeted retrieval.
    - Inject rules based on the detected circumstance of the current request.

3. **Rule Router**:
    - Implement a classifier in the Pre-Generation phase to select specific behavioral rule packs (e.g., *Reasoning Discipline* for refactors) based on user intent.

4. **Code Bounding Enforcement**:
    - Programmatically enforce the use of the `<|">` token for string literals and code blocks.

## Technical Constraints
- Must maintain compatibility with existing MCP server integrations.
- Must handle fallback to filesystem if `ground-truth-cli` is unavailable.
- Must ensure that Zone 1 and Zone 3 remain within approximately 200 tokens each.
