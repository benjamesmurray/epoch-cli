import { Provider } from "@/provider/provider"
import { Log } from "@/util/log"
import { SessionTelemetry } from "@/util/session-telemetry"
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
import { MessageV2 } from "./message-v2"
import { SanitizerMiddleware } from "./sanitizer"
import { Plugin } from "@/plugin"
import { SystemPrompt } from "./system"
import { PromptBuilder, type ZoneStructuredPayload } from "./prompt/builder"
import { Flag } from "@/flag/flag"
import { Permission } from "@/permission"
import { Auth } from "@/auth"
import { Installation } from "@/installation"
import { ToonEncoder } from "@/util/toon"
import { MCP } from "@/mcp/index"
import { StreamingMonitor } from "./llm/monitor"
import { SchemaContextLoader } from "@/mcp/schema-loader"

export namespace LLM {
  const log = Log.create({ service: "llm" })
  export const OUTPUT_TOKEN_MAX = ProviderTransform.OUTPUT_TOKEN_MAX

  interface SessionMetadata {
    phaseTurnCount: number
    lastPhase: string
    consecutiveFailures: Map<string, number>
  }

  const sessionMetadata = new Map<string, SessionMetadata>()

  export type StreamInput = {
    user: MessageV2.User
    sessionID: string
    parentSessionID?: string
    model: Provider.Model
    agent: Agent.Info
    permission?: Permission.Ruleset
    system: { zone1: string[]; zone2: string[] }
    operationalFacts?: string[]
    instructions?: string[]
    messages: ModelMessage[]
    small?: boolean
    yolo?: boolean
    isContinue?: boolean
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

  export function parseGroundTruthRules(raw: string, activePacks: string[] = ["core_interaction_pack"], contextLimit?: number): { operationalFacts: string; behavioralRules: string; projectSpecific: string } {
    const zones = {
      operationalFacts: "",
      behavioralRules: "",
      projectSpecific: "",
    }

    const zone1Match = raw.match(/(ZONE 1 & 3:.*?)(?=ZONE 2:|$)/s)
    if (zone1Match) {
      const factsStr = zone1Match[1]
      const factsRegex = /fact_\d+,\s*"[^"]+",\s*"[^"]+",\s*"([^"]+)"/g
      const extractedFacts: string[] = []
      let match
      while ((match = factsRegex.exec(factsStr)) !== null) {
        let fact = match[1]
        // TASK: Dynamic Context Limit Injection
        // If we have a dynamic limit, and this fact mentions the 32K limit, override it.
        if (contextLimit && fact.includes("context limit is strictly 32K")) {
           fact = `The environment context limit is strictly ${Math.round(contextLimit / 1000)}K tokens.`
        }
        extractedFacts.push(`- ${fact}`)
      }
      
      // If the fact was NOT in the TOON file but we have a limit, inject it at the top
      if (contextLimit && !extractedFacts.some(f => f.includes("context limit is strictly"))) {
          extractedFacts.unshift(`- The environment context limit is strictly ${Math.round(contextLimit / 1000)}K tokens.`)
      }

      if (extractedFacts.length > 0) {
        zones.operationalFacts = `ZONE 1 & 3: OPERATIONAL FACTS\n${extractedFacts.join("\n")}`
      } else {
        zones.operationalFacts = factsStr.trim()
      }
    }

    const zone2Match = raw.match(/(ZONE 2: BEHAVIORAL RULE PACKS.*?)(?=ZONE 3: PROJECT-SPECIFIC RULES|$)/s)
    if (zone2Match) {
      const zone2Str = zone2Match[1]
      
      const ruleIds = new Set<string>()
      for (const targetPack of activePacks) {
        const packRegex = new RegExp(`${targetPack}:\\s*\\[(.*?)\\]`)
        const packMatch = zone2Str.match(packRegex)
        if (packMatch) {
          packMatch[1].split(',').forEach((s: string) => {
            const id = s.trim().split('.').pop() || ""
            if (id) ruleIds.add(id)
          })
        }
      }
      
      if (ruleIds.size > 0) {
        const rulesRegex = /([a-z]+_\d+),\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"/g
        const extractedRules: string[] = []
        let rMatch
        while ((rMatch = rulesRegex.exec(zone2Str)) !== null) {
          if (ruleIds.has(rMatch[1])) {
             extractedRules.push(`Trigger: ${rMatch[2]}\nBehaviour: ${rMatch[3]}\nExample: ${rMatch[4]}\n`)
          }
        }
        
        if (extractedRules.length > 0) {
           zones.behavioralRules = `ZONE 2: BEHAVIORAL RULES\n\n${extractedRules.join("\n")}`
        } else {
           zones.behavioralRules = zone2Str.trim()
        }
      } else {
        zones.behavioralRules = zone2Str.trim()
      }
    }

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

    // Update Session Metadata for Turn Tracking & Stagnation Detection
    let meta = sessionMetadata.get(input.sessionID)
    if (!meta) {
      meta = { phaseTurnCount: 0, lastPhase: input.agent.name, consecutiveFailures: new Map() }
      sessionMetadata.set(input.sessionID, meta)
    }

    if (meta.lastPhase !== input.agent.name) {
      meta.phaseTurnCount = 0
      meta.lastPhase = input.agent.name
    }
    meta.phaseTurnCount++

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
        `Current Phase: [${input.agent.name.toUpperCase()}]. The Supervisor (Clerk) has restricted you to this phase.${input.agent.name !== "build" ? " If you are ready to write source code, you MUST use the object_to_supervisor tool to request a shift to the [BUILD] phase." : ""}`,
        "CONTINUITY MANDATE: You are operating in a multi-epoch session. The file '.epoch-continuity.toon' contains the definitive ground truth of your PREVIOUS actions and project state. Treat it as your primary memory. If the continuity report indicates a tool (e.g. sc_plan) was successful, do not repeat it, even if a tool output suggests it is the 'Next' step. Use the 'State Verdict' and 'Residual Blockers' sections to guide your immediate next tool choice.",
      ],
      zone2_context_files: [],
      zone3_active_cursor: [],
      zone4_guidelines: [],
    }

    if (input.operationalFacts && input.operationalFacts.length > 0) {
      payload.zone1_critical_rules.push(...input.operationalFacts)
    }

    if (input.system?.zone1) {
      payload.zone1_critical_rules.push(...input.system.zone1)
    }

    if (input.yolo) {
      payload.zone1_critical_rules.push(
        "CRITICAL: YOLO mode is active. You MUST execute tasks autonomously until the work is completely finished. " +
        "You are NOT allowed to stop and ask for user input. " +
        "When AND ONLY WHEN the entire job is done, you MUST call the 'task_complete' tool to terminate the session."
      )
    }

    if (input.instructions && input.instructions.length > 0) {
      payload.zone4_guidelines.push(...input.instructions)
    }

    // Phase Stagnation Detection (Task 3.2)
    if (input.agent.name === "plan" && meta.phaseTurnCount >= 8) {
      const nudge = `Supervisor Note: You have been in the [PLAN] phase for ${meta.phaseTurnCount} turns. If the implementation plan is complete and tasks are defined, you should run 'sc_approve' to transition to the [BUILD] phase.`
      payload.zone1_critical_rules.push(nudge)
      l.info("stagnation nudge", { turnCount: meta.phaseTurnCount })
    }

    let activeRulePacks: string[] = ["core_interaction_pack"];
    let thinkingEffort: "high" | "low" = "low";

    // Phase 1: Intent Classification (Clerk / local-side) - Task 1.1
    // The Clerk detects user intent and shifts the active epochcli Agent.
    if (provider.id === "local-main") {
      try {
        const sideModel = await Provider.getSideModel()
        if (sideModel) {
          const sideLanguage = await Provider.getLanguage(sideModel)

          // Extract conversation tail for structural context (Task 1.1)
          const tailCount = 10
          const recentMessages = input.messages.slice(-tailCount)
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
            l.debug("clerk", { message: `Using model: ${sideModel.providerID}/${sideModel.id} at ${sideProvider?.options?.baseURL}` });

            let groundTruths = "";
            try {
              const fsNode = await import("fs/promises");
              const rulesContext = await fsNode.readFile(".assistant_rules.toon", "utf-8");
              // Use an empty array for packs here since we just want operational facts for the Clerk
              const parsedRules = parseGroundTruthRules(rulesContext, [], sideModel.limit.context);
              if (parsedRules.operationalFacts) groundTruths = parsedRules.operationalFacts;
            } catch (e) {}

            l.debug("clerk", { message: "Supervising conversation..." });
            
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
            let recentScApprove = false;
            let consecutiveObjectionBroken = false;
            
            for (let i = input.messages.length - 1; i >= Math.max(0, input.messages.length - 8); i--) {
                const msg = input.messages[i];
                if (msg.role === "assistant" && Array.isArray(msg.content)) {
                    const objCall = msg.content.find(c => c.type === "tool-call" && c.toolName === "object_to_supervisor");
                    if (objCall && !consecutiveObjectionBroken) {
                        objectionCount++;
                        if (!requestedAgent) requestedAgent = (objCall as any).args.requestedAgent;
                    } else if (msg.content.some(c => c.type === "tool-call" && c.toolName !== "object_to_supervisor")) {
                        consecutiveObjectionBroken = true;
                    }
                    
                    const mcpxCall = msg.content.find(c => c.type === "tool-call" && c.toolName === "mcpx");
                    if (mcpxCall && (mcpxCall as any).args?.tool === "sc_approve") {
                        recentScApprove = true;
                    }
                }
            }

            // Concurrently identify agent, rule packs, and thinking effort
            const [identifiedAgentResult, identifiedPacks, identifiedEffort] = await Promise.all([
                (async () => {
                    const threshold = recentScApprove ? 1 : 2;
                    if (objectionCount >= threshold && requestedAgent) {
                        l.debug("clerk", { message: `Arbitration threshold reached (${objectionCount} objections, recentApprove: ${recentScApprove}). Overruling Supervisor with: ${requestedAgent}` });
                        return requestedAgent;
                    } else if (isOneShot && !planningFinished) {
                        l.debug("clerk", { message: "One-Shot planning in progress. Locking persona to: plan" });
                        return "plan";
                    } else {
                        return RuleRouter.identifyAgent(conversationTail, sideLanguage, groundTruths);
                    }
                })(),
                RuleRouter.identifyRulePacks(conversationTail, sideLanguage),
                RuleRouter.identifyThinkingEffort(conversationTail, sideLanguage)
            ]);

            identifiedAgent = identifiedAgentResult;
            activeRulePacks = identifiedPacks;
            thinkingEffort = identifiedEffort;

            l.debug("clerk", { message: `Identified agent: ${identifiedAgent}` });
            l.debug("clerk", { message: `Identified rule packs: ${activeRulePacks.join(", ")}` });
            l.debug("clerk", { message: `Identified thinking effort: ${thinkingEffort}` });
            
            if (identifiedAgent !== input.agent.name) {
                log.debug("Clerk identified agent shift", { from: input.agent.name, to: identifiedAgent });
                const newAgent = await Agent.get(identifiedAgent);
                if (newAgent) {
                    l.debug("clerk", { message: `SHIFTING agent to: ${identifiedAgent}` });
                    input.agent = newAgent;
                    // Update the directive in Zone 1
                    payload.zone1_critical_rules[0] = `Current Phase: [${input.agent.name.toUpperCase()}]. The Supervisor (Clerk) has restricted you to this phase.${input.agent.name !== "build" ? " If you are ready to write source code, you MUST use the object_to_supervisor tool to request a shift to the [BUILD] phase." : ""}`;
                }
            }
          }
        }
      } catch (e) {
        l.error("clerk", { message: "Intent classification failed", error: String(e) });
        log.warn("Clerk intent classification failed", { error: String(e) })
      }
    }

    if (provider.id === "local-main") {
      try {
        let rulesContext = ""
        const mcpClientsRecord = await MCP.clients()
        const mcpClients = Object.values(mcpClientsRecord) as any[]
        const gtCli = mcpClients.find((c: any) => c.id === "ground")
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
           const parsedRules = parseGroundTruthRules(rulesContext, activeRulePacks, input.model.limit.context);
           if (parsedRules.operationalFacts) {
               payload.zone1_critical_rules.push(parsedRules.operationalFacts)
           }
           if (parsedRules.behavioralRules) payload.zone2_context_files.push(parsedRules.behavioralRules)
           if (parsedRules.projectSpecific) payload.zone3_active_cursor.push(parsedRules.projectSpecific)
        }
      } catch (e) {
         log.warn("Phase 1 Pre-Generation Rules Context fetch failed", { error: String(e) })
      }
    }

    payload.zone2_context_files.push(
      [
        // use agent prompt otherwise provider prompt
        ...(input.agent.prompt ? [input.agent.prompt] : SystemPrompt.provider(input.model, input.isContinue)),
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

    const isWorkflow = language instanceof GitLabWorkflowLanguageModel
    const isGemma4 = input.model.api?.id?.includes("gemma-4") || input.model.api?.id?.includes("google-gemma-26b") || input.model.id?.includes("big-pickle")
    const isReasoningModel = input.model.capabilities.reasoning || isGemma4

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
          thinkingEffort: isReasoningModel ? thinkingEffort : undefined,
        })
    const options: Record<string, any> = pipe(
      base,
      mergeDeep(input.model.options),
      mergeDeep(input.agent.options),
      mergeDeep(variant),
    )
    if (input.operationalFacts && input.operationalFacts.length > 0) {
      options.operationalFacts = input.operationalFacts
    }
    if (isOpenaiOauth) {
      options.instructions = system.join("\n")
    }

    // Phase 1: Context Fetching (Clerk / local-side) - Task 1.4
    // Attempt to fetch localized file trees and active path from MCP servers and compress them
    if (provider.id === "local-main") {
      try {
        let mcpContext = ""
        const mcpxTool = input.tools["mcpx"]
        
        let activePath = "."
        
        if (mcpxTool) {
          try {
             log.debug("Fetching current state from spec via mcpx")
             const statusRes = await mcpxTool.execute!({ server: "spec", tool: "sc_status", flags: {} }, options as any)
             if (statusRes.content && statusRes.content.length > 0 && statusRes.content[0].type === "text") {
                const text = statusRes.content[0].text
                const featureMatch = text.match(/Feature: (.+)/)
                if (featureMatch) {
                    activePath = featureMatch[1].trim()
                }
                mcpContext += `Spec CLI Context:\n${ToonEncoder.encode({ active_feature: activePath, status: text })}\n`
             }
          } catch (e) {
             log.debug("Failed to fetch spec status via mcpx", { error: String(e) })
          }

          try {
             log.debug("Fetching localized map from map for path via mcpx", { activePath })
             const mapRes = await mcpxTool.execute!({ server: "map", tool: "pm_query", flags: { path: activePath } }, options as any)
             if (mapRes.content && mapRes.content.length > 0 && mapRes.content[0].type === "text") {
                 mcpContext += `Project Map Context:\n${ToonEncoder.encode({ localized_map: mapRes.content[0].text })}\n`
             }
          } catch (e) {
             log.debug("Failed to fetch map localized map via mcpx", { error: String(e) })
          }
        }
        
        if (mcpContext) {
            payload.zone1_critical_rules.push(mcpContext)
        }
      } catch (e) {
        log.warn("Phase 1 Pre-Generation MCP Context fetch failed", { error: String(e) })
      }
    }

    // Positional Prompt Architecture: Assemble Zone-based messages
    const initialMessages = PromptBuilder.buildMessages(payload, {
      isGemma4,
      thinkingEffort: isReasoningModel ? thinkingEffort : undefined
    })
    const systemContent = initialMessages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")
    const otherInitial = initialMessages.filter((m) => m.role !== "system")

    const internalStateCheck = `
<|channel>thought
[INTERNAL STATE CHECK]
- Mode: ${thinkingEffort.toUpperCase()} thinking / Adaptive efficiency active.
- Role: Assigned to [${input.agent.name.toUpperCase()}].
- Constraint: ${Math.round(input.model.limit.context / 1000)}K token budget. Concise CoT.
Ready to process user request strictly under these parameters.
`.trim()

    // Truncate older proactive validation errors to prevent streaming loops and context bloat
    let validationErrorCount = 0;
    for (let i = input.messages.length - 1; i >= 0; i--) {
      const msg = input.messages[i];
      if (msg.role === 'tool' && Array.isArray(msg.content)) {
        for (let j = 0; j < msg.content.length; j++) {
          const part: any = msg.content[j];
          if (part.type === 'tool-result' && part.isError && typeof part.result === 'string' && part.result.includes('INVALID ARGUMENTS:')) {
            validationErrorCount++;
            if (validationErrorCount > 2) {
              part.result = 'INVALID ARGUMENTS: [TRUNCATED - Refer to most recent validation error]';
            }
          }
        }
      }
    }

    const messages = isOpenaiOauth
      ? input.messages
      : isWorkflow
        ? input.messages
        : mergeMessages([
            ...otherInitial,
            ...input.messages,
            { role: "user" as const, content: internalStateCheck },
          ])

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
          
          let result;
          let isError = false;
          try {
            result = await originalExecute(args, options)
          } catch (e: any) {
            result = e;
            isError = true;
          }

          const resultStr = typeof result === 'string' ? result : (result instanceof Error ? String(result.message || result) : JSON.stringify(result))
          
          // Task 1.1: Auto-Fallback for sc_guidance prerequisite
          if (resultStr.includes("You must run `spec sc_guidance`") || resultStr.includes("You must run \\`spec sc_guidance\\`")) {
            log.info("Auto-fallback triggered for missing prerequisite sc_guidance")
            let guidanceOutput = ""
            try {
              const allTools = resolveTools(input)
              const guidanceToolKey = Object.keys(allTools).find(k => k.includes("sc_guidance"))
              if (guidanceToolKey && allTools[guidanceToolKey] && allTools[guidanceToolKey].execute) {
                const guidanceResult = await allTools[guidanceToolKey].execute!({}, options)
                guidanceOutput = typeof guidanceResult === 'string' ? guidanceResult : JSON.stringify(guidanceResult)
              } else if (allTools["mcpx"] && allTools["mcpx"].execute) {
                const guidanceResult = await allTools["mcpx"].execute!({ server: "spec", tool: "sc_guidance", flags: {} }, options)
                guidanceOutput = typeof guidanceResult === 'string' ? guidanceResult : JSON.stringify(guidanceResult)
              }
            } catch (fallbackError) {
              guidanceOutput = "Failed to auto-execute sc_guidance: " + String(fallbackError)
            }
            
            const hybridResponse = "System overriding sc_approve. Prerequisite missing. Auto-executing sc_guidance. Here is the guidance you must review... Read this, then you may call sc_approve.\n\n" + guidanceOutput;
            if (isError) {
                return hybridResponse;
            } else {
                return hybridResponse;
            }
          }

          // Task 2.1 & 2.2: Clerk Interceptor (Middleware) for generic prerequisite errors
          if (isError && (resultStr.includes("You must run") || resultStr.includes("prerequisite"))) {
             if (provider.id === "local-main") {
                 try {
                     log.info("Triggering Clerk Interceptor for prerequisite error")
                     const sideModel = await Provider.getSideModel()
                     if (sideModel) {
                        const sideLanguage = await Provider.getLanguage(sideModel)
                        
                        // Build history string
                        const tailCount = 5;
                        const recentMessages = (options.messages ?? input.messages).slice(-tailCount);
                        const historyStr = recentMessages.map((m: any) => `${m.role}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content).slice(0, 200)}`).join("\n")
                        
                        const systemPrompt = "Look at the last tool error and the chat history. Write a concise, commanding one-sentence instruction telling the main agent exactly which tool to use next to resolve the prerequisite."
                        const prompt = `History:\n${historyStr}\n\nTool Error:\n${resultStr}\n\nDirective:`
                        
                        const { generateText } = await import("ai")
                        const res = await generateText({
                          model: sideLanguage,
                          system: systemPrompt,
                          prompt: prompt,
                          abortSignal: AbortSignal.timeout(10000),
                          maxRetries: 0,
                        })
                        
                        const clerkText = res.text.trim()
                        if (clerkText) {
                            log.info("Clerk interceptor generated directive", { directive: clerkText })
                            throw new Error(`CRITICAL SYSTEM DIRECTIVE: ${clerkText}\n\nOriginal Error:\n${resultStr}`)
                        }
                     }
                 } catch (clerkErr) {
                     log.warn("Clerk interceptor failed", { error: String(clerkErr) })
                 }
             }
          }

          if (isError) {
             throw result;
          }
          return result
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
      system: systemContent,
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
                   log.debug("Attempting to repair broken JSON tool call with local-side Clerk")
                   const sideModel = await Provider.getSideModel()
                   if (!sideModel) return failed.toolCall
                   const sideLanguage = await Provider.getLanguage(sideModel)
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
                     l.info("json repair", repairEvent)

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
              if (args.type === "stream" || args.type === "generate") {
                const targetMessages = ProviderTransform.message(args.params.prompt as ModelMessage[], input.model, options)
                const targetKey = ProviderTransform.sdkKey(input.model.api.npm) ?? input.model.providerID
                const isAzure = input.model.api.npm === "@ai-sdk/azure"
                args.params.prompt = SanitizerMiddleware.stripProviderOptions(targetMessages, targetKey, isAzure)
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
                contextLimit: input.model.limit.context,
                toolCount: Object.keys(tools).length,
                payload: truncatedPayload,
                tools: Flag.EPOCHCLI_DEBUG_FULL_PROMPT ? tools : undefined
              }
              l.debug("model execution start", startEvent)
              SessionTelemetry.emitModelEvent(startEvent)

              try {                const res = await doGenerate()
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
                    completionTokens: (res.usage as any)?.completionTokens,
                    tps: (res.usage as any)?.completionTokens ? ((res.usage as any).completionTokens / ((endTime - startTime) / 1000)) : undefined
                  }
                  }
                  SessionTelemetry.emitModelEvent(endEvent)

                  l.debug("model execution end", endEvent)
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
                l.error("model execution error", errorEvent)
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
                contextLimit: input.model.limit.context,
                toolCount: Object.keys(tools).length,
                payload: truncatedPayload,
                tools: Flag.EPOCHCLI_DEBUG_FULL_PROMPT ? tools : undefined
              }
              l.debug("model execution start", startEvent)
              SessionTelemetry.emitModelEvent(startEvent)

              try {                const { stream, ...rest } = await doStream()
                let firstTokenTime: number | undefined
                let tokenCount = 0
                const monitor = new StreamingMonitor()

                const iterator = (async function* () {
                   for await (const chunk of (stream as any)) {
                      const textDelta = chunk.textDelta ?? chunk.delta
                      if (!firstTokenTime && chunk.type === "text-delta" && textDelta) {
                         firstTokenTime = Date.now()
                      }
                      if (chunk.type === "text-delta" || chunk.type === "tool-call-delta") {
                         tokenCount++
                      }

                      if (chunk.type === "text-delta" && typeof textDelta === "string") {
                        if (monitor.push(textDelta)) {
                           const offendingText = monitor.getOffendingText()
                           l.warn("Streaming loop detected, aborting...", { offendingText })

                           // Signal abortion to the provider if possible (though we only have the signal)
                           try {
                             (input.abort as any).dispatchEvent?.(new Event("abort"))
                           } catch (e) {}

                           yield {
                             type: "text-delta",
                             textDelta: `\n\n[SYSTEM INTERVENTION: Thinking loop detected. Offending sequence: "${offendingText}". Generation aborted.]`,
                             delta: `\n\n[SYSTEM INTERVENTION: Thinking loop detected. Offending sequence: "${offendingText}". Generation aborted.]`
                           } as any
                           return
                        }
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
                            tps: (tokenCount && firstTokenTime) ? (tokenCount / ((endTime - firstTokenTime) / 1000)) : undefined,
                            promptTokens: (await (rest as any).usage)?.promptTokens,
                            completionTokens: (await (rest as any).usage)?.completionTokens,
                            loop_detected: monitor.getOffendingText() !== undefined
                          }
                        }
                        l.debug("model execution end", endEvent)
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
                      l.error("model execution error", errorEvent)
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
                l.error("model execution error", errorEvent)
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
                         if (chunk.type === "text-delta") {
                            if (typeof chunk.textDelta === "string") {
                               chunk.textDelta = chunk.textDelta.replace(/<\|">/g, "```")
                            }
                            if (typeof chunk.delta === "string") {
                               chunk.delta = chunk.delta.replace(/<\|">/g, "```")
                            }
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

  function mergeMessages(messages: ModelMessage[]): ModelMessage[] {
    const result: ModelMessage[] = []
    for (const msg of messages) {
      const last = result[result.length - 1]
      if (last && last.role === msg.role) {
        if (typeof last.content === "string" && typeof msg.content === "string") {
          last.content += "\n\n" + msg.content
          continue
        }
        if (Array.isArray(last.content) && Array.isArray(msg.content)) {
          ;(last.content as any[]).push(...msg.content)
          continue
        }
      }
      result.push(msg)
    }
    return result
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

  /**
   * Normalizes mcpx tool arguments (pos/flags) into a single object for validation.
   */
  function normalizeMcpxArguments(args: any): Record<string, any> {
    const normalized: Record<string, any> = {};
    
    // Extract from flags
    if (args.flags && typeof args.flags === 'object') {
      Object.assign(normalized, args.flags);
    }
    
    // Extract from args (heuristic for common patterns)
    if (Array.isArray(args.args)) {
      for (let i = 0; i < args.args.length; i++) {
        const arg = args.args[i];
        if (typeof arg === 'string' && arg.startsWith('--')) {
          const parts = arg.slice(2).split('=');
          const key = parts[0];
          const val = parts.length > 1 ? parts[1] : args.args[i+1];
          if (key) {
            normalized[key] = val;
            if (parts.length === 1) i++; // skip next since it was used as value
          }
        }
      }
    }
    
    return normalized;
  }

  /**
   * Performs a proactive validation turn with the Clerk.
   */
  async function validateArgumentsProactively(input: {
    toolName: string,
    args: any,
    schema: any,
    provider: any,
    cfg: Config.Info,
    isMcpx?: boolean,
    mcpxServer?: string,
    l: any
  }): Promise<string | null> {
    try {
      const sideModel = await Provider.getSideModel()
      if (!sideModel) return null
      const sideLanguage = await Provider.getLanguage(sideModel)

      const systemPrompt = input.isMcpx
        ? `You are a tool argument validator. The user is attempting to call a sub-tool via the 'mcpx' tool wrapper. Compare the proposed SUB-TOOL arguments with the provided JSON schema. If they are valid, output 'VALID'. If they are invalid, output 'INVALID: <concise_reason> EXAMPLE: <strict_valid_json_example>'. You MUST explicitly explain what was missing or incorrect.
        
CRITICAL: Your JSON example MUST be formatted for the 'mcpx' wrapper tool. 
- Servers like 'spec' and 'map' often use positional arguments.
- Positional arguments (like 'sc_status', 'pm_query', or specific paths) MUST be passed in the 'args' array of strings.
- Named flags (like --path) should be in the 'flags' record.
- EXAMPLE for 'spec sc_status': \`{ "server": "spec", "tool": "sc_status", "args": [] }\` (or with specific sub-args in the array).
- Your output MUST be a JSON object containing "server", "tool", and "args" (and/or "flags").`
        : `You are a tool argument validator. Compare the proposed arguments with the provided JSON schema. If they are valid, output 'VALID'. If they are invalid, output 'INVALID: <concise_reason> EXAMPLE: <strict_valid_json_example>'. You MUST explicitly explain what was missing or incorrect, and provide a strict, concrete JSON example of what the valid arguments should look like according to the schema.`;

      const prompt = `Tool: ${input.toolName}\nProposed Args: ${JSON.stringify(input.args)}\nSchema: ${JSON.stringify(input.schema)}`;

      const res = await generateText({
        model: sideLanguage,
        system: systemPrompt,
        prompt: `${prompt}\n\nValidation Result:`,
        abortSignal: AbortSignal.timeout(10000),
        maxRetries: 0,
      });

      const result = res.text.trim();
      if (result.startsWith('INVALID')) {
        return result.replace(/^INVALID:\s*/, '');
      }
      return null;
    } catch (e) {
      input.l.warn("Proactive validation failed", { error: String(e) });
      return null; // Graceful fall-through
    }
  }

  export async function interceptToolLoop(input: {
    toolName: string
    args: any
    messages: ModelMessage[]
    provider: any
    cfg: Config.Info
  }) {
    const l = log.clone();
    l.error(`!!! DEBUG: interceptToolLoop called for ${input.toolName}. History length: ${input.messages.length}`)

    // Task: Proactive Validation (Clerk / local-side)
    if (input.provider.id === "local-main") {
      try {
        let schemaToolName = input.toolName;
        let validationArgs = input.args;

        let schema: any = undefined;

        let isMcpx = false;
        let mcpxServer = "";

        // Specialized handling for mcpx sub-tools
        if (input.toolName === "mcpx" && input.args.server && input.args.tool) {
           isMcpx = true;
           mcpxServer = input.args.server;
           schemaToolName = input.args.tool;
           validationArgs = normalizeMcpxArguments(input.args);
           schema = await SchemaContextLoader.getMcpxToolSchema(
             input.args.server, 
             input.args.tool, 
             input.cfg.mcpx?.binaryPath
           );
        } else {
           schema = await SchemaContextLoader.getToolSchema(schemaToolName);
        }

        if (schema) {
          log.info("Performing proactive validation", { tool: schemaToolName });
          const hint = await validateArgumentsProactively({
            toolName: schemaToolName,
            args: validationArgs,
            schema,
            provider: input.provider,
            cfg: input.cfg,
            isMcpx,
            mcpxServer,
            l
          });

          if (hint) {
            log.info("Proactive validation caught error", { tool: schemaToolName, hint });
            return {
              error: `INVALID ARGUMENTS: ${hint}`,
              output: "",
              title: "Argument Validation",
              metadata: { schema_validated: true, proactive: true },
            };
          }
        }
      } catch (e) {
        l.warn("Proactive validation turn failed", { error: String(e) });
      }
    }

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

    console.error(`!!! DEBUG: backward scan starting. messages.length: ${input.messages.length}`)
    // Scan backwards through messages
    for (let i = input.messages.length - 1; i >= 0; i--) {
      if (!identicalChainActive && !failureChainActive) break

      const msg = input.messages[i]
      console.error(`!!! DEBUG: turn ${i} role: ${msg.role} is_array: ${Array.isArray(msg.content)}`)

      if (msg.role === "assistant" && Array.isArray(msg.content)) {
        console.error(`!!! DEBUG: turn ${i} is assistant array. length: ${msg.content.length}`)
        for (const part of msg.content) {
            console.error(`!!! DEBUG: part type: ${part.type}`)
            if (part.type === "tool-call") {
                const tName = (part as any).toolName || (part as any).name
                const tArgs = (part as any).args
                console.error(`!!! DEBUG: found tool-call part. name: ${tName}`)
                if (tName === input.toolName) {
                    const callArgs = tArgs
                    l.error(`!!! DEBUG: tool name match!`)
                    
                    // Identical arguments chain
                    if (identicalChainActive) {
                        if (JSON.stringify(callArgs) === JSON.stringify(input.args)) {
                            identicalCount++
                            l.error(`!!! DEBUG: identical match! count: ${identicalCount}`)
                        } else {
                            identicalChainActive = false
                            l.error(`!!! DEBUG: identical chain broken`)
                        }
                    }
                    
                    // Sequential failures chain
                    if (failureChainActive) {
                        attemptedArgs.push(callArgs)
                        const nextMsg = input.messages[i + 1]
                        if (nextMsg && nextMsg.role === "user" && Array.isArray(nextMsg.content)) {
                            const result = (nextMsg.content as any[]).find(
                                (c) => c.type === "tool-result" && (c.toolCallId === (part as any).toolCallId || c.toolCallId === (part as any).id),
                            )
                            if (result && (result as any).isError) {
                                sequentialFailureCount++
                            } else if (result) {
                                failureChainActive = false
                            }
                        }
                    }
                }
            }
        }
      } else if (msg.role === "user" && typeof msg.content === "string") {
        // User interrupted or added new text
        identicalChainActive = false
        failureChainActive = false
      }
    }

    const isIdenticalLoop = identicalCount >= 1
    const isFailureLoop = sequentialFailureCount >= 3

    // Schema-Aware Error Recovery (Task 2.2)
    if (sequentialFailureCount >= 2 && !isIdenticalLoop && !isFailureLoop) {
      try {
        const schema = await SchemaContextLoader.getToolSchema(input.toolName)
        if (schema && input.provider.id === "local-main") {
          log.debug("Generating schema-aware correction hint with local-side Clerk")
          const sideModel = await Provider.getSideModel()
          if (!sideModel) return null
          const sideLanguage = await Provider.getLanguage(sideModel)

          const systemPrompt =            "You are a tool argument validator. Compare the failed arguments with the provided JSON schema. Identify the mistake and provide a concise, helpful correction hint. Do not be verbose. Example: 'You are using --path, but sc_guidance accepts no arguments. Try calling it without flags.'"

          const prompt = `Tool: ${input.toolName}\nFailed Args: ${JSON.stringify(input.args)}\nSchema: ${JSON.stringify(schema)}`

          const hint = await generateText({
            model: sideLanguage,
            system: systemPrompt,
            prompt: `${prompt}\n\nCorrection Hint:`,
            abortSignal: AbortSignal.timeout(10000),
            maxRetries: 0,
          })

          return {
            error: `INVALID ARGUMENTS: ${hint.text}`,
            output: "",
            title: "Argument Validation",
            metadata: { schema_validated: true },
          }
        }
      } catch (e) {
        log.warn("Failed to generate schema-aware hint", { error: String(e) })
      }
    }

    if (isIdenticalLoop || isFailureLoop) {
      const loopType = isIdenticalLoop ? "IDENTICAL_ARGS" : "SEQUENTIAL_FAILURES"
      log.warn(`Loop detected for tool ${input.toolName}`, { toolName: input.toolName, args: input.args, loopType, sequentialFailureCount })

      // Use local-side to generate an intervention
      if (input.provider.id === "local-main") {
        try {
          const sideProviderConfig = input.cfg.provider?.["local-side"]
          if (sideProviderConfig) {
            log.debug("Generating intervention directive with local-side Clerk")
            const sideModel = await Provider.getSideModel()
            if (!sideModel) return null
            const sideLanguage = await Provider.getLanguage(sideModel)

            let continuityContext = ""
            const systemMessage = input.messages.find((m) => m.role === "system")
            if (systemMessage && typeof systemMessage.content === "string") {              const match = systemMessage.content.match(/epoch_continuity:[\s\S]*?(?=\n\n|$)/)
              if (match) {
                continuityContext = `\n\nContext (Epoch Continuity Report):\n${match[0]}\n`
              }
            }

            const systemPrompt =
              "You are an AI supervisor monitoring a main agent. The main agent is stuck in a doom loop or has stagnated. Analyze the recent failed attempts and the provided Context (if any). Provide a concise, stern directive telling the agent to STOP calling this tool or repeating this behavior. Explain why its current approach is failing, and suggest a specific actionable alternative strategy based on the Context. Do not output anything other than the directive."

            const prompt = isIdenticalLoop
              ? `Tool: ${input.toolName}\nArgs: ${JSON.stringify(input.args)}\nStatus: Stuck in an infinite loop with identical arguments.${continuityContext}`
              : `Tool: ${input.toolName}\nRecent Failed Attempts:\n${attemptedArgs
                  .reverse()
                  .map((a, idx) => `${idx + 1}. ${JSON.stringify(a)}`)
                  .join("\n")}\nStatus: Stuck in a trial-and-error loop where all recent attempts have failed.${continuityContext}`

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
            log.info("intervention", interventionEvent)

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

