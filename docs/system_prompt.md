# Positional Prompt Architecture

The Epoch CLI utilizes a **Positional Prompt Architecture** to optimize model performance by strategically placing rules and context based on the transformer's "U-shaped" attention curve. This ensures that critical constraints and project-specific anchors are placed where the model pays the most attention (the beginning and the end of the prompt).

## 1. Prompt Zones

The prompt is divided into four distinct zones, each served by the **System Role** to maintain structural integrity and maximize authority.

### **Zone 1: The Head (System Message 1)**
*   **Purpose:** Immediate context, immutable engineering standards, and **Thinking Mode control**.
*   **Content:**
    *   **Thinking Control:** For supported models, the `<|think|>` control token is injected here.
    *   **Persona:** Standardized identity as "Epoch CLI, a pragmatic software engineer."
    *   **Operational Facts:** Immutable truths about the environment (e.g., "The environment context limit is 32K tokens").
    *   **Current Phase:** Injected via the Spec CLI (e.g., `[PLAN]` or `[BUILD]`).
    *   **Project Map:** A high-density reference to the map in the `<env>` block.
    *   **Effort Instruction:** Explicit directive (e.g., `THINKING EFFORT: HIGH/LOW`) based on Clerk classification.
    *   **Silent Guardrails:** Behavioral constraints (YOLO, file-by-file) are enforced by the middleware/supervisor. YOLO mode nudges are **silent**; the engine auto-continues the loop after text responses without adding system text to the history, minimizing token overhead.
*   **Header:** `=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===`.

### **Zone 2: The Body (System Message 2)**
*   **Purpose:** Behavioral discipline and tool operational guidance.
*   **Content:**
    *   **Tool Operational Guide:** Centralized, high-density instructions for tool usage (e.g., "Prefer mcpx over glob", "Read before edit").
    *   **Behavioral Rules:** Specific "Trigger/Behaviour/Example" packs.
*   **Header:** `=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===`.

### **Zone 3: The Tail (System Message 3)**
*   **Purpose:** Project-specific anchors and high-attention technical rules.
*   **Content:**
    *   **Project-Specific Rules:** Custom rules extracted from the codebase's specific conventions (e.g., stack conventions).
    *   **Cursor Context:** The active file, line number, and code fragment the user is currently focused on.
*   **Header:** `=== ZONE 3: PROJECT-SPECIFIC RULES & CURSOR CONTEXT ===`.

### **Zone 4: The Guidelines (System Message 4)**
*   **Purpose:** High-priority project intent and style guidelines.
*   **Content:**
    *   **Extracted Guidelines:** Full or strategic snippets from `AGENTS.md` or `.cursorrules`.
*   **Header:** `=== ZONE 4: PROJECT GUIDELINES (AGENTS.md) ===`.

## 2. Internal State Check (User Role)

To maintain strict User/Assistant alternation and ensure compatibility with "Thinking" models (which forbid assistant pre-filling), the **Internal State Check** is injected as a hidden instruction within the final **User** message.

*   **Placement:** Appended to the end of the user's prompt.
*   **Content:** A high-density status string:
    *   `[STATE] Phase: [PHASE] | Thought: [high/low] | Budget: [LIMIT]K`
*   **Purpose:** Provides the model with its operational constraints and active phase without the overhead of natural language explanations.

## 3. Adaptive Thinking & Reasoning (Clerk-Driven)

The system utilizes a dual-model orchestration where a smaller "Clerk" model (local-side) supervises the turn.

*   **Intent Classification:** The Clerk analyzes the conversation transcript to classify the complexity of the task.
*   **Effort Levels:**
    *   **LOW**: Selected for simple questions, boilerplate, or status checks. This reduces reasoning tokens by ~20%, improving latency.
    *   **HIGH**: Selected for complex refactoring, multi-file changes, or deep debugging.
*   **Model Integration:** This classification is propagated to the main model via:
    1.  **System Tokens**: Injecting `<|think|>` for native Gemma-4 compatibility.
    2.  **Explicit Instructions**: Appending "THINKING EFFORT: [LEVEL]" to Zone 1.
    3.  **SDK Options**: Passing `thinkingLevel` or `reasoningEffort` to providers (OpenAI, Google, etc.).
*   **Stagnation Nudges:** To prevent execution loops and ensure steady progress, the system monitors the number of consecutive turns spent in a specific phase.
    *   **PLAN Phase:** If the agent spends 8+ turns drafting without advancing, a supervisor note is injected into Zone 1 reminding it to run `sc_approve`.
    *   **BUILD Phase:** If the agent spends 5+ turns without executing a mutating action (`write` or `edit`), a stern nudge is injected demanding immediate implementation, breaking potential orientation loops.

## 4. Ground Truth Integration

The `ground` MCP server is the primary source of truth for project-specific rules (`.assistant_rules.toon`).

### **Project Map Integration**
The system seamlessly integrates architectural awareness by monitoring file changes via a global event bus (`packages/epochcli/src/bus/index.ts`).
1.  **Detection:** Upon any file edit, the event bus triggers `mcpx-rust map pm_init` to refresh the index.
2.  **Export:** Immediately following initialization, it executes `pm_query --path .` to retrieve a fresh, localized map.
3.  **Storage:** The output is saved to `.project-map/latest/map.toon`.
4.  **Injection:** The static file path is injected into the `<env>` block of Zone 1, providing the model with real-time architectural context without requiring a dynamic, inline MCP call during the prompt building phase.

### **Dynamic Session Initiation (Zero-Config)**
To ensure a "zero-config" experience, the system performs an automatic scan if rules are missing or the environment is fresh:
1.  **Check:** `LLM.stream` proactively calls `gt_status` via the Ground MCP server.
2.  **Detection:** If the response is empty, indicates an `IDLE` state, or lacks language detection (e.g., `Language: None`), the system assumes no rules exist.
3.  **Action:** It immediately triggers `gt_exec scan .` to synthesize a new `.assistant_rules.toon` file.
4.  **Result:** The very first prompt in a clean environment (like a fresh Docker container) is correctly populated with synthesized, zoned rules.

### **Rule Extraction, Synthesis, & Decoupling**
`LLM.stream` and the `PostGenerationWorker` manage rules using a tiered extraction strategy to preserve baseline integrity while preventing context overflow:
*   **Zone 1 & 3 (Baseline Facts):** Standard regex-based extraction from the static baseline `.assistant_rules.toon` file. The parser supports both `ZONE 1` and `ZONE 1 & 3` headers, extracting high-priority operational facts (e.g., context limits) into the prompt head and project-specific rules into the tail.
*   **Zone 2 (Behavioral Packs):** Dynamic injection of rule packs based on session intent (e.g., `debugging_pack`).
*   **Zone 2 (Global History Rules):** To prevent corruption of the baseline rules and stop exponential context bloat, the CLI utilizes an end-of-epoch semantic merge. During an epoch transition, the `local-side` Clerk model extracts concrete architectural rules from the session's chat history. It then **semantically merges** these net-new rules with the existing rules located in `.history/project_rules.toon`.
*   **Decoupled Integration:** The main prompt builder loads these compacted rules from the Global History Suite (`.history/project_rules.toon`) and injects them into Zone 2. The baseline `.assistant_rules.toon` remains strictly read-only for the Clerk, ensuring static codebase conventions are never overwritten by transient conversational shifts.
*   **Zone 4 Extraction:** `AGENTS.md` and `.cursorrules` are explicitly fetched via the `Instruction` service and injected as a dedicated system message, bypassing the TOON rules entirely.

## 5. Tool Array Management

To prevent context window exhaustion (especially in strict environments like 16k token windows) and reduce fixed token overhead, the tools array is aggressively pruned and optimized before being sent to the model:

*   **Dynamic Tool Pruning:** Tools that are unavailable or unnecessary for the current workspace are removed entirely from the payload. For example, if no custom skills are detected (`Skill.available`), the `skill` tool is dynamically filtered out before the request is made.
*   **Internal Fallback Filtering:** Internal system tools (like the `invalid` tool, which is used locally by the middleware to gracefully catch schema parsing errors) are stripped from the AI SDK payload so their schemas do not consume valuable context tokens.
*   **Strictly Mechanical Descriptions (Schema-Only Doctrine):** We take a decisive approach to streamlining tool schemas. Verbose usage examples and broad behavioral constraints are completely excluded. Tool schemas are treated strictly as mechanical API references, relying on the central System Prompt to dictate agent behavior. This "Schema-Only Doctrine" target is ~3,000 tokens for the entire array.

## 6. Context Budgeting & Utilization

To maximize the number of turns per epoch, the CLI employs aggressive context management:

*   **Tightened Safety Margin:** The `safetyMargin` (buffer reserved for next output) is capped at **1024 tokens**. This is made possible by the CLI's **1.5x Paranoia Multiplier** in the tokenizer, which already provides a substantial implicit buffer.
*   **Increased Watermark:** The `HIGH_WATERMARK` is set to **0.98** (98%). The agent is encouraged to continue implementation until it has nearly filled its usable space before receiving a "wrap-up" directive.
*   **Continuity Condensation:** Project Map outputs in continuity reports are limited to a **depth of 2**, preventing massive directory trees from bloating the base load of the next epoch.

## 7. Benefits of this Architecture

1.  **Maximum Authority:** Using `system` messages for all rule zones ensures the model treats these constraints with the highest priority.
2.  **Compatibility:** Removing the `assistant` pre-fill ensures full compatibility with models that have `thinking` or `reasoning` enabled (e.g., DeepSeek-R1, Gemini-2.0-Flash-Thinking).
3.  **Context Efficiency:** The segmented structure and Clerk-driven effort classification ensure token usage is optimized for task complexity.
4.  **High Fidelity:** Placing specific technical rules (Zone 3) and style guidelines (Zone 4) in the system role close to the end of the system block ensures they are fresh in the model's focus.
