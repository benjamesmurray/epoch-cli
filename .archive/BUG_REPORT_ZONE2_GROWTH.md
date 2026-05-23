# Bug Report: Exponential Growth of Zone 2 (Context Overflow)

**Component:** Post-Generation Worker / Ground Truth Manager
**Location:** `packages/epochcli/src/session/worker.ts`

## Description
During long-running E2E tests (e.g., `iot-controller-full-stack`), the agent session crashes with `AI_APICallError: Context size has been exceeded`. 

Analysis of the logs reveals the root cause is the exponential, unchecked growth of **Zone 2: Behavioral Rules** within the system prompt.

The `PostGenerationWorker` attempts to extract architectural facts from the recent chat history and writes them to `.assistant_rules.toon`. However, the current implementation blindly **appends** the extracted text without any deduplication:

```typescript
// packages/epochcli/src/session/worker.ts
const existing = yield* Effect.promise(() => fsNode.readFile(rulesPath, "utf-8").catch(() => ""))
yield* Effect.promise(() =>
  fsNode.writeFile(rulesPath, `${existing}\n\n# Auto-extracted Circumstances:\n${extractionRes.text}`),
)
```

Because the context (and the agent's "Thinking" blocks) constantly refer back to core constraints, the LLM extractor repeatedly extracts the same or slightly paraphrased rules (e.g., "MUST bind to 0.0.0.0 on port 8080") on almost every turn. 

After 20+ turns, `.assistant_rules.toon` accumulates dozens of redundant `rules[fact_id, trigger, behaviour]` blocks, ballooning to over 15,000 tokens and eventually causing the LLM provider to reject the request due to context exhaustion.

## Steps to Reproduce
1. Start an autonomous session (`--yolo`) on a project with strict initialization constraints (e.g., the IoT Controller e2e test).
2. Allow the session to run for 15-20 turns.
3. Monitor `.assistant_rules.toon`. You will see blocks like `# Auto-extracted Circumstances:` appended repeatedly with duplicate facts.
4. The token count logged by `[OverflowCheck]` will spike until the session crashes.

## Expected Behavior
The extraction and persistence of architectural facts MUST be idempotent and compacted.

## Recommended Fix
1. **Remove blind appending in Epoch CLI:** Stop appending raw text in `worker.ts`.
2. **Delegate to Ground Truth MCP Server:** The worker should call a tool on the `ground` MCP server (e.g., `ground_upsert_facts`) with the newly extracted TOON.
3. **Semantic Deduplication:** The `ground` server should parse the existing TOON file, semantically merge or deduplicate the incoming rules, and rewrite a compacted, flat list of unique rules to `.assistant_rules.toon`. 
*(Alternatively, feed the `existing` rules into the extractor's prompt and ask it to only return net-new rules, though this is less reliable than structured merging).*