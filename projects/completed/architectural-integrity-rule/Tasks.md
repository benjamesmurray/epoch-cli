# architectural-integrity-rule - Tasks

## 1. Ground Truth Modification

- [x] 1.1 Add the new Operational Fact to `.assistant_rules.toon`.
  - **Objective**: Insert `fact_18` into the `operational_facts` section to mandate the Red Team pass.
  - **Files**: `.assistant_rules.toon`
  - **Details**: Add `fact_18, "zone_1", "When using Spec CLI", "You MUST perform a Red Team pass (identifying 3 failure modes) and log them via sc_epoch before advancing to the next phase."`
  - **Requirements**: Side-Model Enforcement, Mandatory Self-Critique.

- [x] 1.2 Add the new Behavioral Rule to `.assistant_rules.toon`.
  - **Objective**: Insert `reas_06` into the `reasoning_discipline` rule library.
  - **Files**: `.assistant_rules.toon`
  - **Details**: Add the definition for `reas_06` including trigger, behavior, and examples.
  - **Requirements**: Documentation of Failure Modes, Mandatory Self-Critique.

- [x] 1.3 Update Rule Packs in `.assistant_rules.toon`.
  - **Objective**: Add `reas_06` to `new_feature_pack` and `refactoring_pack`.
  - **Files**: `.assistant_rules.toon`
  - **Details**: Ensure the Clerk injects this rule during high-impact technical tasks.
  - **Requirements**: Side-Model Enforcement.

## 2. Verification

- [x] 2.1 Verify `.assistant_rules.toon` syntax.
  - **Objective**: Ensure the TOON file remains valid after manual edits.
  - **Files**: `.assistant_rules.toon`
  - **Details**: Check that all brackets are closed and the CSV-like rows are correctly formatted.
  - **Requirements**: Non-functional Requirements.
