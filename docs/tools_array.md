# Tool Schema Strategy: The Schema-Only Doctrine

To operate effectively within a **32k context window**, Epoch CLI employs a "Schema-Only Doctrine" for its tool definitions. This strategy minimizes Turn 0 context bloat by separating tool mechanics from behavioral instructions.

## 1. Core Principles

### A. Minimalist Descriptions
Tool descriptions (found in `*.txt` files in `packages/epochcli/src/tool/`) are limited to 1-2 lines of core functional purpose. They must NOT contain:
- Usage advice (e.g., "Use this when...")
- Tool preferences (e.g., "Prefer mcpx over glob")
- Behavioral constraints (e.g., "Never create README files")
- Verbose examples.

### B. Concise Parameter Definitions
Zod `.describe()` calls in the `.ts` tool implementations are stripped of redundant formatting instructions. They should only describe the data type and purpose in the fewest words possible.

### C. Instruction Centralization
All high-level guidance, best practices, and "how-to-use" logic are centralized in the **System Prompt** or specialized markdown instructions (e.g., `AGENTS.md`). This prevents the model from reading the same advice 12 times (once for each tool schema).

### D. Unified Interface Deduplication
When the unified `mcpx` tool is enabled, individual MCP tool schemas (e.g., `sc_init`, `pm_status`) MUST be excluded from the tool array. The `mcpx` tool acts as a single, generic entry point. Redundant injection of individual MCP schemas bypasses the Schema-Only Doctrine and can leak up to 15k+ tokens of OpenAPI-derived definitions into the prompt.

## 2. Token Footprint Benchmarks

The following targets were established after the May 2026 refinement:

| Component | Baseline (Pre-Refinement) | Refined Target (Phase 1) |
| :--- | :--- | :--- |
| **Tool Schemas (12 tools)** | ~15,000 tokens* | **~3,000 tokens** |
| **Total Turn 0 Payload** | ~60 KB | **~12.4 KB** |

*\*Note: High baseline was due to redundant OpenAPI schema injection in `orchestrator.ts`.*

## 3. Technical Note: Tokenizer Calibration
As of May 2026, the local `llama.cpp` tokenizer used for `OverflowCheck` is known to be over-sensitive, reporting token counts ~6x higher than actual industry standards (estimating ~1.5 tokens/char vs the standard ~0.25). 

- **Healthy Character Count**: ~12,000 to 15,000 characters for Turn 0.
- **Inflated Report**: May show as 18,000+ tokens despite being within the 12.4 KB physical limit.

## 4. Refined Tool Examples

### `mcpx`
- **Goal:** Provide a generic interface without explaining the underlying CLI mapping.
- **Refinement:** "Execute an MCP tool (e.g. server='spec', tool='sc_init')."

### `task`
- **Goal:** Launch subagents without embedding their full manuals.
- **Refinement:** "Launch or resume a subagent. Available agents: {agents}."

### `write` / `edit`
- **Goal:** Define the modification mechanism only.
- **Refinement:** "Writes content to a file. Overwrites existing files."

## 4. Maintenance Guidelines
When adding new tools:
1. Keep the `.txt` description to a single sentence.
2. Use brief parameter descriptions.
3. If the tool requires specific behavioral guardrails, add them to the **System Prompt** templates instead of the tool definition.
