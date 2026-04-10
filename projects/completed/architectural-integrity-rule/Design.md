# architectural-integrity-rule - Design Document

## Overview
The "Architectural Integrity" rule is a behavioral and operational constraint designed to force the agent into a self-critical "Red Team" mode before committing to architectural changes or moving between project phases. This prevents common hallucination loops where the agent blindly follows a flawed initial plan.

## Architecture
The rule will be implemented at two levels:
1.  **Operational (Zone 1)**: A high-priority fact that mandates the check.
2.  **Behavioral (Zone 2)**: A detailed rule in the `reasoning_discipline` domain that defines the "Red Team" pass.

## Components and Interfaces

### 1. Ground Truth Update (`.assistant_rules.toon`)
- **Operational Fact (`fact_18`)**: Mandate the "Red Team" pass for phase transitions.
- **Rule (`reas_06`)**: Define the trigger (phase transition) and behavior (identify 3 failure modes).
- **Rule Pack Update**: Add `reas_06` to `new_feature_pack` and `refactoring_pack`.

### 2. Side-Model Integration
The `local-side` (Clerk) model already selects rule packs based on intent. By adding the rule to the relevant packs, the Clerk will automatically inject it when the user is working on features or refactors.

## Data Models

### New Rule Definition
```toon
reas_06, "Advancing to a new project phase (e.g., calling sc_plan or sc_approve).", "Perform a 'Red Team' pass: Read the current draft and identify 3 potential failure modes or logic gaps. Log these as hypotheses in sc_epoch before proceeding.", "Correct: 'Red Team Pass: 1. Race condition in X. 2. Memory leak in Y. 3. Schema mismatch in Z. Logging to sc_epoch.' Incorrect: 'Requirements look good, calling sc_plan.'"
```

### New Operational Fact
```toon
fact_18, "zone_1", "When using Spec CLI", "You MUST perform a Red Team pass (identifying 3 failure modes) and log them via sc_epoch before advancing to the next phase."
```

## Error Handling
If an agent fails to perform the Red Team pass, the Supervisor Middleware (if expanded) or simply the Ground Truth compliance check will flag it as a violation.

## Testing Strategy
- **Manual Verification**: Run a spec-cli workflow and verify that the agent identifies 3 failure modes before calling `sc_plan`.
- **Unit Test**: Check that `.assistant_rules.toon` contains the new rule and fact after implementation.
