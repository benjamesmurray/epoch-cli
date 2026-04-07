# dual-model-architecture - Requirements Document

## Core Features

This feature updates the Epoch CLI agent to support a dual-model, sequential event loop architecture utilizing Gemma 4 (26B MoE) as the main generative engine and Nemotron (4B) as a background orchestrator and sanitizer. It shifts the conversational model to a "Task-Epoch" state machine, neutralizing context limits and memory bloat.

1. **Engine & Environment Baseline**
   - Main Model Profile: Gemma 4 26B A4B. Context capped at 32K - 64K.
   - Utilize fp8 kv-cache.
   - Native Control Tokens mapping: `<|think|>`, `<|channel>thought`, `<channel|>`, `<|tool_call>`, `<|tool_response>`, `<|">`.

2. **Core System Prompt Architecture**
   - Zero-Fluff Base Identity: No honorifics.
   - Context Injection via TOON (Token-Oriented Object Notation). No JSON for context.
   - Standard Markdown strictly for semantic signaling.

3. **Thinking Mode & Turn Management**
   - Adaptive Thought Depth based on task.
   - Thought-Loop Prevention: Strip previous `<|channel>thought...<channel|>` blocks from the payload before next turn.

4. **Output Parsing & The 26B JSON Mitigation**
   - Three-Stage Sanitizer at the application layer: Regex Cleaning, Structural Repair, Schema Validation.

5. **Interaction Modalities**
   - Conversational/Agentic: Uses Thinking Mode, TOON context, and JSON sanitizer.
   - Autocomplete (FIM): No `<|think|>`, no markdown, uses sliding-window attention.

6. **Positional Prompt Architecture**
   - Zone 1: Correction Persistence, Current State, Critical Symbols (TOON).
   - Zone 2: Ground Truth Rules, General Context, Tool Definitions.
   - Zone 3: Fact Repetition, Local Cursor Context.

7. **The Correction Persistence Pipeline**
   - Passive monitoring of user chat for corrections. Extraction, persistence, and reinjection into Zone 1 and 3.

8. **Persistent Functional State via MCP**
   - Spec CLI acts as source of truth.
   - Idle Thinking Cycles update project map TOON data.

9. **Sequential Processing Optimizing Orchestration (Event Looping)**
   - Phase 1: Pre-Generation (Nemotron 4B sanitizes/formats TOON).
   - Phase 2: Main Generation (Gemma 26B).
   - Phase 3: Post-Generation (Nemotron 4B extracts persistence and summarizes epoch).

10. **Task-Epoch Architecture**
    - The Cold Start: Context wipe per task. Prompt rebuilt.
    - Execution: Gemma runs with pristine context window.
    - State Committal: Spec CLI marks task complete, 4B model extracts doc updates.
    - The Purge: History wiped again.

## User Stories

- As a developer, I want the assistant to seamlessly pass tasks between a 4B orchestrator and a 26B generator so that generation is lightning fast without compute contention.
- As a developer, I want the system to operate in Task-Epochs so that context dilution is completely avoided and the assistant never loses focus over long sessions.
- As a user, I want my explicit instructions to be permanently saved and injected at the top and bottom of the prompt so the model never forgets my rules.

## Acceptance Criteria

- [ ] Providers are configured for `local-main` (Gemma 4 26B) and `local-side` (Nemotron 4B).
- [ ] A sequential orchestration pipeline (Pre-Generation, Generation, Post-Generation) is implemented for tool calls and responses.
- [ ] System prompt injection separates context into the 3 defined Zones.
- [ ] Contextual elements (file trees, symbols) are converted to TOON format before injection.
- [ ] The engine correctly handles the cold-start epoch logic, purging raw message history between high-level tasks.
- [ ] Output from the 26B model passes through a 3-stage JSON sanitizer before tool execution.

## Non-functional Requirements

- Maintain zero compute contention between the 4B and 26B models.
- Prefill latency must be optimized by TOON compression and strict context limits (32K-64K).
- Maximum TPS must be preserved for both models (200+ TPS for 4B, 140+ TPS for 26B).
