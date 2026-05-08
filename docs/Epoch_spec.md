# Epoch: Dual-Model Coding Assistant Specification

This document defines the core architecture, orchestration, and behavioral constraints of the Epoch CLI. It brings together implemented functionality into a single, authoritative specification for the dual-model system.

## 1. Engine & Environment Baseline

Epoch CLI utilizes a **Dual-Model Architecture** optimized for high-performance coding and reliable background supervision, served through a unified proxy (**llama-swap**).

*   **Unified Proxy Architecture:** All models are served at `http://localhost:8085/v1` (OpenAI compatible). The proxy handles dynamic model swapping in VRAM.
*   **Model Profiles:** The system is designed for flexible model pairing, typically utilizing a high-capacity "Main" model and a faster "Side" model. Supported configurations include:
    *   **Qwen Pair:** Qwen 3.6 (35B) as the Main coder and Qwen 3.6 MoE as the Side model.
    *   **Gemma Pair:** Gemma 4 Dense as the Main coder and Gemma 4 MoE as the Side model.
    *   **Hybrid:** Cross-family pairings (e.g., Qwen Main with Nemotron Side) are also supported via keywords in the Model ID that trigger specific architectural optimizations (e.g., `<|think|>` injection for Gemma).
*   **Optimization Flags:** Engines utilize `--kv-cache-dtype fp8` and `--max-model-len` to enforce a hard **32K/64K context cap**, preventing physical VRAM exhaustion.
*   **Cold Start (SWAP):** Only one model is hot in memory. Swapping models adds a 15-20s delay. Active models persist for 60 minutes.

## 2. Orchestration & Lifecycle (Stateful vs. Stateless)

The system employs a decoupled, dual-lifecycle orchestration to maximize context efficiency.

### 2.1 The Main Model (26B) - Stateful Task-Epochs
Operates on a **Stateful Task-Epoch** lifecycle. Context is a curated workspace containing only active project files and the ongoing train of thought.
1.  **Cold Start:** Initializes fresh context with TOON-compressed files and Ground Truth.
2.  **Execution:** Iterative loop of reasoning and tool calls.
3.  **Purge (Cold Restart):** Context is wiped after task completion or limit breach, relying on the **Continuity Report** for resumption.

### 2.2 The Clerk Model (4B) - Stateless Micro-Epochs
Operates on a **Stateless Micro-Epoch** lifecycle. Context is wiped after every interaction.
*   **Phase 1 (Pre-Gen):** Intercepts prompt, performs RAG, and packages an optimized prompt for the Main model.
*   **Phase 3 (Post-Gen):** Synthesizes continuity reports and updates the global history.

## 3. Epoch Continuity & Transition Architecture

Epoch CLI manages context limits through a **Safe Transition** mechanism that replaces legacy truncation with dense, narrative reports.

*   **The Continuity Report (`.epoch-continuity.toon`):** A dense executive summary (~600-800 tokens) providing architectural intent, technical progress (grounded by disk checks), and clear next actions.
*   **Global History Suite (`.history/`):**
    *   `timeline.toon`: Complete chronological ledger of every tool and outcome.
    *   `intent.toon`: Longitudinal record of architectural decisions.
    *   `interrupted_state.toon`: "Hot-swap" memory (thought tails, partial buffers) for emergency recovery.
*   **Transition Handshake:**
    *   **Proactive:** Triggered when the `PromptEngine` detects the context budget (including tool outputs) is within the safety margin.
    *   **Emergency:** Intercepts `ContextOverflowError` mid-stream, capturing the "thought tail" before a cold restart.
*   **Conversational Resumption:** New epochs start with a concise user message providing **Signposts** to the history suite, forcing a "Strict Action Bias" for the first 3 turns.

## 4. Positional Prompt Architecture (4-Zone Model)

To exploit the transformer's U-shaped attention curve, prompts are partitioned into four distinct zones in the System role.

1.  **Zone 1: The Head:** Immediate context (Persona, Operational Facts, Thinking Control tokens).
2.  **Zone 2: The Body:** Behavioral rules and interaction context (Trigger/Behaviour/Example packs).
3.  **Zone 3: The Tail:** Project-specific technical rules and active **Cursor Context**.
4.  **Zone 4: The Guidelines:** High-priority intent extracted from `AGENTS.md` and `.cursorrules`.

**Internal State Check:** Injected as a hidden instruction in the final User message to manage adaptive thought efficiency and strategy without breaking user/assistant alternation.

## 5. Thinking Mode & Turn Management

Epoch CLI utilizes the native `<|think|>` protocol (for Gemma 4) with **Clerk-Driven Adaptive Effort**.

*   **Adaptive Effort:** The Clerk classifies task complexity:
    *   **LOW:** Simple status checks/boilerplate (reduces reasoning tokens by ~20%).
    *   **HIGH:** Complex refactoring/debugging.
*   **Thought-Loop Prevention:** Previous thought blocks are stripped from conversation history during turn transitions to prevent the model from repeating its reasoning.

## 6. Deterministic Agent Workflow & Persona Routing

Persona assignment is **Deterministic**, driven by project state rather than probabilistic guessing.

*   **Personas:** `plan` (restricted to spec/tasks), `build` (code/bash/tests), `explore` (read-only).
*   **State-Driven Shift:** The moment `sc_approve` is called via the `spec` tool, the orchestrator detects the phase change in the continuity report and automatically elevates the agent to the `build` persona.
*   **Workflow Monotonicity:** Tightly coupled with the `spec` tool sequence: `sc_init` -> `Specification.md` -> `sc_approve` -> `sc_plan` -> `Tasks.md` -> `sc_approve` -> `Implementation`.

## 7. Doom Loop Protection (Stall Scoring)

A multi-layered strategy detects and breaks non-productive repetitive cycles.

*   **Stall Scoring:** Increments based on action type (Reset on file writes; +10 for empty turns; +5 for repetition).
*   **Immediate Interception:** Triggered by:
    *   Identical tool call repetition (2x).
    *   Global failure loops (3 consecutive errors).
    *   Actionless rambling (>3,000 chars) or semantic stuttering (>85% similarity).
*   **Supervisor Intervention:** The Clerk provides a **Context-Aware Directive** (The Loop Breaker), injected as a `[CRITICAL INTERVENTION]` synthetic user message to force a strategy shift.

## 8. Agentic Output Integrity (Middleware Sanitization)

To ensure the agentic loop remains unbroken, the system implements a **Three-Stage Sanitizer Middleware** that repairs the 26B model's output in real-time.

1.  **Regex Cleaning:** Strips markdown wrappers and truncates trailing conversational garbage.
2.  **Structural Repair:** AST-based repair of missing braces, illegal commas, and unescaped quotes.
3.  **Schema Validation:** Validates the repaired JSON against Zod definitions before execution.
*   **Hallucination Correction:** If an agent enters a "variadic failure loop" (trying variations of non-existent files), the Clerk intervenes with a forced `SYSTEM INTERVENTION` tool error.

## 9. Unified MCP Interface (`mcpx`)

To reclaim context budget and prevent agentic drift, all MCP interactions are unified under the `mcpx` tool.
*   **Dynamic Discovery:** Replaces thousands of lines of static JSON schemas with a single entry.
*   **Syntax:** `mcpx <server> <tool> --flag=value`.
*   **Zero-Schema Bloat:** Tools are discovered and inspected dynamically by the model via CLI-style help commands.

## 10. Telemetry & Architectural Validation

Strict observability validates the efficacy of the architecture.
*   **Independent Tracking:** `mainEpochId` (persistent task) and `clerkMicroEpochId` (per-interaction).
*   **Captured Metrics:** TTFT (ms), TPS, `json_repaired` (boolean), `context_velocity` (tokens/turn).
*   **Payload Truncation:** Loggers use structural truncation (targeting Zone 2) to preserve critical Zone 1 and Zone 3 rules in telemetry for debugging.

## 11. Context Injection via TOON

Data-dense context (file trees, linter logs, architectural maps) is converted to **TOON (Token-Oriented Object Notation)**. By using YAML-style indentation and CSV-style rows instead of JSON keys, it saves 30%-60% of context tokens, significantly improving prefill latency.
