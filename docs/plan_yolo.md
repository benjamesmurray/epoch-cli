# Plan + YOLO Mode: Automated Structured Workflow

When both Plan Mode (`--plan`) and YOLO Mode (`--yolo`) are active simultaneously, the agent adheres to the rigid phase constraints of Plan Mode but executes them completely autonomously.

This combined mode provides the best of both worlds: strict architectural and task-planning boundaries, paired with zero-intervention execution.

## How They Co-exist

1. **Rigid Constraints Apply:** The agent remains strictly in READ-ONLY mode during the initial phases. It cannot execute build tasks until the implementation planning is formally approved.
2. **Autonomous Progression:** Instead of stopping to ask a human to run `sc_approve()`, YOLO Mode grants the agent the authority to call `sc_approve()` itself once it has satisfied the requirements of the current phase (e.g., removing template tags).
3. **End-to-End Automation:** The agent moves from Specification -> Task Planning -> Implementation -> Archival without human intervention, but the system guarantees it does not skip the planning phases.

## Workflow

1. **Phase 1: Specification (Read-Only)**
   - Agent runs `sc_init(name="...")`.
   - Agent drafts `Specification.md` and removes `<template-specification>` tags.
   - Agent calls `sc_approve()` (Autonomous transition).

2. **Phase 2: Implementation Planning (Read-Only)**
   - Agent scaffolds `Tasks.json`.
   - Agent defines tasks and removes template tags.
   - Agent calls `sc_approve()` (Autonomous transition).
   - *System Listener triggers Mode Switch: The system detects the final `sc_approve()` and transitions the agent into Build Mode.*

3. **Phase 3: Build (Write Access)**
   - Agent executes tasks (`sc_todo_start` / `sc_todo_complete`).

4. **Phase 4: Archival & Completion**
   - Once all tasks are `[x]`, the agent runs `sc_plan()`.
   - The system automatically moves the project to `projects/completed/`.
   - The system pauses YOLO execution and asks the user for text input to confirm the run is complete or provide further instructions before final termination.