Gemma 4 (26B MoE) Coding Assistant Specification

1. Engine & Environment Baseline
To maximize the efficiency of the 26B A4B (Mixture of Experts) model via llama.cpp or vLLM, the host environment must be strictly configured to manage memory and leverage native optimizations.

Coder:
Model Profile: Gemma 4 26B A4B (3.8B Active / 26B Total parameters).
Context Window Limitation: While natively capable of 256K, cap the context window at 32K tokens in your engine settings. 
Engine Flags (vLLM/llama.cpp): * Ensure --kv-cache-dtype fp8 (or local equivalent) is enabled to halve memory consumption.
Use --max-model-len to enforce the hard context cap.
Native Control Tokens: Your fork must recognize and utilize these exact tokens:
<|think|>: Triggers the native reasoning engine.
<|channel>thought and <channel|>: The boundaries of the model's internal scratchpad.
<|tool_call> and <|tool_response>: The boundaries for agentic actions.
<|">: Use this specific native token for bounding string literals and code snippets instead of standard markdown quotes where possible, to improve parsing.

Clerk:
Model Profile: Nemotron.
Context Window Limitation: Cap the context window at 32K tokens in your engine settings. 
Engine Flags (vLLM/llama.cpp): * Ensure --kv-cache-dtype fp8 (or local equivalent) is enabled to halve memory consumption.
Use --max-model-len to enforce the hard context cap.

2. Core System Prompt Architecture
Traditional, verbose instructions ("You are an expert," "Think step-by-step") are deprecated. They consume prefill tokens and degrade Time-to-First-Token (TTFT) without improving performance, as Gemma 4 is already pre-aligned with professional coding standards.

The Zero-Fluff Base Identity: The system prompt should contain zero honorifics, role-playing, or model identification. 
Rule: Prohibit strings like "You are powered by model X" or "I am an AI." Every token must be used for structural rules, mcpx tool schemas, or dynamic context.

Offloaded Rule Initialization (Zone 2 offloading): Static behavioral rules, style guides, and engineering tasks are offloaded from the `system` role into a one-time `assistant` message in the conversation history. This saves ~600-1000 tokens per turn while keeping rules in the model's active memory.

Context Injection via TOON: Do not use JSON to pass large contextual datasets (like repository file trees or linter logs) into the prompt.
Rule: Convert structured context to TOON (Token-Oriented Object Notation) before injection. By using YAML-style indentation and CSV-style rows instead of repeated JSON keys, you will save 30% - 60% of context tokens, vastly improving prefill latency.

Markdown for Semantic Signaling: Use standard Markdown (#, ##) exclusively for structuring non-data text. The model's attention mechanism relies on plain-text semantic hierarchy to perform "needle-in-a-haystack" code retrieval.

3. Orchestration & Lifecycle Architecture (Stateful vs. Stateless)
To maximize the 32k-64k context limit of the 26B Main Model and prevent physical VRAM exhaustion, the system employs a decoupled, dual-lifecycle orchestration. The two models operate under fundamentally different memory management paradigms, sharing a strict, sequential event loop.

#### 3.1 The Main Model (26B) - Stateful Task-Epochs
The 26B MoE acts as the core reasoning and generation engine. Because its context window is precious, it operates on a **Stateful Task-Epoch** lifecycle. Its context is treated as a highly curated, pristine workspace containing *only* the active project files, the exact code being modified, and the ongoing train of thought.

The Main Model's Task-Epoch consists of four distinct stages:
 1. **Cold Start:** The system initializes a fresh, empty context window. The Main Model is fed only the specific TOON-compressed files and the Ground Truth rules injected by the Clerk.
 2. **Execution:** The core iterative loop where the 26B model streams code and executes tool calls to complete the immediate task.
 3. **State Committal:** The task is marked complete. The user accepts the diffs, and the final state of the code is committed.
 4. **Purge (Cold Restart):** The conversation history and context window are completely wiped. The model is effectively "reset" to a pristine state for the next task, relying entirely on the updated codebase and Ground Truth documents for its ongoing memory.

#### 3.2 The Clerk Model (4B) - Stateless Micro-Epochs
The 4B side-model acts as the router, formatter, and memory manager. Because it handles the "heavy lifting" (reading large TOON files, running ground-truth RAG, and parsing user intent), it would bloat its context window rapidly. Therefore, it operates on a **Stateless Micro-Epoch** lifecycle.
 * **Context Paradigm:** Transactional and stateless. The Clerk dumps its context completely after every single interaction or background task.
 * **Lifecycle:** A Micro-Epoch boots up instantly to process an incoming prompt, injects necessary rules, and then immediately terminates. Because the KV cache is wiped every time, the Clerk’s Time-to-First-Token (TTFT) remains permanently optimized.

#### 3.3 The "Baton Pass" Event Loop
Because both models share the same physical GPU compute and VRAM, they must never execute concurrently. The orchestration relies on a strict, three-phase "Baton Pass" sequential loop.
 * **Phase 1: Pre-Generation (The Clerk)**
   * **Action:** The 4B Clerk initiates a Micro-Epoch. It intercepts the user's prompt and analyzes a **Structural Transcript** of the conversation tail (including tool calls). It reads the TOON-compressed architectural files, runs RAG against the Ground Truth rules, and packages this into a highly optimized, persona-filtered prompt for the Main Model.
   * **State Change:** The Clerk emits an END_GENERATE event and completely terminates its process, freeing up maximum compute.
 * **Phase 2: Generation (The Main Model)**
   * **Action:** The 26B Main Model takes the "Baton" and begins its Stateful Execution. Unburdened by context prep or verbose parsing, it immediately begins reasoning and streaming code to the UI.
   * *(Note: If the 26B model generates structurally broken JSON during a tool call in this phase, a dedicated programmatic middleware sanitizer intercepts and repairs it mid-stream to ensure the agentic loop is not broken).*
   * **State Change:** Once the task or stream is complete, the Main Model emits an END_GENERATE event and pauses.
 * **Phase 3: Post-Generation / The Archivist (The Clerk)**
   * **Action:** While the user is reviewing the code in the UI, the 4B Clerk boots up a *new* background Micro-Epoch. It summarizes the Phase 2 output, updates the TOON files to reflect the new code state, and persists any new Ground Truth rules discovered during the generation phase.
   * **State Change:** The Clerk emits its final END_GENERATE event and terminates, readying the system for either the next Phase 2 loop or a total Phase 4 Purge. 

3.4 Proactive Context Management (The Graceful Wrap-Up)
To prevent catastrophic generation failure or truncated outputs caused by hitting the hard 32k context limit mid-stream, the orchestration loop employs predictive memory management managed by the Clerk model.
The High Watermark & Velocity: The system maintains a defined "High Watermark" (e.g., 85% of maximum context capacity). During Phase 1 (Pre-Generation), the Clerk model calculates the Main Model's current context size against its Context Velocity (average token growth per turn).
The Intercept & Wrap-Up Directive: If the Clerk predicts that the upcoming Phase 2 generation will breach the hard limit, it intercepts the standard workflow. It injects a high-priority Wrap-Up Directive into Zone 1 of the Main Model's prompt.
Example Directive: *"CRITICAL: Context limit approaching. Finalize the immediate sub-task, do not initiate new architectural changes, and output your final <|tool_call|> to commit current state."*
Seamless Epoch Transition: The 26B model complies, committing its current stable state and cleanly terminating its generation. This triggers Phase 3 (The Archivist) to summarize the truncated Epoch, immediately followed by a Phase 4 Purge. The user experiences a brief "Optimizing Workspace..." UI state, and a fresh Task-Epoch begins without data loss or engine failure.

3.5 Role-Based Tool Routing (mcpx Unified Interface)
To reclaim context budget and prevent agentic drift, the system enforces strict tool-to-persona mapping utilizing the **mcpx** utility.
*   **The Filter:** Instead of injecting all MCP schemas globally, the orchestrator provides a single "universal" MCP connector tool (`mcpx`).
*   **Zero-Schema Bloat:** This replaces thousands of lines of JSON schema with a single entry. The model discovers server-specific tools dynamically via CLI commands (e.g., `mcpx github search-repositories`).
*   **Syntax Enforcement:** The Main Model is strictly instructed to use the syntax `mcpx <server> <tool> --flag=value`. Standard tool calling for Spec CLI and Project Map is deprecated in favor of this unified interface.
*   **Clerk Routing:** In Phase 1, the 4B Clerk identifies the lifecycle phase and determines if the `mcpx` tool should be enabled for the active Agent.
*   **Inheritance:** Subagents automatically inherit the `mcpx` tool if their parent has it, ensuring execution consistency during parallel tasks.
*   **Persona Lock (One-Shot):** To ensure stability during autonomous scaffolding, the agent is pinned to the `plan` persona until the `.spec-tasks-approved` file is detected, preventing premature implementation shifts.
*   **Arbitration Mechanism:** If the Main Model believes it is missing a required tool or capability (even if theoretically available via `mcpx`), it can invoke the `object_to_supervisor` tool.

4. Thinking Mode & Turn Management
The <|think|> protocol is the most powerful feature of the model, but it requires strict lifecycle management at the application layer to function correctly in a multi-turn chat GUI.
Triggering Reasoning: Prepend <|think|> to the start of the system prompt for tasks requiring logic (refactoring, debugging).
Adaptive Thought Depth: Instead of instructing the model to "be concise," inject a System Instruction (SI) dictating the thought depth.
Boilerplate/Syntax Q&A: SI: Thinking Effort = LOW (Reduces token waste by ~20%).
Architecture/Refactoring: SI: Thinking Effort = HIGH.
CRITICAL: Thought-Loop Prevention: When sending conversation history back to the model for the next turn, your application must actively strip the previous <|channel>thought...<channel|> blocks from the payload. Gemma 4 was not trained on historical raw thoughts; leaving them in will cause the model to repeat its reasoning indefinitely.

5. Agentic Output Integrity: Phase 2 Middleware Sanitization
The 26B MoE model is an exceptionally fast and capable reasoning engine, but it has a known, documented vulnerability: it frequently generates broken JSON structures during tool calls. While it consistently makes the correct logical decisions regarding which tool to call and what data to provide, it often fails at the syntax level (e.g., malformed quotes, unclosed braces, or appending trailing conversational garbage).
To ensure the agentic loop remains unbroken and autonomous, the coding assistant must not rely on the 26B model outputting perfect JSON.
Instead, the architecture implements a programmatic Three-Stage Sanitizer Middleware that intercepts the Main Model's output during Phase 2 (Generation), strictly separated from the Phase 1 input-preparation duties.

5.1 The Three-Stage Sanitizer
As the 26B model streams its output, the application layer watches for the native <|tool_call> boundaries. Once the </tool_call> token is emitted (or some mangled variation of it), the middleware intercepts the raw string payload and passes it synchronously through the following pipeline before passing it to the tool executor:
Regex Cleaning (Garbage Collection): * The middleware aggressively strips standard markdown wrappers (e.g., json ... ).
It truncates any trailing conversational garbage or hallucinated text that occurs after the final closing bracket.
It normalizes internal line breaks and trailing whitespace.
Structural Repair (Syntax Resolution): * The cleaned string is passed through a robust, purpose-built JSON-repair library (e.g., jsonrepair or equivalent AST-based repair tool).
This stage automatically balances missing closing brackets, resolves illegal trailing commas, and escapes unescaped quote characters within string values.
Schema Validation (Type Safety): * The structurally sound JSON object is parsed and validated against the local Zod (or equivalent) schema definitions for the requested tool.
This ensures that while the syntax was repaired, the underlying logical types (e.g., expecting an array of strings vs. a single string) remain valid.

5.2 Loop Detection & Supervisor Intervention
Beyond syntactic errors, local models can occasionally enter an autoregressive "infinite loop" or a trial-and-error "hallucination loop" where they repeatedly call a tool without advancing their reasoning.
To counter this, a **Supervisor Middleware** monitors the tool execution pipeline for two specific patterns:
* **The Monitor:** Before executing a tool, the middleware scans the recent message history for:
    * **Identical Loops:** Detecting if the Main Model has called the exact same tool with identical arguments **3 times sequentially**.
    * **Variadic Failure Loops:** Detecting if the Main Model has called the same tool **3 times sequentially** where every attempt resulted in a `tool-error` or failure, even if the arguments varied slightly (e.g., repeatedly trying different capitalizations of a non-existent file path).
* **The Intervention (Side-Model Handoff):** When a loop is detected, the orchestrator intercepts the execution and delegates to the Clerk (`local-side` model). The Clerk is provided with the failing tool and a history of the attempted arguments, instructing it to generate a "stern, technical directive" commanding the Main Model to pivot.
* **The Correction:** This dynamically generated directive is fed back into the Main Model as a forced `SYSTEM INTERVENTION` tool error. By including the specific history of failed attempts in the intervention, the Clerk can provide precise corrections (e.g., "Stop trying variations of requirements.md; it is missing from the directory") that effectively break the hallucination.

5.3 Integration into the Agentic Loop
Because this sanitization happens immediately post-stream (or intercepted mid-stream) at the application layer, the 26B model remains unaware of its own syntax failures.
If the payload is successfully repaired and validated, the application executes the tool and immediately feeds the <|tool_response> back into the Main Model's active Task-Epoch. This prevents the system from wasting valuable compute cycles and context tokens on "self-correction" loops.

5.4 Distinction from Phase 1 "Janitor" Duties
It is critical to distinguish this output middleware from the Clerk model's Phase 1 duties.
Phase 1 (The Clerk): Acts strictly as the Input Janitor. It handles TOON context compression, intent routing, and Ground Truth injection. It prepares the pristine workspace.
Phase 2 (The Middleware): Acts strictly as the Output Sanitizer. It repairs the 26B model's mechanical tool calls in real-time.
(Note: Any successful intervention by this middleware must trigger the json_repaired: true flag in the telemetry logs, as defined in the Telemetry and Validation section, to monitor the baseline syntax failure rate of the underlying MoE).

6. Interaction Modalities
Conversational / Agentic: Standard use of the Thinking Mode, TOON context injection, and the 3-stage JSON sanitizer for tool use.
Autocomplete (FIM): Disable <|think|> entirely. Strip all markdown formatting from the prompt. Rely exclusively on the surrounding code context and the hybrid sliding-window attention mechanism to complete the line or block instantly.

7. Positional Prompt Architecture (Bypassing Attention Bias)
To guarantee ground-truth compliance and absolute context fidelity, the dynamic request must be structurally partitioned to exploit the transformer's U-shaped attention curve. We must anchor critical task data at both the absolute beginning and the absolute end of the request.

Zone 1: The Absolute Beginning (System Prompt)
Purpose: This is the High-Attention Entry Zone. It is used for "Critical Facts" that the model must recall perfectly and immediately.
Implemented as:
Operational Facts: High-priority rules (Context limits, mcpx syntax rules, environment platform) injected as the first lines of the `system` message.
Identity: Persona definition (epochcli) and Agent-specific role.
Implemented as: `operational_facts` array from `SystemPrompt.operationalFacts`.

Zone 2: The History (Middle Section)
Purpose: This is the Attention Blind Spot. It is used for "Static Rules" and "Communication Style" that are less transient.
Implemented as:
Offloaded Initialization: A one-time `assistant` message injected at the start of the message array containing Behavioral Rules, Engineering Tasks, and Style Guides.
Conversation Transcript: The ongoing multi-turn dialogue.

Zone 3: The Reinforcement (Trailing JSON Field)
Purpose: This is the High-Attention Exit Zone. It repeats the critical facts from Zone 1 to ensure they stay "top of mind" right before the model generates its response.
Implemented as:
Trailing Facts: A dedicated `operationalFacts` field at the very end of the JSON request payload (after the message array). This ensures facts are anchored at the bottom of the context window.
Cursor Context: The active line context the user is highlighting.

8. The Correction Persistence Pipeline
To prevent the model from repeating factual or stylistic errors as the conversation context grows, the assistant must utilize an automated correction-to-permanent-fact pipeline.
Detection: The system passively monitors the user's chat input for correction language patterns (e.g., "No, use this variable," or "Don't format it like that").
Extraction: A background process (potentially utilizing the smaller, faster drafting model or running when the engine is idle) extracts the corrected fact.
Persistence: The correction is written to a persistent local file. When doing this, we can also think about the circumstances for which it should be recalled. In the .assistant_rules.toon, we maintain a map of circumstances, and the rules that belongs to that circumstance for fast retrieval. Injection: This rule is then injected directly into Zone 1 and Zone 3 of the system prompt on every subsequent inference call where the circumstance requires it, ensuring it survives cold restarts and conversation dilution. The clerk doesn’t search all the rules, just the circumstances and pulls and injects the rules that belong to that circumstance.

9. Persistent Functional State via mcpx
Rather than treating every prompt as a blank slate, the assistant will maintain a "functional consciousness"—a persistent state that tracks continuity of concerns and intentions across process restarts.
The Spec CLI Bridge: The Spec CLI (accessed via `mcpx`) acts as the source of truth for the workspace focus, tracking the primary and secondary concerns of the active sprint.
Idle Thinking Cycles: When the local inference engine is idle, the system can trigger an autonomous thinking cycle to update the project map TOON data via `mcpx map` or self-critique recent code generations.

10. Scaling Ground Truth Engineering
The Context Communication Rule (Code Snippets)
Trigger: When writing or editing code snippets within your response.
Behaviour: You must use the specific native token `<|">` to bound string literals and code blocks instead of standard markdown backticks.
Example: Do not write `print("Hello")`. You must write `<|">print("Hello")<|">`.

When and Why These Rules Are Helpful
These Ground Truth rules are fundamentally different from traditional prompt engineering. They are helpful because they shift the model from "trying to be helpful" to "operating within strict programmatic boundaries."
Replacing Fluff with Enforcement: Traditional prompts say "You are an expert coder, be precise". This wastes prefill tokens and doesn't actually constrain the model. A Ground Truth rule explicitly forces the model into a behavior, like the Epistemic Integrity rule, which prevents confident hallucination by forcing the model to explicitly state if it is guessing.
Mitigating Known Model Flaws: The Gemma 26B model has a known flaw where it generates broken JSON. Instead of hoping it gets it right, your rule dictates exactly how the output should look, and your application layer (the Clerk) cleans up the rest using the Three-Stage Sanitizer.
Emergent Self-Correction: As observed in the ATLAS paper, when models are given these strict rules, they actually begin to unpromptedly detect and correct their own errors inline during the response generation. 

The Clerk as the "Rule Router"
In your Pre-Generation phase, the 4B Clerk can run a lightning-fast classification on the user's prompt. 
If the user asks "Can you refactor this class?", the Clerk injects the *Reasoning Discipline* rules and sets the System Instruction to `Thinking Effort = HIGH`. The Clerk also uses `mcpx <server> --help` to dynamically discover tool schemas when needed.
The ground (via `mcpx`) helps to populate the .assistant_rules.toon file that the side model will use to place the operational facts in zone 1 and 3 and while placing behavioural rule packs in zone 2.

The Arbitration Protocol (Escalation)
Trigger: When the Main Model is blocked by missing tools or believes its assigned persona is incorrect.
Behaviour: The model MUST invoke `object_to_supervisor` with a technical justification and the requested persona. This triggers a review by the Conversational Supervisor.
Example: `object_to_supervisor({ reason: "I need pm_plan to analyze dependencies before coding", requestedAgent: "plan" })`
Outcome: Ensures the superior reasoning of the 26B model can overrule the 4B pruner in complex edge cases.

11. Telemetry and Architectural Validation
To prove the efficacy of the Zero-Fluff optimizations, TOON compression, and dual-model architecture, the system enforces strict observability requirements. All LLM session activity must be piped through a robust logging interceptor capable of validating the sequential state-machine.

11.1 Independent Lifecycle Tracking
Because the Main and Clerk models operate on different epoch lifecycles, telemetry logs must decouple their tracking IDs. Every execution event must capture:
mainEpochId: A persistent identifier for the ongoing 26B task (e.g., task-refactor-auth).
clerkMicroEpochId: A unique identifier generated per 4B interaction (e.g., req-1a2b3c).

11.2 Required Metrics and Validation
The prompt-logging-utility must capture and automatically validate the following architectural pillars:
Strict Overlap Detection: The log parser must run a deterministic state-machine check to ensure local-main and local-side are never in a START_GENERATE state simultaneously.
Context Velocity Tracking: Logs must track promptTokens delta per turn on the local-main model to mathematically prove that offloading heavy context-prep to the local-side model extends the lifespan (turn-count) of the Main model's Task-Epoch before a cold restart is required.
Time-to-First-Token (TTFT): Captured in milliseconds to prove the "Zero-Fluff" prompt engineering successfully reduces prefill latency.
Sanitization Success Rate: Phase 2 logs (associated with local-main) must emit a json_repaired: boolean flag to track how frequently the programmatic middleware successfully intercepts and repairs structural tool-call defects mid-stream from the 26B MoE output.

11.3 Logging Data Schema
The interceptor must emit standard JSON payloads matching the following schema:
TypeScript
interface EnhancedModelExecutionEvent {
  timestamp: number;
  event: "START_GENERATE" | "END_GENERATE" | "ERROR";
  providerId: "local-main" | "local-side";
  phase: "Phase 1: Pre-Gen" | "Phase 2: Gen" | "Phase 3: Post-Gen";
  activeAgent: "build" | "plan" | "explore"; 
  toolCount: number; // Number of tools injected after filtering
  
  // Independent Lifecycle Tracking
  mainEpochId: string;
  clerkMicroEpochId?: string;
  
  metrics: {
    promptTokens: number;
    completionTokens?: number;
    ttftMs?: number;
    toolsCalled?: number;
    json_repaired?: boolean;     // Flagged true if Phase 2 middleware intervened to fix syntax
    wrap_up_triggered?: boolean; // Flagged true when Phase 1 injects the Context Wrap-Up Directive
  };
  
  // Preserves Zone 1 and Zone 3 prompt boundaries; safely truncates Zone 2 if large.
  payload?: ZoneStructuredPayload; 
  tools?: any[]; // Full tool definitions array
}


11.4 Boundary Identification for Payload Truncation
To safely truncate large prompts in the logs without breaking JSON validity or deleting critical Ground Truth rules, the logging interceptor must not attempt to parse and slice a single, monolithic string.
Instead, the prompt builder must pass a ZoneStructuredPayload object to the logging interceptor before final stringification to the LLM.
TypeScript
type ZoneStructuredPayload = {
  zone1_critical_rules: string[];
  zone2_context_files: string[];
  zone3_active_cursor: string[];
}

Truncation Logic: When the promptTokens exceed a predefined threshold (e.g., > 10,000 tokens), the logging utility explicitly targets the zone2_context_files key. It slices the string and appends a ...[ZONE 2 TRUNCATED FOR LOGGING] marker. By structuring the payload this way prior to log committal, the system guarantees that Zone 1 (System Directives) and Zone 3 (Immediate Task) are 100% preserved in the telemetry for debugging purposes.
