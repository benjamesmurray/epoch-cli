# dual-model-architecture - Tasks Document

## Task List

- [ ] **Task 1: Provider Configuration Validation**
  - Verify that the application correctly parses the `local-main` and `local-side` provider settings and can initialize both the Gemma and Nemotron models.
- [ ] **Task 2: Event Loop Orchestrator (Phase 1 & 2)**
  - Implement the `Pre-Generation` phase using the 4B model for sanitization and TOON formatting.
  - Implement the `Main Generation` phase using the 26B model for code generation.
- [ ] **Task 3: Post-Generation & Task-Epoch Management (Phase 3)**
  - Implement the `Post-Generation` background worker to extract context and update the Spec CLI MCP state.
  - Integrate the Cold Start context wiping and purging logic per task epoch.
- [ ] **Task 4: Positional Prompt Architecture & TOON Context**
  - Refactor prompt generation to strictly enforce Zone 1, Zone 2, and Zone 3 positioning.
  - Introduce the TOON parser/formatter for all structured context (e.g., project map symbols, MCP payloads).
- [ ] **Task 5: Three-Stage JSON Sanitizer**
  - Create the application-layer 3-stage sanitizer (Regex, Structural Repair, Schema Validation) to protect against 26B JSON flakiness.
- [ ] **Task 6: Log Parser Verification Utility**
  - Implement a log parser script designed to read from `/home/llm/utils/launch/logs`.
  - The script will verify that both `local-main` and `local-side` are triggered sequentially and according to the expected Baton Pass loop.