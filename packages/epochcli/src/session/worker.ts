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
        sessionID: string,
        chatHistory: any[],
        abortSignal: AbortSignal,
        isTransition?: boolean,
        isFinal?: boolean
    }) {
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

            // Check cancellation token before calling LLM
            if (input.abortSignal.aborted) return

            // 1. Persistence Extraction
            log.debug("Extracting architectural facts and user corrections", { model: sideLanguage.modelId })
            let extractionRes;
            try {
                extractionRes = yield* Effect.promise(() => generateText({
                    model: sideLanguage,
                    system: "You are an architectural fact extractor. Analyze the provided chat history. Extract ONLY concrete, universally applicable architectural rules, stylistic corrections, or user preferences established in this session. Output them in TOON format exactly like this:\nrules[fact_id, trigger, behaviour]:\n  fact_01, \"When [condition/trigger]\", \"[The required behavior or preference]\"\n\nIf no concrete rules or corrections are found, output 'NONE'.",
                    prompt: `Chat History:\n${JSON.stringify(input.chatHistory.slice(-5))}`,
                    abortSignal: input.abortSignal
                }))
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
                     yield* Effect.promise(() => fsNode.writeFile(rulesPath, `${existing}\n\n# Auto-extracted Circumstances:\n${extractionRes.text}`))
                     log.debug(`Wrote facts to ${rulesPath}`)
                 } catch (e) {
                     log.warn("Failed to write to .assistant_rules.toon", { error: String(e) })
                 }
            }

            // 2. Generate Epoch Continuity Report
            log.debug("Generating Epoch Continuity Report", { model: sideLanguage.modelId })
            const analysis = yield* Effect.promise(() => SessionAnalyzer.analyze(input.sessionID, input.chatHistory))

            const agentsPath = path.join(Instance.directory, "AGENTS.md")
            const agentsContent = yield* Effect.promise(() => fsNode.readFile(agentsPath, "utf-8").catch(() => ""))
            
            const analysisPrompt = [
               "You are an expert technical supervisor generating an Epoch Continuity Report.",
               "This report is the ONLY memory the next agent will have of this project.",
               "You MUST output the report in strict TOON (Token-Oriented Object Notation) format.",
               "Do NOT use markdown formatting. Use YAML-like indentation with clear key-value pairs.",
               "Structure your output exactly like this:",
               "epoch_continuity:",
               "  workflow_map:",
               "    phase: 'Current Spec Phase (e.g., Requirements, Design, Build)'",
               "    status: 'Ready / Blocked / In-Progress'",
               "  state_verdict:",
               "    completed_tools: ['tool1', 'tool2']",
               "    failed_tools: ['tool3']",
               "  residual_blockers:",
               "    - { file: 'path/to/file', error: 'specific error snippet', resolution: 'action needed' }",
               "  user_focus: 'The ultimate goal'",
               "  technical_progress:",
               "    artifacts: ['files successfully created/finalized']",
               "    drafts: ['files that exist but are blocked by templates/errors']",
               "  function_activity: 'Literal trace of the last few tool calls'",
               "  next_action:",
               "    tool: 'tool_name'",
               "    rationale: 'Why this tool is next'",
               "    example_input: { ... } # A valid JSON object for the next agent to use",
               "\nINSTRUCTIONS:",
               "1. Analyze the ACTION TIMELINE below. Pay close attention to 'Output', 'Error', and 'Hint' fields.",
               "2. If a tool like 'sc_plan' returns 'Please finish editing...', the 'phase' is 'Requirements', 'status' is 'Blocked', and the file should be listed in 'drafts' and 'residual_blockers'.",
               "3. You MUST provide a concrete 'example_input' for the 'next_action'. If the next action is to fix a file, provide the 'edit' or 'replace' parameters. For 'mcpx' or 'bash' commands, you may omit 'example_input' as the main agent will use AGENTS.md for syntax.",
               "4. TOOL SCHEMA REFERENCE (use these exact parameter names):",
               "   - 'edit': { \"filePath\": \"absolute/path\", \"oldString\": \"exact text to find\", \"newString\": \"new text\", \"replaceAll\": true/false }",
               "   - 'write': { \"filePath\": \"absolute/path\", \"content\": \"full file content\" }",
               "   - 'bash': { \"command\": \"shell command\" }",
               "   - 'read': { \"filePath\": \"absolute/path\" }",
               "5. If the ACTION TIMELINE shows a successful 'edit', 'write', or 'replace' tool execution, ASSUME the change was correct. Do NOT suggest a verification tool like 'read' or 'sc_status'. Instead, set 'next_action' to the NEXT logical workflow step (e.g., 'sc_approve' or 'sc_plan').",
               agentsContent ? `\nPROJECT GUIDELINES (AGENTS.md):\n${agentsContent}` : "",
               "\nACTION TIMELINE:\n" + analysis.actionTimeline +
               "\n\nTECHNICAL TELEMETRY:\n" + JSON.stringify(analysis.telemetry, null, 2)
            ].filter(Boolean).join("\n")

            let continuityRes;
            try {
                log.debug("Continuity report prompt", { prompt: analysisPrompt })
                continuityRes = yield* Effect.promise(() => generateText({
                    model: sideLanguage,
                    system: "You are generating a dense, technical continuation state document. Output ONLY strict TOON format without markdown code blocks.",
                    prompt: analysisPrompt,
                    abortSignal: input.abortSignal
                }))
                log.debug("Continuity report generated", { length: continuityRes.text.length })
            } catch (e) {
                log.error("Continuity report generation failed", { error: String(e), model: sideLanguage.modelId })
                throw e
            }

            if (input.abortSignal.aborted) return

            try {
                let finalContent = continuityRes.text.replace(/^```toon\n/, "").replace(/^```\n/, "").replace(/```$/, "").trim()
                
                const continuityPath = path.join(Instance.directory, ".epoch-continuity.toon")
                yield* Effect.promise(() => fsNode.writeFile(continuityPath, finalContent))
                log.info(`Wrote .epoch-continuity.toon to ${continuityPath}`)
            } catch (e) {
                log.warn("Failed to write .epoch-continuity.toon", { error: String(e) })
            }

            // 3. Epoch Summarization & Spec Advance (ONLY if transition or final)
            if (input.isTransition || input.isFinal) {
                const mcpClientsRecord = yield* Effect.promise(() => MCP.clients())
                const mcpClients = Object.values(mcpClientsRecord) as any[]
                const specCli = mcpClients.find(c => c.id === "spec")
                
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
                                yield* Effect.promise(() => specCli.client.callTool({ name: "sc_todo_complete", arguments: { id: taskId } }))
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
