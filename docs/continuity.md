# Epoch Continuity and Transition Architecture

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
*   **Ground-Truth Artifact Verification**: Extracts active files from tool inputs (`edit`, `write`, `read`, etc.) and performs a deterministic disk check using `fs.stat`. This separates **Verified Artifacts** (exist on disk) from **Missing Artifacts** (referenced in tools but absent), preventing the "Artifact Ghosting" failure mode where the agent assumes work is finished when it isn't.
*   **Complete Cognitive State Extraction**: Captures the agent's internal reasoning blocks (`<|channel>thought`) across the **entire epoch** (up to 50 messages), ensuring early architectural decisions are preserved even if later turns focus on discovery or minor edits.

### 3. The Continuation Report (`.epoch-continuity.toon`) (Executive Summary)
When a session completes (or reaches its context limit), Phase 3 (`PostGenerationWorker` in `src/session/worker.ts`) executes:
1.  The worker gathers the high-fidelity timeline and recent thoughts from the `SessionAnalyzer`.
2.  It queries the `map` MCP server for the current `pm_status` to inject live architectural context.
3.  It prompts the `local-side` Clerk model to synthesize a structured report in **TOON** (Token-Oriented Object Notation) format.
4.  **Succinct Executive Summary Mandate:** The report is designed as a dense executive summary (~600-800 tokens), stripping away verbose error traces and detailed cognitive loops in favor of high-level architectural intent and clear signposting.
5.  **Historical Signposting:** The report includes a mandatory `historical_references` section that provides the agent with specific triggers and file paths for deeper context in the `.history/` directory.
6. The report includes:
    *   **Historical References**: A structured list of `{ topic, file, trigger }` pointing to `.history/` (e.g., `intent.toon`, `timeline.toon`).
    *   **Workflow Map**: 
        *   `pipeline_step`: The current step (1-5) in the **Documentation-to-Build** pipeline (e.g., `2. Requirements`, `3. Design`).
        *   `phase`: Granular spec phase (Requirements/Design/Tasks/Build).
        *   `status`: Ready/Blocked/In-Progress.
    *   **Project Map Status**: Live health and structural summary of the index (e.g., "Healthy", "8 symbols in core/").
    *   **Executive Intent**: A distilled map of the agent's internal architecture, including `high_level_architecture` and immediate `conclusions`.
    *   **Technical Progress (Grounded)**: Separation of finalized `completed_artifacts` from `blocked_drafts` needing edits. This section is strictly grounded by the Ground-Truth Artifact Verification; missing files are automatically downgraded to `blocked_drafts` with a note to the agent that they must be (re)created.
    *   **Function Activity**: A dense, 2-3 line chronological summary of recent critical actions.
    *   **Next Action**: A direct `tool` recommendation with a concrete `example_input` JSON object (including `mcpx` syntax).

### 4. Global History Suite (`.history/*.toon`) (Long-Term Memory)
To combat "action paralysis" during epoch transitions, the CLI maintains a pre-chewed suite of global history files in the project root. These are updated at the end of every epoch by the `SessionAnalyzer`:
*   **`.history/timeline.toon`**: A complete chronological ledger of every tool executed and its outcome since the project started. The main agent consults this file when full historical context is required.
*   **`.history/intent.toon`**: A longitudinal record of the "Architectural Intent" across all epochs. During transition, the `executive_intent` section of the continuity report is appended here, providing an on-demand history of the project's evolution and decisions.
*   **`.history/files.toon`**: A deduplicated registry of all files touched across all epochs.
*   **`.history/errors.toon`**: A dedicated log of failed tools and validation hints.
*   **`.history/interrupted_state.toon` (The Spoke)**: A highly detailed, verbose extraction of the agent's exact mental drafts and intentions. This file is generated during **all** epoch transitions (both managed and emergency). It forms a **Hub and Spoke** recovery model with the executive summary, capturing the "thought tail" and any partial tool call fragments to allow the agent to pick up exactly where it left off mid-thought.

## 5. Epoch Cold-Starts (Injection & Persistence)
When a new session is started—whether it is an automatic Epoch Transition, a manual CLI invocation, or a TUI launch—the system natively searches for `.epoch-continuity.toon` in the project root.
*   **Conversational Resumption**: If found, instead of a cold system prompt mandate, the system injects a concise, conversational user message that summarizes the rationale for the next action, provides a suggested tool call, and lists **Signposts** pointing the agent to the detailed `.history/` suite for on-demand orientation.
*   **Strict Action Bias**: To prevent "orientation debt" where the agent wastes context re-discovering the workspace, the injected resumption prompt explicitly commands the agent to execute the next pending action immediately. Discovery tools (e.g., `read`, `ls`, `pm_query`, `sc_status`) are strictly prohibited for the first 3 turns of a new epoch, forcing the agent to trust the continuity reports.
*   **Persistence**: The continuity report and `.history/` suite are deliberately preserved across manual restarts. They act as a bridge, ensuring that whether a session was interrupted by a context limit or closed manually by the user, the new session can resume cleanly with hot-swapped memory.

## 6. Safe Transition Lifecycle

To prevent abrupt failures and the dreaded `400: Context Overflow` error from LLM providers, the CLI employs a proactive "Safe Transition" mechanism that monitors the context budget in real-time.

### Context Budgeting & Overflow Detection
The `PromptEngine` (in `packages/epochcli/src/session/prompt/engine.ts`) maintains a high-fidelity estimate of the current context fullness before every LLM interaction:
*   **Total Token Tracking**: The engine calculates the sum of all messages, including system prompts, user inputs, and agent reasoning.
*   **Tool Output Accounting**: Critically, the estimation logic includes the raw `output` and `error` strings of all executed tools. This prevents "stealth overflows" caused by large command outputs (e.g., recursive directory listings or verbose build logs).
*   **Dynamic Safety Margin**: The system strictly monitors tokens against the model's absolute limits. When the estimated usage plus a dynamic safety margin (minimum 1000 tokens or the model's `maxOutputTokens`) exceeds the maximum context, it triggers an automatic Epoch Transition. Legacy context "compaction" and arbitrary token buffers have been entirely descoped.

### The Transition Handshake
When the `isInputOverflow` threshold is crossed, the following deterministic handshake occurs:
1.  **Intercept**: The current agent loop is paused before the next generation starts.
2.  **Archiving**: The `PostGenerationWorker` is invoked with `isTransition: true`. It executes the `SessionAnalyzer` to extract facts, thoughts, and architectural state.
3.  **Synthesis**: The `local-side` Clerk generates the `.epoch-continuity.toon` report and the `.history/interrupted_state.toon` spoke based on the archived state.
4.  **Context Cleared**: A new `TransitionPart` is inserted into the session database, marking the boundary.
5.  **Conversational Re-Initialization**: The CLI automatically spawns a new Task-Epoch. On startup, it clears the old context and injects a concise, conversational user message referencing the continuity report and `.history/` signposts, allowing the agent to resume work with "residual memory" and immediate momentum.

This lifecycle ensures that the user experiences a brief "Optimizing Workspace..." pause instead of a terminal engine failure, preserving the autonomy and progress of the agent.

### Emergency Transition Handshake (Runtime Overflow)
While the system proactively estimates context usage, unexpected overflows can still occur during generation (e.g., due to a massive file write or high model verbosity). These manifest as an `APICallError` from the provider or as a standard JavaScript `Error` with a message indicating the context limit was exceeded. 

The system handles these by **hoisting the overflow detection logic** above the standard error classifier in `MessageV2.fromError`. This ensures that even unstructured/flat string errors or nested JSON payloads returned by local proxies (e.g., `llama-cpp` or `llama-swap`) are intercepted and correctly typed as `ContextOverflowError` before they can be misclassified as fatal `UnknownErrors`.

To ensure robustness against varied local provider responses, the CLI employs **Recursive Overflow Detection**:
*   **Object Inspection**: The parser recursively searches nested error objects for keys like `message`, `error`, and `code` that match known overflow patterns.
*   **Stringified JSON Extraction**: If an error message is a stringified JSON object, the system automatically attempts to parse and inspect its contents for hidden overflow signals (e.g., `{"error": {"code": 500, "message": "Context size has been exceeded."}}`).
*   **Multi-Layer Validation**: Detection occurs both at the raw stream level and after API error normalization, ensuring no "stealth overflows" escape the transition loop.

The CLI handles these through a non-fatal **Emergency Transition Handshake**:
1.  **Error Interception & Event Emission**: The `SessionProcessor` catches the `ContextOverflowError` mid-stream. Instead of publishing a fatal `session.error`, it emits a `session.epoch_transition` event and signals a transition requirement to the engine.
2.  **UI Notification**: The UI layer (CLI or TUI) receives the transition event and informs the user (e.g., `[System: Context limit reached. Initiating automatic Epoch transition...]`) without breaking the execution loop or exiting the process.
3.  **Emergency Archiving**: The engine immediately halts the current generation and invokes the `PostGenerationWorker` with `isTransition: true`.
4.  **Hub and Spoke Synthesis**: Despite the mid-stream failure, the supervisor uses the telemetry and reasoning blocks collected *up to that exact point* to synthesize a dual-output recovery package:
    *   **The Hub**: The standard `.epoch-continuity.toon` executive summary.
    *   **The Spoke**: The `.history/interrupted_state.toon` file, containing the literal drafts, tool call fragments, or "thought tails" the agent was forming right before the crash. This is achieved by capturing `tool-input-delta` stream events and persisting the raw JSON string to the database even if the tool call fails to parse completely.
5.  **Conversational Resumption**: The session context is cleared, and a new Task-Epoch begins. Instead of a cold system report, the CLI injects a **concise, plain-English introduction** as the first user message:
    *   *"Hi, we are continuing a project as the context window ran out and we are starting a new chat to resume from before. The following detailed history resources are available in the .history/ directory to support your orientation: [Signposts to Suite]. Lets get straight on with continuing our work"*
6.  **On-Demand Orientation**: The agent uses the signposts to identify which history files to read (e.g., reading `.history/interrupted_state.toon` to recover a partial buffer) while maintaining momentum via the immediate rationale provided in the message.
7.  **Project Mapping**: The agent is encouraged to use `.project-map/latest/map.toon` for architectural re-orientation if needed.

This event-driven approach ensures the "Infinite Agent" capability remains uninterrupted, as the UI simply waits for the fresh epoch to stream its first response.

The robustness of these transitions is verified in `packages/epochcli/test/session/continuity-handover.test.ts`.
