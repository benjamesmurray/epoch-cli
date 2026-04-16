# Positional Prompt Architecture

The Epoch CLI utilizes a **Positional Prompt Architecture** to optimize model performance by strategically placing rules and context based on the transformer's "U-shaped" attention curve. This ensures that critical constraints and project-specific anchors are placed where the model pays the most attention (the beginning and the end of the prompt).

## 1. Prompt Zones

The prompt is divided into four distinct zones, each served by the **System Role** to maintain structural integrity and maximize authority.

### **Zone 1: The Head (System Message 1)**
*   **Purpose:** Immediate context, immutable engineering standards, and **Thinking Mode control**.
*   **Content:**
    *   **Thinking Control:** For supported models (e.g., Gemma-4), the `<|think|>` control token is injected here.
    *   **Persona:** Standardized identity as "Epoch CLI, an agentic engineer."
    *   **Operational Facts:** Immutable truths about the environment (e.g., "The environment context limit is 32K tokens").
    *   **Technical Stack:** Extracted via Ground Truth (e.g., Language: TypeScript, Framework: Vitest).
    *   **Current Phase:** Injected via the Spec CLI (e.g., `[PLAN]` or `[BUILD]`).
    *   **Effort Instruction:** Explicit directive (e.g., `THINKING EFFORT: HIGH/LOW`) based on Clerk classification.

### **Zone 2: The Body (System Message 2)**
*   **Purpose:** Behavioral discipline and general interaction context.
*   **Content:**
    *   **Behavioral Rules:** Specific "Trigger/Behaviour/Example" packs (e.g., Suppressing conversational filler, handling non-coding questions).
    *   **General Context:** High-level project state or clerk-selected rule packs.
*   **Header:** `=== BEHAVIORAL RULES & GENERAL CONTEXT ===`.

### **Zone 3: The Tail (System Message 3)**
*   **Purpose:** Project-specific anchors and high-attention technical rules.
*   **Content:**
    *   **Project-Specific Rules:** Custom rules extracted from the codebase's specific conventions (e.g., stack conventions).
    *   **Cursor Context:** The active file, line number, and code fragment the user is currently focused on.
*   **Header:** `=== PROJECT-SPECIFIC RULES & CURSOR CONTEXT ===`.

### **Zone 4: The Guidelines (System Message 4)**
*   **Purpose:** High-priority project intent and style guidelines.
*   **Content:**
    *   **Extracted Guidelines:** Full or strategic snippets from `AGENTS.md` or `.cursorrules`.
*   **Header:** `=== PROJECT GUIDELINES (AGENTS.md) ===`.

## 2. Internal State Check (User Role)

To maintain strict User/Assistant alternation and ensure compatibility with "Thinking" models (which forbid assistant pre-filling), the **Internal State Check** is injected as a hidden instruction within the final **User** message.

*   **Placement:** Appended to the end of the user's prompt (or merged into the user message role).
*   **Content:**
    *   **Thinking Mode:** Explicit directive for adaptive thought efficiency (e.g. "LOW thinking active").
    *   **Current Strategy:** Immediate next-step priorities (e.g., "mcpx pm_query first").
    *   **Token Budget:** Reminder of the active context window constraints.

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

## 4. Ground Truth Integration

The `ground-truth-cli` MCP server is the primary source of truth for project-specific rules (`.Model_rules.toon`).

### **Dynamic Session Initiation**
To ensure a "zero-config" experience, the system performs an automatic scan if rules are missing:
1.  **Check:** `LLM.stream` calls `gt_status`.
2.  **Detection:** If the response is empty, indicates an `IDLE` state, or lacks `ZONE` markers, the system assumes no rules exist for the current workspace.
3.  **Action:** It immediately triggers `gt_exec scan .` to synthesize a new `.Model_rules.toon` file.
4.  **Result:** The very first prompt in a clean environment (like a fresh Docker container) is correctly populated with synthesized rules.

### **Rule Extraction, Synthesis, & Deduplication**
`LLM.stream` parses context and rules using a prioritized extraction strategy:
*   **Zone 1 & 2:** Standard regex-based extraction from `.Model_rules.toon` into the internal prompt payload.
*   **Zone 3 Synthesis & Deduplication:** The `ground-truth-cli` dynamically detects the project's framework/language (e.g., via `package.json`) and conditionally synthesizes a "Stack Conventions" rule. If multiple `ZONE 3` blocks are found in the TOON file (e.g., due to template merging or stale baseline files), the system **prioritizes the last block found**. This ensures that the most recent dynamically synthesized rules take precedence over static defaults.
*   **Zone 4 Extraction:** To guarantee guidelines are always present regardless of Ground Truth status, `AGENTS.md` and `.cursorrules` are explicitly fetched via the `Instruction` service and injected as a dedicated system message, bypassing the TOON rules entirely.

## 5. Benefits of this Architecture

1.  **Maximum Authority:** Using `system` messages for all rule zones ensures the model treats these constraints with the highest priority.
2.  **Compatibility:** Removing the `assistant` pre-fill ensures full compatibility with models that have `thinking` or `reasoning` enabled (e.g., DeepSeek-R1, Gemini-2.0-Flash-Thinking).
3.  **Context Efficiency:** The segmented structure and Clerk-driven effort classification ensure token usage is optimized for task complexity.
4.  **High Fidelity:** Placing specific technical rules (Zone 3) and style guidelines (Zone 4) in the system role close to the end of the system block ensures they are fresh in the model's focus.
