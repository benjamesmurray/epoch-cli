import { Log } from "../util/log"
import { Effect } from "effect"
import { Provider } from "@/provider/provider"
import { generateText } from "ai"
import { MCP } from "@/mcp/index"
import { Config } from "@/config/config"
import fsNode from "fs/promises"
import { SessionAnalyzer } from "@/util/session-analyzer"
import { Instance } from "../project/instance"
import path from "path"
import { Glob } from "../util/glob"

const log = Log.create({ service: "post-generation-worker" })

export namespace PostGenerationWorker {
  export const execute = Effect.fn("PostGenerationWorker.execute")(function* (input: {
    sessionID: string
    chatHistory: any[]
    abortSignal: AbortSignal
    isTransition?: boolean
    isFinal?: boolean
  }) {
    // Give the primary model call a moment to finish its connection before Clerk starts
    yield* Effect.sleep("1 seconds")

    if (input.abortSignal.aborted) {
      log.info("Post-generation task aborted before starting")
      return
    }

    try {
      const sideModel = yield* Effect.promise(() => Provider.getSideModel())

      if (!sideModel) {
        log.debug("No local-side model configured. Skipping post-generation tasks.")
        return
      }

      log.info("Executing Phase 3: Post-Generation on local-side Clerk")

      const sideLanguage = yield* Effect.promise(() => Provider.getLanguage(sideModel))

      // Add a small artificial delay to prevent hitting local proxy rate limits
      // when calls are made back-to-back sequentially
      yield* Effect.sleep("1 seconds")

      // Check cancellation token before calling LLM            if (input.abortSignal.aborted) return

      // 1. Persistence Extraction
      log.debug("Extracting architectural facts and user corrections", { model: sideLanguage.modelId })
      let extractionRes
      try {
        extractionRes = yield* Effect.promise(() =>
          generateText({
            model: sideLanguage,
            system:
              'You are an architectural fact extractor. Analyze the provided chat history. Extract ONLY concrete, universally applicable architectural rules, stylistic corrections, or user preferences established in this session. Output them in TOON format exactly like this:\nrules[fact_id, trigger, behaviour]:\n  fact_01, "When [condition/trigger]", "[The required behavior or preference]"\n\nIf no concrete rules or corrections are found, output \'NONE\'.',
            prompt: `Chat History:\n${JSON.stringify(input.chatHistory.slice(-5))}`,
            abortSignal: input.abortSignal,
          }),
        )
        log.debug("Persistence extraction complete", { text: extractionRes.text.slice(0, 100) })
      } catch (e) {
        log.error("Persistence extraction failed", { error: String(e), model: sideLanguage.modelId })
        throw e
      }

      if (input.abortSignal.aborted) return

      if (extractionRes.text.trim() !== "NONE" && extractionRes.text.trim().length > 0) {
        log.info("Facts extracted, writing to .assistant_rules.toon")
        try {
          const rulesPath = path.join(Instance.directory, ".assistant_rules.toon")
          const existing = yield* Effect.promise(() => fsNode.readFile(rulesPath, "utf-8").catch(() => ""))
          yield* Effect.promise(() =>
            fsNode.writeFile(rulesPath, `${existing}\n\n# Auto-extracted Circumstances:\n${extractionRes.text}`),
          )
          log.debug(`Wrote facts to ${rulesPath}`)
        } catch (e) {
          log.warn("Failed to write to .assistant_rules.toon", { error: String(e) })
        }
      }

      // 2. Generate Epoch Continuity Report
      log.debug("Generating Epoch Continuity Report", { model: sideLanguage.modelId })
      const analysis = yield* Effect.promise(() => SessionAnalyzer.analyze(input.sessionID, input.chatHistory, Instance.directory))

      // Fetch Project Map status if available
      let mapStatus = "NOT_AVAILABLE"
      try {
        const mcpClientsRecord = yield* Effect.promise(() => MCP.clients())
        const mapCli = mcpClientsRecord["map"] as any
        if (mapCli) {
          const res = yield* Effect.promise(() => mapCli.callTool({ name: "pm_status", arguments: {} }))
          mapStatus = (res as any).output || "HEALTHY"
        }
      } catch (e) {
        log.debug("Failed to fetch map status for continuity report", { error: String(e) })
      }

      // 2.1 Automated Project Context Discovery
      let activeProjectContext = "NONE_FOUND"
      try {
        const activeDir = path.join(Instance.directory, "projects", "active")
        const stats = yield* Effect.promise(() => fsNode.stat(activeDir).catch(() => null))
        if (stats?.isDirectory()) {
          const entries = yield* Effect.promise(() => fsNode.readdir(activeDir))
          if (entries.length > 0) {
            const entryStats = yield* Effect.promise(() =>
              Promise.all(
                entries.map(async (e) => ({
                  name: e,
                  stat: await fsNode.stat(path.join(activeDir, e)),
                })),
              ),
            )
            const latest = entryStats
              .filter((e) => e.stat.isDirectory())
              .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)[0]

            if (latest) {
              activeProjectContext = `FEATURE_ID: ${latest.name} (Last Modified: ${new Date(latest.stat.mtimeMs).toISOString()})`
            }
          }
        }

        const lastUsedPath = path.join(Instance.directory, ".spec_last_used")
        const lastUsed = yield* Effect.promise(() => fsNode.readFile(lastUsedPath, "utf-8").catch(() => null))
        if (lastUsed) {
          activeProjectContext += `\nSPEC_LAST_USED: ${lastUsed.trim()}`
        }
      } catch (e) {
        log.debug("Context discovery failed", { error: String(e) })
      }

      const agentsPath = path.join(Instance.directory, "AGENTS.md")
      const agentsContent = yield* Effect.promise(() => fsNode.readFile(agentsPath, "utf-8").catch(() => ""))

      const analysisPromptRaw = [
        "You are an expert technical supervisor generating an Epoch Continuity Report.",
        "This report is a succinct executive summary of the project state. Technical specificity is paramount, but brevity is required for the executive summary sections.",
        "You MUST output the report in strict TOON (Token-Oriented Object Notation) format.",
        "Do NOT use markdown formatting. Use YAML-like indentation with clear key-value pairs.",
        "Structure your output exactly like this:",
        "epoch_continuity:",
        "  historical_references:",
        "    - topic: 'Discarded Approaches & Deep Context'",
        "      file: '.history/intent.toon'",
        "      trigger: 'Read this before starting a new complex implementation to avoid repeating mistakes.'",
        "    - topic: 'Full Tool History & Output Logs'",
        "      file: '.history/timeline.toon'",
        "      trigger: 'Read this if you need to see exactly what commands were run and their raw output.'",
        "    - topic: 'Detailed Error Logs'",
        "      file: '.history/errors.toon'",
        "      trigger: 'Read this if you are trying to fix a persistent bug that spanned epochs.'",
        "    - topic: 'Registry of Touched Files'",
        "      file: '.history/files.toon'",
        "      trigger: 'Read this if you need to know which files were modified in previous epochs.'",
        input.isTransition
          ? "    - topic: 'Immediate Working Memory & Interrupted Thoughts'\n      file: '.history/interrupted_state.toon'\n      trigger: 'READ THIS FIRST. You were interrupted by a context limit right before executing a tool. This contains your exact mental drafts and intentions.'"
          : "",
        "  workflow_map:",
        "    pipeline_step: 'Step (1-5)'",
        "    phase: 'Current Spec Phase (e.g., Requirements, Design, Build)'",
        "    status: 'Ready / Blocked / In-Progress'",
        "  project_map:",
        "    status: 'Healthy/Stale/Uninitialized'",
        "    context: 'Brief summary of what the map currently tracks (e.g., \"8 symbols in core/\")'",
        "  executive_intent:",
        "    high_level_architecture: 'The overarching mental model or design pattern the agent was constructing.'",
        "    immediate_conclusions: ['Final takeaways that guide the next action']",
        "  technical_progress:",
        "    completed_artifacts: ['files finalized with brief details on added symbols']",
        "    blocked_drafts: ['files requiring attention, with a brief status of why they are blocked']",
        "  function_activity: 'Literal trace of the last 2-3 tool calls'",
        "  next_action:",
        "    tool: 'tool_name'",
        "    rationale: 'Deep technical reasoning for why this tool is next'",
        "    example_input: { ... } # A valid, complete JSON object for the next agent",
        "\ninterrupted_state:",
        "  context_of_interruption: 'Brief description of what you were doing when the turn or epoch ended.'",
        "  thought_tail: 'The last few sentences of your internal reasoning/thoughts right before the transition.'",
        "  partial_tool_call_fragment: 'If you were in the middle of typing a large tool call (JSON), extract the recovered buffer here.'",
        "  last_mental_drafts: 'Dense, verbose extraction or summary of the exact document content or code you were formulating in your reasoning channel just before interruption. DO NOT INVENT CONTENT; extract it from the thoughts.'",
        "  resumption_directive: 'A concrete, stern, one-sentence command telling the next agent exactly what to do first to resume progress.'",
        "\nINSTRUCTIONS:",
        "1. Analyze the ACTION TIMELINE and RECENT AGENT THOUGHTS below.",
        "2. ARCHITECTURAL PRESERVATION: You MUST explicitly recap high-level design patterns and implementation strategies established earlier in the epoch in the `executive_intent` section.",
        "3. DENSITY MANDATE: Provide code-level architectural context in `technical_progress`. Do NOT use vague summaries.",
        "4. LENGTH GOAL: Aim for a dense report of approximately 600-800 tokens. DO NOT EXCEED 1000 tokens.",
        "5. If a tool like 'sc_plan' returns 'Please finish editing...', the 'phase' is 'Specification', 'status' is 'Blocked', and the file should be listed in 'blocked_drafts'.",
        "6. PROJECT MAP ORIENTATION: If the ACTION TIMELINE shows repetitive exploratory loops (ls, read, grep) for orientation, recommend using `map pm_query` or `map pm_plan` in the next_action rationale. Use the provided PROJECT_MAP_STATUS to judge map accuracy.",
        "7. You MUST provide a concrete 'example_input' for the 'next_action'. If the next action is to fix a file, provide the 'edit' or 'replace' parameters. For 'mcpx' or 'bash' commands, you may omit 'example_input' as the main agent will use AGENTS.md for syntax.",
        "8. EXECUTIVE INTENT: Deeply analyze the provided RECENT AGENT THOUGHTS. Distill the agent's internal monologue into the structured `executive_intent` fields. Offload verbose reasoning to the `.history` files via the signposts.",
        "9. INTERRUPTED STATE EXTRACTION: You MUST focus on the VERY LAST reasoning blocks. Extract the literal content, code, or partial tool calls into `interrupted_state` fields. This acts as a hot-swap restore point for the next epoch.",
        "10. PIPELINE TRACKING: You MUST identify the current step (1-5) in the 'Documentation-to-Build' pipeline based on the ACTION TIMELINE and SPEC status. Record this in `workflow_map.pipeline_step`.",
        "11. DENSE ACTIVITY ONLY: Only provide a dense, 2-3 line chronological summary of the most critical actions in the `function_activity` field.",
        "12. PROJECT DISCOVERY: Use the provided ACTIVE PROJECT CONTEXT to determine the current feature and phase. If FEATURE_ID is present, the project is NOT Uninitialized.",
        "13. ARTIFACT VERIFICATION (CRITICAL): Use the VERIFIED_FILES list below as the source of truth for `completed_artifacts`. If a file is in MISSING_ARTIFACTS, it MUST NOT be listed as completed; if it was intended to be created, list it in `blocked_drafts` instead.",
        agentsContent ? `\nPROJECT GUIDELINES (AGENTS.md):\n${agentsContent}` : "",
        `\nPROJECT_MAP_STATUS:\n${mapStatus}`,
        `\nACTIVE PROJECT CONTEXT (Ground Truth):\n${activeProjectContext}`,
        `\nVERIFIED_FILES (Ground Truth - Files currently on disk):\n${analysis.verifiedFiles?.join("\n") || "None"}`,
        `\nMISSING_ARTIFACTS (Files referenced in tools but NOT on disk):\n${analysis.missingFiles?.join("\n") || "None"}`,
        "\nRECENT AGENT THOUGHTS:\n" +
          (analysis.thoughts && analysis.thoughts.length > 0 ? analysis.thoughts.join("\n\n---\n\n") : "None"),
        analysis.interruptedToolCall ? `\nINTERRUPTED TOOL CALL FRAGMENT (${analysis.interruptedToolCall.tool}):\n${analysis.interruptedToolCall.raw}\n` : "",
        "\nACTION TIMELINE (for your analysis only, do not copy verbatim):\n" +
          analysis.actionTimeline +
          "\n\nTECHNICAL TELEMETRY:\n" +
          JSON.stringify(analysis.telemetry, null, 2),
      ]
        .filter(Boolean)
        .join("\n")

      // Hard context defense: Limit prompt to 90% of model's context window
      // 4 chars per token is a safe conservative heuristic for UTF-8 code/logs
      const charLimit = (sideLanguage.modelId.includes("qwen") ? 32000 : 128000) * 0.9 * 4
      let analysisPrompt = analysisPromptRaw
      if (analysisPromptRaw.length > charLimit) {
        log.error("SUPERVISOR_CONTEXT_CUTOFF_TRIGGERED", {
          actualLength: analysisPromptRaw.length,
          limit: charLimit,
          sessionID: input.sessionID,
        })
        analysisPrompt =
          analysisPromptRaw.slice(0, charLimit) + "\n\n[ERROR: PROMPT TRUNCATED DUE TO CONTEXT DEFENSE LIMIT]"
      }

      let continuityRes
      try {
        log.debug("Continuity report prompt", { prompt: analysisPrompt })
        continuityRes = yield* Effect.promise(() =>
          generateText({
            model: sideLanguage,
            system:
              "You are generating a dense, technical continuation state document. Output ONLY strict TOON format without markdown code blocks.\nLOOP MITIGATION: If you detect repetitive exploratory tool calls (read, ls, grep, which) in the action timeline without progress, you MUST recommend a decisive next_action using 'edit' or 'write' to resolve the underlying blocker.",
            prompt: analysisPrompt,
            abortSignal: input.abortSignal,
          }),
        )
        log.debug("Continuity report generated", { length: continuityRes.text.length })
      } catch (e) {
        log.error("Continuity report generation failed", { error: String(e), model: sideLanguage.modelId })
        throw e
      }

      if (input.abortSignal.aborted) return

      try {
        let finalContent = continuityRes.text
          .replace(/^```toon\n/, "")
          .replace(/^```\n/, "")
          .replace(/```$/, "")
          .trim()

        const continuityMatch = finalContent.match(/epoch_continuity:\n([\s\S]+?)(?=\ninterrupted_state:|$)/)
        const interruptedMatch = finalContent.match(/interrupted_state:\n([\s\S]+?)$/)

        if (continuityMatch) {
          const continuityPath = path.join(Instance.directory, ".epoch-continuity.toon")
          yield* Effect.promise(() => fsNode.writeFile(continuityPath, continuityMatch[0].trim()))
          log.info(`Wrote .epoch-continuity.toon to ${continuityPath}`)
        }

        if (interruptedMatch) {
          const historyDir = path.join(Instance.directory, ".history")
          yield* Effect.promise(() => fsNode.mkdir(historyDir, { recursive: true }).catch(() => {}))
          const interruptedPath = path.join(historyDir, "interrupted_state.toon")
          yield* Effect.promise(() => fsNode.writeFile(interruptedPath, interruptedMatch[0].trim()))
          log.info(`Wrote interrupted state to ${interruptedPath}`)
        }

        // Update global history suite (.history/*.toon)
        yield* Effect.promise(() => SessionAnalyzer.exportHistoryToToon(Instance.directory))
      } catch (e) {
        log.warn("Failed to write .epoch-continuity.toon or history suite", { error: String(e) })
      }

      // 3. Epoch Summarization & Spec Advance (ONLY if transition or final)
      if (input.isTransition || input.isFinal) {
        const mcpClientsRecord = yield* Effect.promise(() => MCP.clients())
        const mcpClients = Object.values(mcpClientsRecord) as any[]
        const specCli = mcpClients.find((c) => c.id === "spec")

        if (specCli && !input.abortSignal.aborted) {
          log.debug("Advancing task state via spec")
          try {
            const listRes = yield* Effect.promise(() => specCli.callTool({ name: "sc_todo_list", arguments: {} }))
            const content = (listRes as any).content as any[]
            if (content && content.length > 0 && content[0].type === "text") {
              const activeTaskMatch = content[0].text.match(/\[[-~]\]\s+(\d+\.\d+)/)
              if (activeTaskMatch) {
                const taskId = activeTaskMatch[1]
                log.info(`Autonomously marking task ${taskId} as complete`)
                yield* Effect.promise(() =>
                  specCli.client.callTool({ name: "sc_todo_complete", arguments: { id: taskId } }),
                )
              }
            }
          } catch (e) {
            log.warn("Failed autonomous spec-cli update", { error: String(e) })
          }
        }
      }

      log.info("Phase 3 Post-Generation complete")
    } catch (error: any) {
      if (error.name === "AbortError") {
        log.info("Phase 3 aborted due to new user input")
      } else {
        log.error("Error in Post-Generation Worker", { error: String(error) })
      }
    }
  })
}
