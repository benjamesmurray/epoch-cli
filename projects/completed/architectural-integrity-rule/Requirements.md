# architectural-integrity-rule - Requirements Document

Mandate a 'Red Team' pass in the side-model's Phase 1 preparation to force agents to self-critique and identify failure modes before advancing phases.

## Core Features

- **Mandatory Self-Critique**: The system must enforce a rule that agents cannot advance a project phase (e.g., from Design to Tasks) without first performing a documented "Red Team" review.
- **Side-Model Enforcement**: The `local-side` (Clerk) model must inject a high-priority directive during Phase 1 (Pre-Generation) when it detects a phase transition is imminent.
- **Documentation of Failure Modes**: The agent must identify at least 3 potential failure modes or logic gaps in its current draft and log them as `hypotheses` or `openQuestions` via the `sc_epoch` tool.
- **Workflow Interlock**: The `sc_status` or `sc_plan` tools should ideally recognize if a "Red Team" pass has occurred.

## User Stories

- As a developer, I want the agent to think critically about its own design, so that I don't have to manually point out obvious architectural flaws.
- As an AI supervisor, I want to force the main model into a "skeptical" state before it commits to a large implementation plan.

## Acceptance Criteria

- [ ] A new "Architectural Integrity" rule is added to the Ground Truth rules (e.g., `.assistant_rules.toon`).
- [ ] The rule explicitly mandates identifying 3 failure modes before calling `sc_approve` or `sc_plan`.
- [ ] The directive is injected into the prompt by the Side Model when in a Spec CLI workflow.

## Non-functional Requirements

- Should not significantly increase the token count of the system prompt.
- Must be compatible with both `one-shot` and `step-through` modes.
