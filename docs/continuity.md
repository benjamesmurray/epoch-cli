# Epoch Continuity and Compaction Architecture

The Epoch CLI manages LLM context window limits and session continuity through a Dual Model architecture, relying on a fast, local supervisor model to maintain an ongoing narrative of the work being performed. This approach replaces raw conversation history truncation (legacy compaction) with dense, highly contextual reports generated asynchronously at the end of an epoch.

## Core Concepts

### 1. The Dual Model Setup
The system employs two LLMs:
*   **`local-main` (The Primary Agent):** Handles dense reasoning, complex code generation, and direct tool interaction.
*   **`local-side` (The Supervisor/Clerk):** A faster, smaller model running in the background. It is responsible for Phase 1 (pre-generation RAG) and Phase 3 (post-generation fact extraction and continuity reporting).

### 2. Session Analyzer (`packages/epochcli/src/util/session-analyzer.ts`)
Instead of simply summarizing the last N messages of a conversation, the CLI uses a deterministic `SessionAnalyzer` to extract a structured dataset from the telemetry stream:
*   **Telemetry-Driven Aggregation**: Ingests `.jsonl` telemetry events to ensure the action timeline is based on actual tool outcomes.
*   **High-Fidelity Timeline**: Extracts raw `Error` messages and "Stall Hints" (e.g., "Please finish editing...") directly from tool outputs, ensuring critical validation feedback survives the epoch transition.
*   **Semantic Mapping**: Automatically translates generic tool calls (like `bash`) into high-level actions (`spec sc_init`, `pm_query`) by analyzing tool inputs.
*   **Touched Files**: Extracts active files from tool inputs (`edit`, `write`, `read`, etc.) to track technical progress.

### 3. The Continuation Report (`.epoch-continuity.toon`)
When a session completes (or reaches its context limit), Phase 3 (`PostGenerationWorker` in `src/session/worker.ts`) executes:
1.  The worker gathers the high-fidelity timeline from the `SessionAnalyzer`.
2.  It prompts the `local-side` Clerk model to synthesize a structured report in **TOON** (Token-Oriented Object Notation) format.
3.  The report includes:
    *   **Workflow Map**: Granular `phase` (Requirements/Design/Build) and `status` (Ready/Blocked).
    *   **Residual Blockers**: Structured list of `{ file, error, resolution }`.
    *   **Technical Progress**: Separation of finalized `artifacts` from `drafts` needing edits.
    *   **Next Action**: A direct `tool` recommendation with a concrete `example_input` JSON object (including `mcpx` syntax).

### 4. Epoch Cold-Starts (Injection)
When a new session (Epoch) is started, the CLI natively searches for `.epoch-continuity.toon`.
*   If found, the contents are injected directly into **Zone 2** of the system prompt.
*   This seeds the new LLM context with a "perfect memory" of the previous epoch's successes and failures, preventing repetitive "doom loops" and ensuring the agent immediately acts on suggested resolutions.

## Active Intercepts & Validation
To ensure project integrity, the CLI implements **Active Intercepts** in the tool execution layer (`packages/epochcli/src/mcp/index.ts`):
*   **Template Scan**: When an agent calls `sc_approve`, the system intercept performs a programmatic scan for `<template>` tags in `projects/active/**/*.md`. 
*   **Immediate Feedback**: If tags are found, the tool call fails immediately with a descriptive error. This feedback is captured by the `SessionAnalyzer` and preserved in the next continuity report.