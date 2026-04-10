# gemma-4-dual-model - Requirements Document

Implement the updated Gemma 4 (26B MoE) Coding Assistant dual-model architecture.

## Core Architecture

### Engine & Environment Baseline
- Model Profile: Gemma 4 26B A4B (3.8B Active / 26B Total parameters).
- Context Window Limitation: Capped at 32K - 64K tokens (via `--max-model-len`).
- Engine Flags: Enable `--kv-cache-dtype fp8`.
- Native Control Tokens: Recognize and utilize `<|think|>`, `<|channel>thought`, `<channel|>`, `<|tool_call>`, `<|tool_response>`, and `<|">` (for bounding string literals/code snippets).

### Core System Prompt Architecture
- The system prompt contains zero honorifics or role-playing, and exclusively contains structural rules, tool schemas, and dynamic context blocks.
- Context Injection via TOON: Convert structured context to TOON (Token-Oriented Object Notation) before injection to save 30% - 60% of context tokens.
- Use standard Markdown exclusively for structuring non-data text.

## Orchestration & Lifecycle Architecture (Stateful vs. Stateless)

### The Main Model (26B) - Stateful Task-Epochs
- The 26B MoE acts as the core reasoning and generation engine.
- Stages:
  1. Cold Start: Initializes empty context window, fed only TOON-compressed files and Ground Truth rules.
  2. Execution: Iterative loop where 26B streams code/tool calls.
  3. State Committal: Task complete, user accepts diffs.
  4. Purge (Cold Restart): Conversation history and context wiped.

### The Clerk Model (4B) - Stateless Micro-Epochs
- Acts as router, formatter, and memory manager.
- Transactional and stateless: Dumps context completely after every single interaction or background task.

### The "Baton Pass" Event Loop
- Phase 1: Pre-Generation (The Clerk) - Initiates Micro-Epoch, reads TOON files, runs RAG, packages prompt, emits END_GENERATE.
- Phase 2: Generation (The Main Model) - Takes Baton, executes Stateful Execution, streams code, emits END_GENERATE.
- Phase 3: Post-Generation / The Archivist (The Clerk) - Background Micro-Epoch summarizes Phase 2, updates TOON, persists Ground Truth, emits END_GENERATE.

### Proactive Context Management (The Graceful Wrap-Up)
- Maintain a "High Watermark" (e.g., 85% context capacity).
- Clerk model calculates Context Velocity during Phase 1.
- Intercept & Wrap-Up Directive: If context limit breach is predicted, Clerk injects a high-priority Wrap-Up Directive to force state save.

## Advanced Modalities

### Thinking Mode & Turn Management
- Trigger: Prepend `<|think|>` to system prompt for tasks requiring logic.
- Adaptive Thought Depth: Low effort for boilerplate, High effort for architecture/refactoring.
- Thought-Loop Prevention: Actively strip previous `<|channel>thought...<channel|>` blocks when sending history back.

### Agentic Output Integrity: Phase 2 Middleware Sanitization
- Three-Stage Sanitizer Middleware intercepts Main Model's output during Phase 2.
- 1. Regex Cleaning (Garbage Collection): Strips markdown wrappers, truncates trailing text.
- 2. Structural Repair: Uses JSON-repair library to balance brackets, resolve commas, escape quotes.
- 3. Schema Validation: Validates repaired object against Zod schemas.
- If repaired and validated, feeds `<|tool_response>` back instantly.

### Positional Prompt Architecture
- Zone 1: The Absolute Beginning (First 200 Tokens) - Correction Persistence Block, Current State (Spec CLI MCP), Critical Symbols (Project Map MCP).
- Zone 2: The Middle (Attention Blind Spot) - Ground Truth Rules, General Context, Tool Definitions.
- Zone 3: The Absolute End (Last 200 Tokens) - Fact Repetition, Local Cursor Context.

### The Correction Persistence Pipeline
- Detects user correction language patterns.
- Background process extracts corrected fact.
- Persists to local file and injects into Zone 1 and Zone 3 on subsequent inferences.

## Telemetry and Architectural Validation
- Independent Lifecycle Tracking: `mainEpochId` and `clerkMicroEpochId`.
- Metrics: Strict Overlap Detection, Context Velocity Tracking, Time-to-First-Token (TTFT), Sanitization Success Rate (`json_repaired` in Phase 2), Wrap-up Metric (`wrap_up_triggered`).
- Zone-Aware Payload Truncation: Pass `ZoneStructuredPayload` object before stringification. Truncate `zone2_context_files` when exceeding threshold, preserving zone 1 and 3.