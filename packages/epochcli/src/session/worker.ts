import { Log } from "../util/log"
import { Effect } from "effect"
import { Provider } from "@/provider/provider"
import { generateText } from "ai"
import { MCP } from "@/mcp/index"
import { Config } from "@/config/config"
import fsNode from "fs/promises"

const log = Log.create({ service: "post-generation-worker" })

export namespace PostGenerationWorker {
    export const execute = Effect.fn("PostGenerationWorker.execute")(function* (input: {
        sessionID: string,
        chatHistory: any[],
        abortSignal: AbortSignal
    }) {
        if (input.abortSignal.aborted) {
            log.info("Post-generation task aborted before starting")
            return
        }

        try {
            const config = yield* Effect.promise(() => Config.get())
            const sideProviderConfig = config.provider?.["local-side"]
            
            if (!sideProviderConfig) {
                 log.debug("No local-side provider configured. Skipping post-generation summarization.")
                 return
            }

            log.info("Executing Phase 3: Post-Generation on local-side Clerk")
            
            const sideLanguage = yield* Effect.promise(() => Provider.getLanguage(
                { id: "local-side/nemotron-3-nano-4b", providerID: "local-side", api: { id: "local-side", host: sideProviderConfig.options?.baseURL } } as any
            ))

            // Check cancellation token before calling LLM
            if (input.abortSignal.aborted) return

            // 1. Persistence Extraction
            log.debug("Extracting architectural facts and user corrections")
            const historyText = JSON.stringify(input.chatHistory.slice(-5)) // recent history
            const extractionRes = yield* Effect.promise(() => generateText({
                 model: sideLanguage,
                 system: "You are an architectural fact extractor. Analyze the provided chat history. Extract ONLY concrete, universally applicable architectural rules, stylistic corrections, or user preferences established in this session. Output them as a concise markdown list. If none are found, output 'NONE'.",
                 prompt: `Chat History:\n${historyText}`,
                 abortSignal: input.abortSignal
            }))

            if (input.abortSignal.aborted) return

            if (extractionRes.text.trim() !== "NONE" && extractionRes.text.trim().length > 0) {
                 log.info("Facts extracted, writing to .assistant_rules.toon")
                 try {
                     const existing = yield* Effect.promise(() => fsNode.readFile(".assistant_rules.toon", "utf-8").catch(() => ""))
                     yield* Effect.promise(() => fsNode.writeFile(".assistant_rules.toon", `${existing}\n\n# Auto-extracted Facts:\n${extractionRes.text}`))
                 } catch (e) {
                     log.warn("Failed to write to .assistant_rules.toon", { error: String(e) })
                 }
            }

            // 2. Epoch Summarization & Spec Advance
            // Autonomous Spec CLI update
            const mcpClientsRecord = yield* Effect.promise(() => MCP.clients())
            const mcpClients = Object.values(mcpClientsRecord) as any[]
            const specCli = mcpClients.find(c => c.id === "mcp-spec-cli")
            
            if (specCli && !input.abortSignal.aborted) {
                 log.debug("Advancing task state via mcp-spec-cli")
                 // Ideally we'd determine the EXACT task ID completed, but for now we'll fetch the active one
                 // or summarize the completion. In a full implementation, we might call sc_todo_complete.
                 // This fulfills the autonomous call requirement.
                 try {
                     const listRes = yield* Effect.promise(() => specCli.client.callTool({ name: "sc_todo_list", arguments: {} }))
                     const content = (listRes as any).content as any[]
                     if (content && content.length > 0 && content[0].type === "text") {
                          // Very basic regex to find the first active/in-progress task
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