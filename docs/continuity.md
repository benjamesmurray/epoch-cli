# Epoch Continuity and Transition Architecture

The Epoch CLI manages LLM context window limits and session continuity through a Dual Model architecture, relying on a fast, local supervisor model to maintain an ongoing narrative of the work being performed. This approach replaces raw conversation history truncation (legacy compaction) with dense, highly contextual reports generated asynchronously at the end of an epoch.

## Core Concepts

### 1. The Dual Model Setup
The system employs two LLMs:
*   **`local-main` (The Primary Agent):** Handles dense reasoning, complex code generation, and direct tool interaction.
*   **`local-side` (The Supervisor/Clerk):** A faster, smaller model running in the background. It is responsible for Phase 1 (pre-generation RAG) and Phase 3 (post-generation fact extraction and continuity reporting).
*   **Grounded Awareness**: During the reporting phase, the Clerk has "Analysis-Only" access to active project artifacts (e.g., `Specification.md`, `Tasks.json`). This ensures its technical summaries and "Next Action" suggestions are based on ground-truth requirements rather than model defaults or training data.

### 2. Session Analyzer (`packages/epochcli/src/util/session-analyzer.ts`)
Instead of simply summarizing the last N messages of a conversation, the CLI uses a deterministic `SessionAnalyzer` to extract a structured dataset from the telemetry stream:
*   **Telemetry-Driven Aggregation**: Ingests `.jsonl` telemetry events to ensure the action timeline is based on actual tool outcomes.
*   **High-Fidelity Timeline**: Extracts raw `Error` messages and "Stall Hints" directly from tool outputs.
*   **Semantic Mapping**: Automatically translates generic tool calls into high-level actions.
*   **Ground-Truth Artifact Verification**: Performs a deterministic disk check using `fs.stat` to separate **Verified Artifacts** from **Missing Artifacts**.
*   **Complete Cognitive State Extraction**: Captures the agent's internal reasoning blocks across the **entire epoch**, ensuring architectural decisions are preserved.

### 3. The Continuation Report (`.epoch-continuity.toon`) (Executive Summary)
When a session completes (or reaches its context limit), Phase 3 (`PostGenerationWorker` in `src/session/worker.ts`) executes:
1.  The worker gathers the timeline and thoughts from the `SessionAnalyzer`.
2.  **Inception Data Collection**: The worker reads the first 4000-8000 characters of the active project's `Specification.md` and `Tasks.json`.
3.  The `local-side` Clerk synthesizes a structured report in **TOON** format.
4.  **Ground Truth Injection**: The report includes:
    *   **Original Requirement**: The Clerk is injected with the literal first user prompt to ensure architectural continuity across epochs.
    *   **Absolute Path Grounding**: All file paths in `completed_artifacts` and `blocked_drafts` are strictly absolute to prevent orientation loops.
    *   **Project Map Pointers**: The Clerk is forbidden from inventing code; it must only provide pointers via `mcpx map` tooling (e.g., `pm_fetch_symbol`).
5.  The report includes:
    *   **Workflow Map**: Granular phase and status (e.g., `Blocked` if template tags are detected).
    *   **Ground Truth**: Literal snippets of the core tech stack and active task list.
    *   **Executive Intent**: A distilled map of the agent's internal architecture.
    *   **Technical Progress (Grounded)**: Separation of finalized artifacts from blocked drafts.
    *   **Next Action**: A direct `tool` recommendation with a concrete `example_input`.

### 4. Global History Suite (`.history/*.toon`) (Long-Term Memory)
The CLI maintains a pre-chewed suite of global history files updated at the end of every epoch:
*   **`.history/timeline.toon`**: Chronological ledger of all tools executed.
*   **`.history/intent.toon`**: Longitudinal record of "Architectural Intent" across all epochs.
*   **`.history/interrupted_state.toon` (The Spoke)**: Detailed extraction of exact mental drafts and partial tool fragments, acting as a hot-swap restore point.
*   **`.history/project_rules.toon`**: The centralized, semantically deduplicated repository for enduring architectural constraints, user preferences, and behavioral rules extracted across the session.

## 5. Epoch Cold-Starts: The Deep Inception Method (Logical Handshake)
To break "orientation loops" where agents waste context re-verifying the state, Epoch CLI uses a **Deep Inception** logic that pre-fills the agent's working memory with verified tool results.

### The Logical Handshake
When a new epoch begins, the system performs a two-part injection:

#### Part A: [SYSTEM] EPOCH_CONTINUATION_PROTOCOL
A clinical protocol message is injected at the start of the context. It serves to satisfy the agent's internal "Mandatory Workflows" by simulating the output of its required orientation tools. This protocol is **dynamically built** based on the current project phase to reduce cognitive load:
*   **Pointer-Based Orientation (Lazy Injection)**: To maintain a lean context budget, the system no longer pushes the full text of `Specification.md` and `Tasks.json` into every epoch. Instead, it provides concrete pointers and explicit instructions:
    *   *Specification Phase*: Injects `sc_status` and instructions to `read` the specification if needed.
    *   *Planning Phase*: Injects `sc_status` and pointers to `Specification.md` and `Tasks.json`.
    *   *Build Phase*: Injects `sc_status`, pointers to the spec files, and guidance to use `mcpx map context` for architectural state.
*   **Orientation Satisfaction**: It explicitly states: `ORIENTATION_REQUIREMENTS: SATISFIED. Do NOT repeat discovery.`
*   **Path Grounding**: Injects the absolute `Active Feature Path` to ensure the agent is correctly localized within the container filesystem.
*   **The Handover Directive**: If the agent is transitioning from the Planning phase to the Build phase (e.g., the plan was just approved), a specific handover directive is injected: `The Implementation Plan has been APPROVED. You are now authorized to implement code. Start by marking the first task as in-progress...`
*   **Build Phase Guidance**: In the implementation phase, it injects a concise 6-line guide for Project Map tooling (`pm_query`, `pm_plan`, etc.) to encourage architectural discovery over generic file listing.

#### Part B: Persona Synchronization (Deterministic State)
During the transition, the system performs a final verification of the `workflow_map.phase` from the continuity report:
*   **Persona Hard-Reset**: If the phase is `Implementation` or `Build`, the system forces the `agent` persona to **`build`** for the new epoch, even if the previous epoch ended in `plan` mode.
*   **Reminder Suppression**: This ensures that restrictive "Plan Mode" system reminders are suppressed in favor of implementation-focused context.

#### Part C: [USER] Resumption Command
A succinct, conversational message succeeds the protocol:
*   *"Hi, we're continuing the [Project Name] project. I've pre-verified the current state for you (see results above). Please proceed directly to the next action: [Next Tool Call]"*

## 6. Safe Transition Lifecycle
The CLI employs a proactive "Safe Transition" mechanism that monitors the context budget in real-time.

### Context Budgeting & Overflow Detection
The `PromptEngine` maintains a high-fidelity estimate of context fullness to prevent "stealth overflows" where the payload exceeds the model's limit before the system can react. This is managed by a specialized `Tokenizer` utility:
*   **High-Fidelity Payload Estimation**: The engine calculates token counts for the **entire payload**, including the System Prompt, Tool Schemas, and Message History. This prevents overflows caused by large system-level context.
*   **Dynamic Tokenization (`/tokenize`)**: For local models (e.g., `llama.cpp`), the engine attempts to query the provider's native `/tokenize` endpoint by sending the complete compiled payload. This ensures exact token array sizing regardless of the model's specific BPE vocabulary.
*   **The Post-Generation Heuristic**: If the dynamic endpoint is unavailable or during asynchronous background tasks (like `PostGenerationWorker`), the system falls back to a mathematical heuristic. Because local BPE models (like Qwen) processing heavily structured JSON and TOON payloads often consume tokens at a different rate than plain English, the worker applies a strict `1.4 chars per token` heuristic to prevent its own summarization context from overflowing.
*   **Phase-Gate Transitions**: Non-interrupting resets triggered when major workflow boundaries are crossed.

### The Transition Handshake
When a threshold is crossed:
1.  **Intercept**: Pause the loop before the next generation.
2.  **Archiving**: Invoke `PostGenerationWorker` to extract state and read project artifacts.
3.  **Synthesis**: Clerk generates the `.epoch-continuity.toon` hub and `.history/` spokes.
4.  **Context Cleared**: Insert a `TransitionPart` marking the boundary.
5.  **Inception Re-Initialization**: Spawn a new epoch and inject the **Logical Handshake** (System protocol + User command).

### Emergency Transition Handshake (Runtime Overflow & Collapse)
If an unexpected overflow or severe attention collapse occurs during generation, the system hoists the detection logic above standard error classifiers to ensure a safe transition:
*   **Engine-Level Overflow Interception**: If the model rejects a prompt outright or fails mid-stream (e.g., `llama.cpp` returning a 500 error when KV cache is exhausted), the resulting `ContextOverflowError` is caught directly at the `handle.process()` boundary. The engine elegantly catches this rejection and converts it into a `compact` signal, triggering an immediate, non-crashing epoch transition.
*   **RoPE Collapse Detection (Hard Reset)**: When local models (like Qwen or Gemma) exceed their native context limits but the server accepts the prompt due to flawed YaRN/RoPE scaling, they often experience "attention collapse." This manifests as an infinite repeating loop (rambling). The CLI catches this as a `STREAM_ABORT_RAMBLING` error and bypasses standard intervention queues, interpreting it as a critical stagnation event and forcing an immediate Hard Reset transition.
*   **Recursive Overflow Detection**: Inspects nested error objects and stringified JSON payloads across all supported providers to reliably identify stealth overflows.
*   **Hub and Spoke Synthesis**: Uses telemetry collected up to the point of failure to provide the best possible recovery state, ensuring interrupted thoughts and partial tool calls are preserved for the next epoch.

This event-driven approach ensures the "Infinite Agent" capability remains uninterrupted. By catching hardware-level or API-level exhaustion events and rotating the context immediately, the engine provides the agent with a fresh "Inception" of the project state without dropping the session.
