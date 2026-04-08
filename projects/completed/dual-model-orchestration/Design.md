# Dual-Model Orchestration Design

## Overview
This feature introduces a sequential dual-model architecture designed to maximize throughput and context efficiency. A small 4B "Clerk" model handles pre-generation (context compression, sanitization) and post-generation (persistence, summarization) tasks. The 26B "Main" model is exclusively reserved for the primary code/text generation. This "Baton Pass" loop ensures models do not run concurrently, optimizing GPU memory and compute, while maintaining ground-truth strictness through Positional Prompt Architecture.

## Architecture
- **Phase 1: Pre-Generation (Clerk / `local-side`)**
  - **Sanitization:** Cleans malformed JSON from previous tool calls.
  - **Context Compression:** Converts large JSON inputs (e.g., file trees, linter logs) into compressed TOON (Token-Oriented Object Notation).
  - **Rule Routing:** Injects dynamic behavioral rules into Zone 2 based on intent classification.
- **Phase 2: Generation (Main / `local-main`)**
  - Uses the 3-Zone Positional Prompt Architecture to focus attention:
    - **Zone 1:** Immutable operational facts & task context (TOON).
    - **Zone 2:** Behavioral Rule Packs.
    - **Zone 3:** Local cursor context and specific task query.
  - **Native Token Parsing:** Intercepts `<|">` and `<|think|>` tokens to prevent UI breakage and handle reasoning blocks appropriately.
  - Streams the response back to the user interface.
- **Phase 3: Post-Generation (Clerk / `local-side`)**
  - **Persistence Extraction:** Extracts confirmed architectural facts or user-provided corrections to the `.assistant_rules.toon` or Spec CLI context.
  - **Epoch Summarization:** Generates task-epoch handoff summaries.

## Components and Interfaces
- `ConfigManager`: Manages the dual-provider configuration from `.epochcli/epochcli.jsonc`.
- `EngineConfigValidator`: Pre-flight check running on startup to ensure context limits and KV cache precision are properly configured on the engines.
- `EventLoopOrchestrator`: Controls the asynchronous handoff between `local-side` and `local-main` in `packages/epochcli/src/session/llm.ts`.
- `ToonEncoder`: Serializer utility that compresses JSON inputs into TOON format.
- `NativeTokenParser`: Stream parser intercepting native bounding and thinking tokens for proper markdown conversion.
- `OutputInterceptor`: Middleware that catches broken JSON tool calls from the Main model and delegates repair to the Clerk.
- `LogParserTool`: A utility function to parse logs generated in `/home/llm/utils/launch/logs` and verify the `Phase 1 -> Phase 2 -> Phase 3` sequential flow.
- `SpecCLI Integration`: Leverages MCP Server to retrieve and update the 'task-epoch' state (e.g. programmatically wiping chat history, marking tasks complete, fetching fresh focus).

## Data Models
- **TOON Payload Structure:** YAML-like indentation with CSV rows replacing heavy JSON keys.
- **Model Configuration Schema:** Allows binding of the 'Clerk' and 'Main' roles to specific local providers.

## Error Handling
- **Generation Failures (Self-Correction):** If the Main model produces malformed tool JSON, the `OutputInterceptor` automatically passes the broken output to the `local-side` model to repair before the user sees an error.
- **Timeouts & Race Conditions:** Background Phase 3 Post-Generation tasks utilize `AbortController` cancellation tokens. If a user submitts a new prompt, the background task is instantly aborted or safely resolved without locking the `local-side` port.

## Testing Strategy
- Use the implemented `LogParserTool` to programmatically assert that the timestamps of `local-side` execution and `local-main` execution never overlap in `/home/llm/utils/launch/logs`.
- Test that TOON context is properly parsed and injected.
- Verify `mcp-spec-cli` state correctly resets context between tasks.
- Simulate JSON tool generation failures to verify the `OutputInterceptor` recovery loop.
