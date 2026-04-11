import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import { Cause, Effect, Layer, Record, ServiceMap } from "effect"
import * as Queue from "effect/Queue"
import * as Stream from "effect/Stream"
import { streamText, wrapLanguageModel, type ModelMessage, type Tool, tool, jsonSchema, generateText } from "ai"
import { mergeDeep, pipe } from "remeda"
import { GitLabWorkflowLanguageModel } from "gitlab-ai-provider"
import { ProviderTransform } from "@/provider/transform"
import { Config } from "@/config/config"
import { Instance } from "@/project/instance"
import type { Agent } from "@/agent/agent"
import type { MessageV2 } from "./message-v2"
import { Plugin } from "@/plugin"
import { SystemPrompt } from "./system"
import { PromptBuilder, type ZoneStructuredPayload } from "./prompt/builder"
import { Flag } from "@/flag/flag"
import { Permission } from "@/permission"
import { Auth } from "@/auth"
import { Installation } from "@/installation"
import { ToonEncoder } from "@/util/toon"
import { MCP } from "@/mcp/index"

export namespace LLM {
  const log = Log.create({ service: "llm" })
  export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    parentSessionID?: string
    model: Provider.Model
    agent: Agent.Info
    permission?: Permission.Ruleset
    system: { zone1: string[]; zone2: string[] }
    messages: ModelMessage[]
    small?: boolean
    tools: Record<string, Tool>
    retries?: number
    toolChoice?: "auto" | "required" | "none"
  }

  export type StreamRequest = StreamInput & {
    abort: AbortSignal
  }

  export type Event = Awaited<ReturnType<typeof stream>>["fullStream"] extends AsyncIterable<infer T> ? T : never

  export interface Interface {
    readonly stream: (input: StreamInput) => Stream.Stream<Event, unknown>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/LLM") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      return Service.of({
        stream(input) {
          return Stream.scoped(
            Stream.unwrap(
              Effect.gen(function* () {
                const ctrl = yield* Effect.acquireRelease(
                  Effect.sync(() => new AbortController()),
                  (ctrl) => Effect.sync(() => ctrl.abort()),
                )

                const result = yield* Effect.promise(() => LLM.stream({ ...input, abort: ctrl.signal }))

                return Stream.fromAsyncIterable(result.fullStream, (e) =>
                  e instanceof Error ? e : new Error(String(e)),
                )
              }),
            ),
          )
        },
      })
    }),
  )

  export const defaultLayer = layer

  export function parseGroundTruthRules(raw: string): { operationalFacts: string; behavioralRules: string; projectSpecific: string } {
    const zones = {
      operationalFacts: "",
      behavioralRules: "",
      projectSpecific: "",
    }

    const zone1Match = raw.match(/(ZONE 1 & 3:.*?)(?=ZONE 2:|$)/s)
    if (zone1Match) zones.operationalFacts = zone1Match[1].trim()

    const zone2Match = raw.match(/(ZONE 2: BEHAVIORAL RULE PACKS.*?)(?=ZONE 3: PROJECT-SPECIFIC RULES|$)/s)
    if (zone2Match) zones.behavioralRules = zone2Match[1].trim()

    const zone3Specific = raw.match(/(ZONE 3: PROJECT-SPECIFIC RULES.*?)$/s)
    if (zone3Specific) zones.projectSpecific = zone3Specific[1].trim()

    if (!zones.operationalFacts && !zones.behavioralRules && !zones.projectSpecific) {
      zones.behavioralRules = raw.trim()
    }

    return zones
  }

  export async function stream(input: StreamRequest) {
    const l = log
      .clone()
      .tag("providerID", input.model.providerID)
      .tag("modelID", input.model.id)
      .tag("sessionID", input.sessionID)
      .tag("small", (input.small ?? false).toString())
      .tag("agent", input.agent.name)
      .tag("mode", input.agent.mode)
    l.info("stream", {
      modelID: input.model.id,
      providerID: input.model.providerID,
    })
    const [language, cfg, provider, auth] = await Promise.all([
      Provider.getLanguage(input.model),
      Config.get(),
      Provider.getProvider(input.model.providerID),
      Auth.get(input.model.providerID),
    ])
    // TODO: move this to a proper hook
    const isOpenaiOauth = provider.id === "openai" && auth?.type === "oauth"

    const payload: ZoneStructuredPayload = {
      zone1_critical_rules: [
        `Current Phase: [${input.agent.name.toUpperCase()}]. You are restricted to using only the tools currently defined in your schema.`
      ],
      zone2_context_files: [],
      zone3_active_cursor: [],
    }

    // Phase 1: Intent Classification (Clerk / local-side) - Task 1.1
    // The Clerk detects user intent and shifts the active epochcli Agent.
    if (provider.id === "local-main") {
      try {
        const sideModel = await Provider.getSideModel(); // 4B Clerk
        const sideLanguage = await Provider.getLanguage(sideModel);
        
        // Extract conversation tail for structural context (Task 1.1)
        const tailCount = 10;
        const recentMessages = input.messages.slice(-tailCount);
        const conversationTail = recentMessages.map(m => {
            let content = "";
            if (typeof m.content === "string") {
                content = m.content;
            } else if (Array.isArray(m.content)) {
                content = m.content
                    .map(c => {
                        if (c.type === "text") return c.text;
                        if (c.type === "tool-call") return `[Tool Call: ${c.toolName}]`;
                        if (c.type === "tool-result") return `[Tool Result: ${c.toolName}]`;
                        return `[${c.type}]`;
                    })
                    .join(" ");
            }
            // Truncate individual message content to keep the transcript lean
            const truncated = content.length > 300 ? content.slice(0, 250) + "... [truncated]" : content;
            return `${m.role.toUpperCase()}: ${truncated}`;
        }).join("\n\n");

        if (conversationTail) {
            const { RuleRouter } = await import("./prompt/router");
            const { Agent } = await import("@/agent/agent");

            // Debug info for the Clerk Turn
            const sideProvider = await Provider.getProvider(sideModel.providerID);
            console.log(`[CLERK] Using model: ${sideModel.providerID}/${sideModel.id} at ${sideProvider?.options?.baseURL}`);

            let groundTruths = "";
            try {
              const fsNode = await import("fs/promises");
              const rulesContext = await fsNode.readFile(".assistant_rules.toon", "utf-8");
              const parsedRules = parseGroundTruthRules(rulesContext);
              if (parsedRules.operationalFacts) groundTruths = parsedRules.operationalFacts;
            } catch (e) {}

            console.log(`[CLERK] Supervising conversation...`);
            
            // Task 4.2: Arbitration Mechanism
            let identifiedAgent: string | undefined;
            
            // Check for initial persona lock (Spec CLI One-Shot)
            const firstUserMsg = input.messages.find(m => m.role === "user");
            let firstMsgText = "";
            if (typeof firstUserMsg?.content === "string") {
                firstMsgText = firstUserMsg.content;
            } else if (Array.isArray(firstUserMsg?.content)) {
                firstMsgText = firstUserMsg.content
                    .filter(c => c.type === "text")
                    .map(c => c.text)
                    .join("\n");
            }
            const isOneShot = firstMsgText.toLowerCase().includes("one-shot") || firstMsgText.toLowerCase().includes("spec cli");
            
            // Check if planning is actually finished
            let planningFinished = false;
            try {
                const fsNode = await import("fs/promises");
                const pathNode = await import("path");
                // We don't know the feature name easily here without parsing, 
                // but we can look for any .spec-tasks-approved file in projects/active
                const projectDir = "projects/active";
                const entries = await fsNode.readdir(projectDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.isDirectory()) {
                        const approvedFile = pathNode.join(projectDir, entry.name, ".spec-tasks-approved");
                        const exists = await fsNode.access(approvedFile).then(() => true).catch(() => false);
                        if (exists) {
                            planningFinished = true;
                            break;
                        }
                    }
                }
            } catch (e) {}

            // Check for recent objections to the supervisor
            let objectionCount = 0;
            let requestedAgent: string | undefined;
            for (let i = input.messages.length - 1; i >= 0; i--) {
                const msg = input.messages[i];
                if (msg.role === "assistant" && Array.isArray(msg.content)) {
                    const call = msg.content.find(c => c.type === "tool-call" && c.toolName === "object_to_supervisor");
                    if (call) {
                        objectionCount++;
                        requestedAgent = (call as any).args.requestedAgent;
                    } else {
                        break;
                    }
                }
            }

            if (objectionCount >= 2 && requestedAgent) {
                console.log(`[CLERK] Arbitration threshold reached (${objectionCount} objections). Overruling Supervisor with: ${requestedAgent}`);
                identifiedAgent = requestedAgent;
            } else if (isOneShot && !planningFinished && identifiedAgent !== "explore") {
                // Force 'plan' for one-shot workflows until planning is demonstrably finished
                console.log(`[CLERK] One-Shot planning in progress. Locking persona to: plan`);
                identifiedAgent = "plan";
            } else {
                identifiedAgent = await RuleRouter.identifyAgent(conversationTail, sideLanguage, groundTruths);
            }

            console.log(`[CLERK] Identified agent: ${identifiedAgent}`);
            
            if (identifiedAgent !== input.agent.name) {
                log.info("Clerk identified agent shift", { from: input.agent.name, to: identifiedAgent });
                const newAgent = await Agent.get(identifiedAgent);
                if (newAgent) {
                    console.log(`[CLERK] SHIFTING agent to: ${identifiedAgent}`);
                    input.agent = newAgent;
                    // Update the directive in Zone 1
                    payload.zone1_critical_rules[0] = `Current Phase: [${input.agent.name.toUpperCase()}]. You are restricted to using only the tools currently defined in your schema.`;
                }
            }
        }
      } catch (e) {
        console.error(`[CLERK] Intent classification failed: ${String(e)}`);
        log.warn("Clerk intent classification failed", { error: String(e) })
      }
    }

    // Phase 1: Context Fetching (Clerk / local-side) - Task 1.4
    // Attempt to fetch localized file trees and active path from MCP servers and compress them
    if (provider.id === "local-main") {
      try {
        let mcpContext = ""
        const mcpClientsRecord = await MCP.clients()
        const mcpClients = Object.values(mcpClientsRecord) as any[]
        const specCli = mcpClients.find((c: any) => c.id === "mcp-spec-cli")
        const projectMapCli = mcpClients.find((c: any) => c.id === "project-map-cli")
        
        let activePath = "."
        
        if (specCli) {
          try {
             log.debug("Fetching current state from mcp-spec-cli")
             const statusRes = await specCli.client.callTool({ name: "sc_status", arguments: {} })
             if (statusRes.content && statusRes.content.length > 0 && statusRes.content[0].type === "text") {
                const text = statusRes.content[0].text
                const featureMatch = text.match(/Feature: projects\/active\/(.+)/)
                if (featureMatch) {
                    activePath = `projects/active/${featureMatch[1]}`
                    mcpContext += `Spec CLI Context:\n${ToonEncoder.encode({ active_feature: activePath, status: text })}\n`
                }
             }
          } catch (e) {
             log.debug("Failed to fetch mcp-spec-cli status", { error: String(e) })
          }
        }
        
        if (projectMapCli) {
           try {
             log.debug("Fetching localized map from project-map-cli for path", { activePath })
             const mapRes = await projectMapCli.client.callTool({ name: "pm_query", arguments: { path: activePath } })
             if (mapRes.content && mapRes.content.length > 0 && mapRes.content[0].type === "text") {
                 mcpContext += `Project Map Context:\n${ToonEncoder.encode({ localized_map: mapRes.content[0].text })}\n`
             }
           } catch (e) {
             log.debug("Failed to fetch project-map-cli localized map", { error: String(e) })
           }
        }
        
        if (mcpContext) {
            payload.zone1_critical_rules.push(mcpContext)
        }
      } catch (e) {
        log.warn("Phase 1 Pre-Generation MCP Context fetch failed", { error: String(e) })
      }
    }

    if (provider.id === "local-main") {
      try {
        let rulesContext = ""
        const mcpClientsRecord = await MCP.clients()
        const mcpClients = Object.values(mcpClientsRecord) as any[]
        const gtCli = mcpClients.find((c: any) => c.id === "ground-truth-cli")
        if (gtCli) {
            log.debug("Fetching ground truth rules")
            const gtRes = await gtCli.client.callTool({ name: "gt_status", arguments: {} })
            if (gtRes.content && gtRes.content.length > 0 && gtRes.content[0].type === "text") {
                 rulesContext = gtRes.content[0].text
            }
        } else {
             // Fallback rule load
             try {
                const fsNode = await import("fs/promises")
                rulesContext = await fsNode.readFile(".assistant_rules.toon", "utf-8")
             } catch (e) {
                 // ignore missing file
             }
        }
        
        if (rulesContext) {
           const parsedRules = parseGroundTruthRules(rulesContext)
           if (parsedRules.operationalFacts) {
               payload.zone1_critical_rules.push(parsedRules.operationalFacts)
               payload.zone3_active_cursor.push(parsedRules.operationalFacts) // Repetition in zone 3
           }
           if (parsedRules.behavioralRules) payload.zone2_context_files.push(parsedRules.behavioralRules)
           if (parsedRules.projectSpecific) payload.zone3_active_cursor.push(parsedRules.projectSpecific)
        }
      } catch (e) {
         log.warn("Phase 1 Pre-Generation Rules Context fetch failed", { error: String(e) })
      }
    }

    if (input.system?.zone1) {
      payload.zone1_critical_rules.push(...input.system.zone1)
    }

    payload.zone2_context_files.push(
      [
        // use agent prompt otherwise provider prompt
        ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model)),
        // any custom prompt passed into this call
        ...(input.system?.zone2 ?? []),
        // any custom prompt from last user message
        ...(input.user.system ? [input.user.system] : []),
      ]
        .filter((x) => x)
        .join("\n\n"),
    )

    if (input.user.cursorContext) {
      const { file, line, code } = input.user.cursorContext
      payload.zone3_active_cursor.push(`Active Cursor Context:\n  File: ${file}\n  Line ${line}: ${code} # <--- CURSOR HERE`)
    }

    const system: string[] = [PromptBuilder.build(payload)]
    const header = system[0]
    await Plugin.trigger(
      "experimental.chat.system.transform",
      { sessionID: input.sessionID, model: input.model },
      { system },
    )
    // rejoin to maintain 2-part structure for caching if header unchanged
    if (system.length > 2 && system[0] === header) {
      const rest = system.slice(1)
      system.length = 0
      system.push(header, rest.join("\n"))
    }

    const variant =
      !input.small && input.model.variants && input.user.model.variant
        ? input.model.variants[input.user.model.variant]
        : {}
    const base = input.small
      ? ProviderTransform.smallOptions(input.model)
      : ProviderTransform.options({
          model: input.model,
          sessionID: input.sessionID,
          providerOptions: provider.options,
        })
    const options: Record<string, any> = pipe(
      base,
      mergeDeep(input.model.options),
      mergeDeep(input.agent.options),
      mergeDeep(variant),
    )
    if (isOpenaiOauth) {
      options.instructions = system.join("\n")
    }

    const isWorkflow = language instanceof GitLabWorkflowLanguageModel
    const messages = isOpenaiOauth
      ? input.messages
      : isWorkflow
        ? input.messages
        : [
            ...system.map(
              (x): ModelMessage => ({
                role: "system",
                content: x,
              }),
            ),
            ...input.messages,
          ]

    const params = await Plugin.trigger(
      "chat.params",
      {
        sessionID: input.sessionID,
        agent: input.agent.name,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        temperature: input.model.capabilities.temperature
          ? (input.agent.temperature ?? ProviderTransform.temperature(input.model))
          : undefined,
        topP: input.agent.topP ?? ProviderTransform.topP(input.model),
        topK: ProviderTransform.topK(input.model),
        maxOutputTokens: ProviderTransform.maxOutputTokens(input.model),
        options,
      },
    )

    const { headers } = await Plugin.trigger(
      "chat.headers",
      {
        sessionID: input.sessionID,
        agent: input.agent.name,
        model: input.model,
        provider,
        message: input.user,
      },
      {
        headers: {},
      },
    )

    const tools = Record.map(resolveTools(input), (toolDef, toolName) => {
      if (!toolDef.execute) return toolDef
      const originalExecute = toolDef.execute
      return {
        ...toolDef,
        execute: async (args: any, options: any) => {
          const interception = await interceptToolLoop({
            toolName,
            args,
            messages: options.messages ?? input.messages,
            provider,
            cfg,
          })
          if (interception) return interception
          return originalExecute(args, options)
        },
      }
    })

    // LiteLLM and some Anthropic proxies require the tools parameter to be present
    // when message history contains tool calls, even if no tools are being used.
    // Add a dummy tool that is never called to satisfy this validation.
    // This is enabled for:
    // 1. Providers with "litellm" in their ID or API ID (auto-detected)
    // 2. Providers with explicit "litellmProxy: true" option (opt-in for custom gateways)
    const isLiteLLMProxy =
      provider.options?.["litellmProxy"] === true ||
      input.model.providerID.toLowerCase().includes("litellm") ||
      input.model.api.id.toLowerCase().includes("litellm")

    // LiteLLM/Bedrock rejects requests where the message history contains tool
    // calls but no tools param is present. When there are no active tools (e.g.
    // during compaction), inject a stub tool to satisfy the validation requirement.
    // The stub description explicitly tells the model not to call it.
    if (isLiteLLMProxy && Object.keys(tools).length === 0 && hasToolCalls(input.messages)) {
      tools["_noop"] = tool({
        description: "Do not call this tool. It exists only for API compatibility and must never be invoked.",
        inputSchema: jsonSchema({
          type: "object",
          properties: {
            reason: { type: "string", description: "Unused" },
          },
        }),
        execute: async () => ({ output: "", title: "", metadata: {} }),
      })
    }

    // Wire up toolExecutor for DWS workflow models so that tool calls
    // from the workflow service are executed via epochcli's tool system
    // and results sent back over the WebSocket.
    if (language instanceof GitLabWorkflowLanguageModel) {
      const workflowModel = language
      workflowModel.systemPrompt = system.join("\n")
      workflowModel.toolExecutor = async (toolName, argsJson, _requestID) => {
        const t = tools[toolName]
        if (!t || !t.execute) {
          return { result: "", error: `Unknown tool: ${toolName}` }
        }
        try {
          const result = await t.execute!(JSON.parse(argsJson), {
            toolCallId: _requestID,
            messages: input.messages,
            abortSignal: input.abort,
          })
          const output = typeof result === "string" ? result : (result?.output ?? JSON.stringify(result))
          return {
            result: output,
            metadata: typeof result === "object" ? result?.metadata : undefined,
            title: typeof result === "object" ? result?.title : undefined,
          }
        } catch (e: any) {
          return { result: "", error: e.message ?? String(e) }
        }
      }
    }

    return streamText({
      onFinish(event) {
          // Trigger Phase 3 background worker without awaiting it to allow the stream to finish immediately
          if (provider.id === "local-main") {
             import("./worker").then(({ PostGenerationWorker }) => {
                 Effect.runPromise(PostGenerationWorker.execute({
                     sessionID: input.sessionID,
                     chatHistory: messages,
                     abortSignal: input.abort
                 }) as any)
             }).catch(e => {
                 log.warn("Failed to load or execute PostGenerationWorker", { error: String(e) })
             })
          }
      },
      onError(error) {
        l.error("stream error", {
          error,
        })
      },
      async experimental_repairToolCall(failed) {
        // Phase 2 OutputInterceptor: Catch broken JSON from local-main and use local-side to fix it.
        if (provider.id === "local-main") {
            try {
               const sideProviderConfig = cfg.provider?.["local-side"]
               if (sideProviderConfig) {
                   log.info("Attempting to repair broken JSON tool call with local-side Clerk")
                   const sideLanguage = await Provider.getLanguage(
                     await Provider.getModel("local-side" as any, "nemotron-3-nano-4b" as any) // or default local-side model
                   )
                   const repairResponse = await generateText({
                     model: sideLanguage,
                     system: "You are a JSON repair utility. The user will provide a broken JSON tool call. Your ONLY job is to output the repaired, valid JSON object that matches the intended schema. DO NOT output any markdown, explanations, or other text. ONLY the valid JSON object.",
                     prompt: `Broken JSON: ${(failed.toolCall as any).args}\n\nError: ${failed.error.message}`,
                     abortSignal: AbortSignal.timeout(15000),
                     maxRetries: 0,
                   })                   
                   try {
                     const repairedArgs = JSON.parse(repairResponse.text.trim())
                     log.info("Successfully repaired JSON with local-side")

                     const repairEvent: Log.EnhancedModelExecutionEvent = {
                       timestamp: Date.now(),
                       mainEpochId: input.sessionID,
                       event: "END_GENERATE",
                       providerId: "local-side",
                       phase: "Phase 2",
                       metrics: { json_repaired: true }
                     }
                     log.info(JSON.stringify(repairEvent))

                     return {
                       ...failed.toolCall,
                       args: repairedArgs
                     }                   } catch (parseErr) {
                      log.warn("local-side failed to output valid JSON for repair")
                   }
               }
            } catch (e) {
               log.error("Failed during local-side JSON repair attempt", { error: String(e) })
            }
        }

        const lower = failed.toolCall.toolName.toLowerCase()
        if (lower !== failed.toolCall.toolName && tools[lower]) {
          l.info("repairing tool call", {
            tool: failed.toolCall.toolName,
            repaired: lower,
          })
          return {
            ...failed.toolCall,
            toolName: lower,
          }
        }
        return {
          ...failed.toolCall,
          input: JSON.stringify({
            tool: failed.toolCall.toolName,
            error: failed.error.message,
          }),
          toolName: "invalid",
        }
      },
      temperature: params.temperature,
      topP: params.topP,
      topK: params.topK,
      providerOptions: ProviderTransform.providerOptions(input.model, params.options),
      activeTools: Object.keys(tools).filter((x) => x !== "invalid"),
      tools,
      toolChoice: input.toolChoice,
      maxOutputTokens: params.maxOutputTokens,
      abortSignal: input.abort,
      headers: {
        ...(input.model.providerID.startsWith("epochcli")
          ? {
              "x-epochcli-project": Instance.project.id,
              "x-epochcli-session": input.sessionID,
              "x-epochcli-request": input.user.id,
              "x-epochcli-client": Flag.EPOCHCLI_CLIENT,
            }
          : {
              "x-session-affinity": input.sessionID,
              ...(input.parentSessionID ? { "x-parent-session-id": input.parentSessionID } : {}),
              "User-Agent": `epochcli/${Installation.VERSION}`,
            }),
        ...input.model.headers,
        ...headers,
      },
      maxRetries: input.retries ?? 0,
      messages,
      model: wrapLanguageModel({
        model: language,
        middleware: [
          {
            specificationVersion: "v3" as const,
            async transformParams(args) {
              if (args.type === "stream") {
                // @ts-expect-error
                args.params.prompt = ProviderTransform.message(args.params.prompt, input.model, options)
              }
              return args.params
            },
          },
          // Telemetry middleware
          {
            specificationVersion: "v3" as const,
            wrapGenerate: async ({ doGenerate, params }) => {
              const startTime = Date.now()
              const truncatedPayload = Log.truncatePayload(params.prompt)
              const mainEpochId = input.sessionID
              const phase = input.model.providerID.includes("local-side") ? "Phase 1/3" : "Phase 2"
              
              const startEvent: Log.EnhancedModelExecutionEvent = {
                timestamp: startTime,
                mainEpochId,
                event: "START_GENERATE",
                providerId: input.model.providerID,
                phase,
                activeAgent: input.agent.name,
                toolCount: Object.keys(tools).length,
                payload: truncatedPayload
              }
              console.log(JSON.stringify(startEvent))

              try {
                const res = await doGenerate()
                const endTime = Date.now()
                
                const endEvent: Log.EnhancedModelExecutionEvent = {
                  timestamp: endTime,
                  mainEpochId,
                  event: "END_GENERATE",
                  providerId: input.model.providerID,
                  phase,
                  activeAgent: input.agent.name,
                  toolCount: Object.keys(tools).length,
                  metrics: {
                    ttftMs: endTime - startTime,
                    promptTokens: (res.usage as any)?.promptTokens,
                    tps: (res.usage as any)?.completionTokens ? ((res.usage as any).completionTokens / ((endTime - startTime) / 1000)) : undefined
                  }
                }
                console.log(JSON.stringify(endEvent))
                return res
              } catch (e) {
                const errorEvent: Log.EnhancedModelExecutionEvent = {
                  timestamp: Date.now(),
                  mainEpochId,
                  event: "ERROR",
                  providerId: input.model.providerID,
                  phase,
                  payload: { error: String(e) }
                }
                console.error(JSON.stringify(errorEvent))
                throw e
              }
            },
            wrapStream: async ({ doStream, params }) => {
              const startTime = Date.now()
              const truncatedPayload = Log.truncatePayload(params.prompt)
              const mainEpochId = input.sessionID
              const phase = input.model.providerID.includes("local-side") ? "Phase 1/3" : "Phase 2"
              
              const startEvent: Log.EnhancedModelExecutionEvent = {
                timestamp: startTime,
                mainEpochId,
                event: "START_GENERATE",
                providerId: input.model.providerID,
                phase,
                activeAgent: input.agent.name,
                toolCount: Object.keys(tools).length,
                payload: truncatedPayload
              }
              console.log(JSON.stringify(startEvent))

              try {
                const { stream, ...rest } = await doStream()
                let firstTokenTime: number | undefined
                let tokenCount = 0

                const iterator = (async function* () {
                   for await (const chunk of (stream as any)) {
                      if (!firstTokenTime && chunk.type === "text-delta") {
                         firstTokenTime = Date.now()
                      }
                      if (chunk.type === "text-delta" || chunk.type === "tool-call-delta") {
                         tokenCount++
                      }
                      yield chunk
                   }
                })();

                const readableStream = new ReadableStream({
                  async pull(controller) {
                    try {
                      const { value, done } = await iterator.next()
                      if (done) {
                        const endTime = Date.now()
                        const endEvent: Log.EnhancedModelExecutionEvent = {
                          timestamp: endTime,
                          mainEpochId,
                          event: "END_GENERATE",
                          providerId: input.model.providerID,
                          phase,
                          activeAgent: input.agent.name,
                          toolCount: Object.keys(tools).length,
                          metrics: {
                            ttftMs: firstTokenTime ? firstTokenTime - startTime : undefined,
                            tps: (tokenCount && firstTokenTime) ? (tokenCount / ((endTime - firstTokenTime) / 1000)) : undefined
                          }
                        }
                        console.log(JSON.stringify(endEvent))
                        controller.close()
                      } else {
                        controller.enqueue(value)
                      }
                    } catch (e) {
                      const errorEvent: Log.EnhancedModelExecutionEvent = {
                        timestamp: Date.now(),
                        mainEpochId,
                        event: "ERROR",
                        providerId: input.model.providerID,
                        phase,
                        payload: { error: String(e) }
                      }
                      console.error(JSON.stringify(errorEvent))
                      controller.error(e)
                    }
                  },
                  cancel(reason) {
                    iterator.return?.(reason)
                  }
                })

                return { stream: readableStream, ...rest }
              } catch (e) {
                const errorEvent: Log.EnhancedModelExecutionEvent = {
                  timestamp: Date.now(),
                  mainEpochId,
                  event: "ERROR",
                  providerId: input.model.providerID,
                  phase,
                  payload: { error: String(e) }
                }
                console.error(JSON.stringify(errorEvent))
                throw e
              }
            }
          },
          // NativeTokenParser middleware
          {
             specificationVersion: "v3" as const,
             wrapGenerate: async ({ doGenerate, params }) => {
                   const res = await doGenerate()
                   // Replace <|"> with markdown backticks
                   ;(res as any).text = (res as any).text?.replace(/<\|">/g, "```")
                   return res
             },
             wrapStream: async ({ doStream, params }) => {
                   const { stream, ...rest } = await doStream()

                   const iterator = (async function* () {
                      for await (const chunk of (stream as any)) {
                         if (chunk.type === "text-delta" && typeof chunk.textDelta === "string") {
                            chunk.textDelta = chunk.textDelta.replace(/<\|">/g, "```")
                         }
                         yield chunk
                      }
                   })();

                   const readableStream = new ReadableStream({
                     async pull(controller) {
                       const { value, done } = await iterator.next()
                       if (done) {
                         controller.close()
                       } else {
                         controller.enqueue(value)
                       }
                     },
                     cancel(reason) {
                       iterator.return?.(reason)
                     }
                   })

                   return { stream: readableStream, ...rest }
             }          }
        ],
      }),
      experimental_telemetry: {
        isEnabled: cfg.experimental?.openTelemetry,
        metadata: {
          userId: cfg.username ?? "unknown",
          sessionId: input.sessionID,
        },
      },
    })
  }

  function resolveTools(input: Pick<StreamInput, "tools" | "agent" | "permission" | "user">) {
    const disabled = Permission.disabled(
      Object.keys(input.tools),
      Permission.merge(input.agent.permission, input.permission ?? []),
    )
    return Record.filter(input.tools, (_, k) => input.user.tools?.[k] !== false && !disabled.has(k))
  }

  // Check if messages contain any tool-call content
  // Used to determine if a dummy tool should be added for LiteLLM proxy compatibility
  export function hasToolCalls(messages: ModelMessage[]): boolean {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue
      for (const part of msg.content) {
        if (part.type === "tool-call" || part.type === "tool-result") return true
      }
    }
    return false
  }

  export async function interceptToolLoop(input: {
    toolName: string
    args: any
    messages: ModelMessage[]
    provider: any
    cfg: Config.Info
  }) {
    // Task 4.2: Arbitration Mechanism
    if (input.toolName === "object_to_supervisor") {
        return {
            output: `OBJECTION RECORDED: The Supervisor (Clerk) will review your reasoning: "${input.args.reason}". Your requested persona (${input.args.requestedAgent}) will be considered for the next turn.`,
            title: "Arbitration Request",
            metadata: { ...input.args }
        };
    }

    let identicalCount = 0;    let sequentialFailureCount = 0
    let identicalChainActive = true
    let failureChainActive = true
    const attemptedArgs: any[] = []

    // Scan backwards through messages
    for (let i = input.messages.length - 1; i >= 0; i--) {
      if (!identicalChainActive && !failureChainActive) break

      const msg = input.messages[i]

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        const call = msg.content.find((c) => c.type === "tool-call" && c.toolName === input.toolName)
        if (call) {
          const callArgs = (call as any).args

          // Identical arguments chain
          if (identicalChainActive) {
            if (JSON.stringify(callArgs) === JSON.stringify(input.args)) {
              identicalCount++
            } else {
              identicalChainActive = false
            }
          }

          // Sequential failures chain
          if (failureChainActive) {
            attemptedArgs.push(callArgs)
            // Check if this specific call resulted in an error in the subsequent message
            const nextMsg = input.messages[i + 1]
            if (nextMsg && nextMsg.role === "user" && Array.isArray(nextMsg.content)) {
              const result = (nextMsg.content as any[]).find(
                (c) => c.type === "tool-result" && c.toolCallId === (call as any).toolCallId,
              )
              if (result && (result as any).isError) {
                sequentialFailureCount++
              } else if (result) {
                // Successful call to this tool, reset sequential failure count
                failureChainActive = false
              }
            }
          }
        } else {
          // Called a different tool, chain broken for both
          identicalChainActive = false
          failureChainActive = false
        }
      } else if (msg.role === "user" && typeof msg.content === "string") {
        // User interrupted or added new text
        identicalChainActive = false
        failureChainActive = false
      }
    }

    const isIdenticalLoop = identicalCount >= 3
    const isFailureLoop = sequentialFailureCount >= 3

    if (isIdenticalLoop || isFailureLoop) {
      const loopType = isIdenticalLoop ? "IDENTICAL_ARGS" : "SEQUENTIAL_FAILURES"
      log.warn(`Loop detected for tool ${input.toolName}`, { toolName: input.toolName, args: input.args, loopType, sequentialFailureCount })

      // Use local-side to generate an intervention
      if (input.provider.id === "local-main") {
        try {
          const sideProviderConfig = input.cfg.provider?.["local-side"]
          if (sideProviderConfig) {
            log.info("Generating intervention directive with local-side Clerk")
            const sideLanguage = await Provider.getLanguage(
              await Provider.getModel("local-side" as any, "nemotron-3-nano-4b" as any),
            )

            const systemPrompt =
              "You are an AI supervisor monitoring a main agent. The main agent is stuck in a loop. Provide a concise, stern directive telling the agent to STOP calling this tool, explain why its current approach is failing (e.g. repeating same args, or repeatedly failing with varied args like capitalization errors), and instruct it to stop and rethink or try a completely different strategy. Do not output anything other than the directive."

            const prompt = isIdenticalLoop
              ? `Tool: ${input.toolName}\nArgs: ${JSON.stringify(input.args)}\nStatus: Stuck in an infinite loop with identical arguments.`
              : `Tool: ${input.toolName}\nRecent Failed Attempts:\n${attemptedArgs
                  .reverse()
                  .map((a, idx) => `${idx + 1}. ${JSON.stringify(a)}`)
                  .join("\n")}\nStatus: Stuck in a trial-and-error loop where all recent attempts have failed.`

            const intervention = await generateText({
              model: sideLanguage,
              system: systemPrompt,
              prompt: `${prompt}\n\nPlease provide the intervention directive:`,
              abortSignal: AbortSignal.timeout(15000),              maxRetries: 0,
            })

            const interventionEvent: Log.EnhancedModelExecutionEvent = {
              timestamp: Date.now(),
              mainEpochId: "test", // placeholder, will be real in stream()
              event: "END_GENERATE",
              providerId: "local-side",
              phase: "Phase 2",
              metrics: { loop_detected: true, loop_type: loopType },
            }
            log.info(JSON.stringify(interventionEvent))

            return { error: `SYSTEM INTERVENTION: ${intervention.text}`, output: "", title: "", metadata: {} }
          }
        } catch (e) {
          log.error("Failed to generate intervention with local-side", { error: String(e) })
        }
      }
      return {
        error: `SYSTEM INTERVENTION: You are stuck in a ${isIdenticalLoop ? "loop calling this tool with the exact same arguments" : "repeated failure loop with this tool"}. Stop and reconsider your approach.`,
        output: "",
        title: "",
        metadata: {},
      }
    }
    return null
  }
}

