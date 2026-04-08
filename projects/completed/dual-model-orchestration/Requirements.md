# Dual-Model Orchestration Requirements

## Objective
Implement a sequential multi-model execution architecture (the "Baton Pass" Event Loop) utilizing a fast 4B "Clerk" model for pre/post generation tasks and a 26B main model for primary generation.

## Key Requirements

1. **Provider Configuration**
   - Configure a `local-main` provider pointing to `http://localhost:8085/v1` (e.g., Gemma 4 26B).
   - Configure a `local-side` provider pointing to `http://localhost:8086/v1` (e.g., Nemotron 3 Nano 4B).

2. **The "Baton Pass" Event Loop Architecture**
   - **Phase 1: Pre-Generation (Clerk / Side Model)**
     - Triggered on user submit.
     - Responsibilities: JSON log sanitization, JSON-to-TOON context compression, rule routing based on prompt classification.
   - **Phase 2: Main Generation (Main Model)**
     - Receives sanitized TOON-formatted prompt.
     - Uses 3-Zone Positional Architecture (Zone 1: TOON Context, Zone 2: Rules, Zone 3: User Query).
     - Generates primary response (code/text) streaming to the user.
   - **Phase 3: Post-Generation (Clerk / Side Model)**
     - Background asynchronous task triggered after main generation completes.
     - Responsibilities: Persistence Extraction (saving user corrections to disk), Epoch Summarization (updating state).

3. **Log Parser Validation Tool**
   - Implement a log parser function that reads logs from `/home/llm/utils/launch/logs`.
   - The parser must verify that the event loop functions sequentially (Side -> Main -> Side) without concurrent overlap, validating the performance optimization.

4. **Task-Epoch State Management**
   - Integration with Spec CLI for task boundaries, pulling fresh documentation for new tasks and wiping chat history to maximize the 32k context limit.
