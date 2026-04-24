import { Effect, Layer, ServiceMap, Scope, Exit, Cause } from "effect"
import { generateText } from "ai"
import { SessionID, MessageID, PartID } from "../schema"
import { MessageV2 } from "../message-v2"
import { Instance } from "../../project/instance"
import { Log } from "../../util/log"
import { Session } from "../index"
import { Agent } from "../../agent/agent"
import { Provider } from "../../provider/provider"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import * as Stream from "effect/Stream"
import { Shell } from "../../shell/shell"
import { Process } from "../../util/process"
import { Plugin } from "../../plugin"
import { NamedError } from "@epoch-ai/util/error"
import { ulid } from "ulid"
import { InstanceState } from "@/effect/instance-state"
import { InputResolver } from "./resolver"
import { ToolOrchestrator } from "./orchestrator"
import { SessionStatus } from "../status"
import { SessionCompaction } from "../compaction"
import { SessionProcessor } from "../processor"
import { Instruction } from "../instruction"
import { SystemPrompt } from "../system"
import { SessionSummary } from "../summary"
import { Bus } from "../../bus"
import { PostGenerationWorker } from "../worker"
import { STRUCTURED_OUTPUT_SYSTEM_PROMPT } from "./utils"
import path from "path"
import type { ShellInput } from "./types"
import MAX_STEPS from "./max-steps.txt"

export namespace SessionEngine {
  const log = Log.create({ service: "session.prompt.engine" })

  export interface Interface {
    readonly runLoop: (sessionID: SessionID, yolo?: boolean) => Effect.Effect<MessageV2.WithParts>
    readonly shellImpl: (input: ShellInput, signal: AbortSignal) => Effect.Effect<MessageV2.WithParts>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionPrompt/Engine") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const scope = yield* Scope.Scope
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      const agents = yield* Agent.Service
      const provider = yield* Provider.Service
      const plugin = yield* Plugin.Service
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
      const status = yield* SessionStatus.Service
      const compaction = yield* SessionCompaction.Service
      const processor = yield* SessionProcessor.Service
      const instruction = yield* Instruction.Service
      const resolver = yield* InputResolver.Service
      const orchestrator = yield* ToolOrchestrator.Service

      const lastAssistant = (sessionID: SessionID) =>
        Effect.promise(async () => {
          let latest: MessageV2.WithParts | undefined
          for await (const item of MessageV2.stream(sessionID)) {
            latest ??= item
            if (item.info.role !== "user") return item
          }
          if (latest) return latest
          throw new Error("Impossible")
        })

      const shellImpl = Effect.fn("SessionPrompt.shellImpl")(function* (input: ShellInput, signal: AbortSignal) {
        const ctx = yield* InstanceState.context
        const session = yield* sessions.get(input.sessionID)
        const agent = yield* agents.get(input.agent)
        if (!agent) {
          const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
          const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
          const error = new NamedError.Unknown({ message: `Agent not found: "${input.agent}".${hint}` })
          yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
          throw error
        }
        const model = input.model ?? agent.model ?? (yield* resolver.lastModel(input.sessionID))
        const userMsg: MessageV2.User = {
          id: input.messageID ?? MessageID.ascending(),
          sessionID: input.sessionID,
          time: { created: Date.now() },
          role: "user",
          agent: input.agent,
          model: { providerID: model.providerID, modelID: model.modelID },
        }
        yield* sessions.updateMessage(userMsg)
        const userPart: MessageV2.Part = {
          type: "text",
          id: PartID.ascending(),
          messageID: userMsg.id,
          sessionID: input.sessionID,
          text: "The following tool was executed by the user",
          synthetic: true,
        }
        yield* sessions.updatePart(userPart)

        const msg: MessageV2.Assistant = {
          id: MessageID.ascending(),
          sessionID: input.sessionID,
          parentID: userMsg.id,
          mode: input.agent,
          agent: input.agent,
          cost: 0,
          path: { cwd: ctx.directory, root: ctx.worktree },
          time: { created: Date.now() },
          role: "assistant",
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: model.modelID,
          providerID: model.providerID,
        }
        yield* sessions.updateMessage(msg)
        const part: MessageV2.ToolPart = {
          type: "tool",
          id: PartID.ascending(),
          messageID: msg.id,
          sessionID: input.sessionID,
          tool: "bash",
          callID: ulid(),
          state: {
            status: "running",
            time: { start: Date.now() },
            input: { command: input.command },
          },
        }
        yield* sessions.updatePart(part)

        const sh = Shell.preferred()
        const shellName = (
          process.platform === "win32" ? path.win32.basename(sh, ".exe") : path.basename(sh)
        ).toLowerCase()
        const invocations: Record<string, { args: string[] }> = {
          nu: { args: ["-c", input.command] },
          fish: { args: ["-c", input.command] },
          zsh: {
            args: [
              "-l",
              "-c",
              `
                __oc_cwd=$PWD
                [[ -f ~/.zshenv ]] && source ~/.zshenv >/dev/null 2>&1 || true
                [[ -f "\${ZDOTDIR:-$HOME}/.zshrc" ]] && source "\${ZDOTDIR:-$HOME}/.zshrc" >/dev/null 2>&1 || true
                cd "$__oc_cwd"
                eval ${JSON.stringify(input.command)}
              `,
            ],
          },
          bash: {
            args: [
              "-l",
              "-c",
              `
                __oc_cwd=$PWD
                shopt -s expand_aliases
                [[ -f ~/.bashrc ]] && source ~/.bashrc >/dev/null 2>&1 || true
                cd "$__oc_cwd"
                eval ${JSON.stringify(input.command)}
              `,
            ],
          },
          cmd: { args: ["/c", input.command] },
          powershell: { args: ["-NoProfile", "-Command", input.command] },
          pwsh: { args: ["-NoProfile", "-Command", input.command] },
          "": { args: ["-c", input.command] },
        }

        const args = (invocations[shellName] ?? invocations[""]).args
        const cwd = ctx.directory
        const shellEnv = yield* plugin.trigger(
          "shell.env",
          { cwd, sessionID: input.sessionID, callID: part.callID },
          { env: {} },
        )

        const cmd = ChildProcess.make(sh, args, {
          cwd,
          extendEnv: true,
          env: { ...shellEnv.env, TERM: "dumb" },
          stdin: "ignore",
          forceKillAfter: "3 seconds",
        })

        let output = ""
        let aborted = false

        const finish = Effect.uninterruptible(
          Effect.gen(function* () {
            if (aborted) {
              output += "\n\n" + ["<metadata>", "User aborted the command", "</metadata>"].join("\n")
            }
            if (!msg.time.completed) {
              msg.time.completed = Date.now()
              yield* sessions.updateMessage(msg)
            }
            if (part.state.status === "running") {
              part.state = {
                status: "completed",
                time: { ...part.state.time, end: Date.now() },
                input: part.state.input,
                title: "",
                metadata: { output, description: "" },
                output,
              }
              yield* sessions.updatePart(part)
            }
          }),
        )

        const exit = yield* Effect.gen(function* () {
          const handle = yield* spawner.spawn(cmd)
          yield* Stream.runForEach(Stream.decodeText(handle.all), (chunk) =>
            Effect.sync(() => {
              output += chunk
              if (part.state.status === "running") {
                part.state.metadata = { output, description: "" }
                void Effect.runFork(sessions.updatePart(part))
              }
            }),
          )
          yield* handle.exitCode
        }).pipe(
          Effect.scoped,
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              aborted = true
            }),
          ),
          Effect.orDie,
          Effect.ensuring(finish),
          Effect.exit,
        )

        if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)) {
          return yield* Effect.failCause(exit.cause)
        }

        return { info: msg, parts: [part] }
      })

      const runLoop: (sessionID: SessionID, yolo?: boolean) => Effect.Effect<MessageV2.WithParts> = Effect.fn("SessionPrompt.run")(
        function* (sessionID: SessionID, yolo?: boolean) {
          const ctx = yield* InstanceState.context
          let structured: unknown | undefined
          let step = 0
          let stallScore = 0
          const toolHistory: { tool: string; input: any }[] = []
          
          // Tools that move the project state forward
          const ADVANCING_TOOLS = ["edit", "write", "task_complete", "sc_todo_complete", "sc_archive"]
          // Tools that are neutral (read-only or state setup)
          const NEUTRAL_TOOLS = ["read", "grep", "glob", "ls", "pm_query", "sc_status", "sc_guidance", "sc_todo_list", "gt_status", "sc_init", "sc_plan", "sc_approve"]
          // Tools that indicate a failure or stuck state
          const INVALID_TOOLS = ["invalid"]

          const MAX_TURNS = 50
          while (true) {
            const session = yield* sessions.get(sessionID)
            if (step > MAX_TURNS) {
              log.error("MAX_TURNS exceeded. Forcing session termination.", { sessionID, step })
              break
            }
            yield* status.set(sessionID, { type: "busy" })
            log.info("loop", { step, sessionID })

            let msgs = yield* MessageV2.filterCompactedEffect(sessionID)

            let lastUser: MessageV2.User | undefined
            let lastAssistantMsgObj: MessageV2.Assistant | undefined
            let lastFinished: MessageV2.Assistant | undefined
            let tasks: (MessageV2.CompactionPart | MessageV2.SubtaskPart)[] = []
            for (let i = msgs.length - 1; i >= 0; i--) {
              const msg = msgs[i]
              if (!lastUser && msg.info.role === "user") lastUser = msg.info
              if (!lastAssistantMsgObj && msg.info.role === "assistant") lastAssistantMsgObj = msg.info
              if (!lastFinished && msg.info.role === "assistant" && msg.info.finish) lastFinished = msg.info
              if (lastUser && lastFinished) break
              const task = msg.parts.filter((part) => part.type === "compaction" || part.type === "subtask")
              if (task && !lastFinished) tasks.push(...task)
            }

            if (!lastUser) throw new Error("No user message found in stream. This should never happen.")

            const lastAssistantMsg = msgs.findLast(
              (msg) => msg.info.role === "assistant" && msg.info.id === lastAssistantMsgObj?.id,
            )
            const toolParts = lastAssistantMsg?.parts.filter((part): part is MessageV2.ToolPart => part.type === "tool") ?? []
            const hasToolCalls = toolParts.length > 0

            // Update stall score
            const isAdvancing = toolParts.some((p) => ADVANCING_TOOLS.includes(p.tool))
            const isInvalid = toolParts.some((p) => INVALID_TOOLS.includes(p.tool))
            const lastTurnTools = toolHistory.slice(-toolParts.length)
            const isIdenticalRepetition =
              toolParts.length > 0 &&
              JSON.stringify(toolParts.map((p) => ({ t: p.tool, i: p.state.input }))) ===
                JSON.stringify(lastTurnTools.map((p) => ({ t: p.tool, i: p.input })))

            let stallReason: "repetition" | "neutral" | "invalid_args" | undefined
            const offendingTools = toolParts.map((p) => p.tool)

            if (isAdvancing) {
              stallScore = 0
            } else if (isIdenticalRepetition) {
              stallScore += 5
              stallReason = "repetition"
            } else if (isInvalid) {
              stallScore += 5
              stallReason = "invalid_args"
            } else if (toolParts.length > 0) {
              stallScore += 1
              stallReason = "neutral"
            }

            for (const part of toolParts) {
              if (part.state.status !== "pending") {
                toolHistory.push({ tool: part.tool, input: part.state.input })
                if (toolHistory.length > 10) toolHistory.shift()
              }
            }

            if (stallScore >= 15) {
              log.error("Terminal stagnation detected - triggering intervention", {
                sessionID,
                stallScore,
                stallReason,
                offendingTools,
                toolHistory,
              })
              const hintStr = `Stall Reason: ${stallReason}. Offending Tools: ${offendingTools.join(", ")}`
              yield* sessions.setInterventionHint({ sessionID, hint: hintStr })
              yield* sessions.setInterventionRequested({ sessionID, requested: true })
              stallScore = 0 // Reset to allow recovery turn
              continue // Loop back to pick up the intervention in Phase 1
            }

            if (stallScore >= 10 && yolo) {
              log.warn("Stall detected - injecting nudge", { sessionID, stallScore, stallReason, offendingTools })
              stallScore = 0 // Reset to allow recovery turn
              let nudgeText =
                "[System: You appear to be stalling or repeating operations without making progress. Please reconsider your strategy or attempt a more direct action to advance the project state.]"

              if (stallReason === "invalid_args" && toolParts.some((p) => (p.state as any).input?.tool === "mcpx" || p.tool === "mcpx")) {
                nudgeText =
                  "[System: Your last mcpx tool calls failed due to invalid syntax. REMINDER: positional flags like '--name' MUST be passed as an array of strings in the 'args' parameter, NOT as keys in the 'flags' object. Please run 'mcpx spec --help' to verify the interface.]"
              }

              const newMsgId = MessageID.ascending()
              const newUserMsg: MessageV2.User = {
                id: newMsgId,
                sessionID,
                role: "user",
                time: { created: Date.now() },
                model: lastUser.model,
                agent: lastUser.agent,
              }
              yield* sessions.updateMessage(newUserMsg)
              yield* sessions.updatePart({
                id: PartID.ascending(),
                sessionID,
                messageID: newMsgId,
                type: "text",
                synthetic: true,
                text: nudgeText,
              })
              lastUser = newUserMsg
              // Reset and continue the loop to trigger a new generation with the nudge
              stallScore = 0
              continue
            }

            if (
              lastAssistantMsgObj?.finish &&
              !["tool-calls"].includes(lastAssistantMsgObj.finish) &&
              !hasToolCalls &&
              lastUser.id < lastAssistantMsgObj.id
            ) {
              const isYolo = session.yolo || yolo || msgs.some(m => m.info.role === "user" && m.parts.some(p => p.type === "text" && p.text.includes("[System: YOLO mode enabled")));
              const hasTaskComplete = msgs.some(m => m.info.role === "assistant" && m.parts.some(p => p.type === "tool" && p.tool === "task_complete"));

              if (isYolo && !hasTaskComplete) {
                log.info("YOLO mode active. Auto-continuing after text response.", { sessionID })
                
                let nudgeText = "[SYSTEM: You provided a text response but have not yet called 'task_complete'. In YOLO mode, you must continue until the entire task is finished. If you are actually done, call 'task_complete' now. Otherwise, proceed with the next logical step (e.g., sc_plan, sc_approve, or implementation).]"
                
                // Dynamically find the last spec status to provide a better nudge
                const lastSpecMsg = [...msgs].reverse().find(m => 
                    m.parts.some(p => p.type === "tool" && p.state.status === "completed" && 
                    (p.tool === "sc_status" || (p.tool === "bash" && typeof p.state.output === "string" && p.state.output.includes("Project:"))))
                );
                const lastSpecPart = lastSpecMsg?.parts.find((p): p is MessageV2.ToolPart => p.type === "tool" && p.state.status === "completed");
                const specOutput = lastSpecPart && lastSpecPart.state.status === "completed" ? lastSpecPart.state.output : undefined;

                if (specOutput) {
                    const nextStepMatch = specOutput.match(/Next Step: (.*)/);
                    const nextStep = nextStepMatch ? nextStepMatch[1].trim() : "Unknown";
                    
                    if (specOutput.includes("All tasks completed")) {
                        nudgeText = `[SYSTEM: All tasks are marked complete in 'spec sc_status'. If you are truly finished, you MUST call 'task_complete' now to close the session. Do not perform redundant validations.]`
                    } else {
                        nudgeText = `[SYSTEM: You are currently in the middle of a workflow. Your last status check indicated the Next Step is: "${nextStep}". Please continue until the EventBus is fully implemented and tested. Do not exit via text.]`
                    }
                }

                const newMsgId = MessageID.ascending()
                const newUserMsg: MessageV2.User = {
                    id: newMsgId,
                    sessionID,
                    role: "user",
                    time: { created: Date.now() },
                    model: lastUser.model,
                    agent: lastUser.agent,
                }
                yield* sessions.updateMessage(newUserMsg)
                yield* sessions.updatePart({
                    id: PartID.ascending(),
                    sessionID,
                    messageID: newMsgId,
                    type: "text",
                    synthetic: true,
                    text: nudgeText,
                })
                lastUser = newUserMsg;
                continue
              }
              log.info("exiting loop", { sessionID })
              break
            }

            step++
            if (step === 1)
              yield* resolver.ensureTitle({
                session,
                modelID: lastUser.model.modelID,
                providerID: lastUser.model.providerID,
                history: msgs,
              }).pipe(Effect.ignore, Effect.forkIn(scope))

            const model = yield* resolver.getModel(lastUser.model.providerID, lastUser.model.modelID, sessionID)
            const task = tasks.pop()

            if (task?.type === "subtask") {
              yield* orchestrator.handleSubtask({ task, model, lastUser, sessionID, session, msgs })
              continue
            }

            if (task?.type === "compaction") {
              const result = yield* compaction.process({
                messages: msgs,
                parentID: lastUser.id,
                sessionID,
                auto: task.auto,
                overflow: task.overflow,
              })
              if (result === "stop") break
              continue
            }

            const agent = yield* agents.get(lastUser.agent)
            if (!agent) {
              const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
              const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
              const error = new NamedError.Unknown({ message: `Agent not found: "${lastUser.agent}".${hint}` })
              yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })
              throw error
            }
            const maxSteps = agent.steps ?? Infinity
            const isLastStep = step >= maxSteps
            msgs = yield* resolver.insertReminders({ messages: msgs, agent, session })

            const msg: MessageV2.Assistant = {
              id: MessageID.ascending(),
              parentID: lastUser.id,
              role: "assistant",
              mode: agent.name,
              agent: agent.name,
              variant: lastUser.model.variant,
              path: { cwd: ctx.directory, root: ctx.worktree },
              cost: 0,
              tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
              modelID: model.id,
              providerID: model.providerID,
              time: { created: Date.now() },
              sessionID,
            }
            yield* sessions.updateMessage(msg)
            const handle = yield* processor.create({
              assistantMessage: msg,
              sessionID,
              model,
            })

            const outcome: "break" | "continue" = yield* Effect.onExit(
              Effect.gen(function* () {
                const lastUserMsg = msgs.findLast((m) => m.info.role === "user")
                const bypassAgentCheck = lastUserMsg?.parts.some((p) => p.type === "agent") ?? false

                const lastNonSyntheticUser = msgs.findLast((m) => m.info.role === "user" && !m.parts.some(p => p.type === "text" && p.synthetic))
                let parentPermission = undefined
                if (lastNonSyntheticUser && lastNonSyntheticUser.info.agent !== agent.name) {
                  const parentAgent = yield* agents.get(lastNonSyntheticUser.info.agent)
                  if (parentAgent) {
                    parentPermission = parentAgent.permission
                  }
                }

                const tools = yield* orchestrator.resolveTools({
                  agent,
                  session,
                  model,
                  tools: lastUser.tools,
                  processor: handle,
                  bypassAgentCheck,
                  messages: msgs,
                  parentPermission,
                })

                if (lastUser.format?.type === "json_schema") {
                  tools["StructuredOutput"] = orchestrator.createStructuredOutputTool({
                    schema: lastUser.format.schema,
                    onSuccess(output) {
                      structured = output
                    },
                  })
                }

                if (step === 1) SessionSummary.summarize({ sessionID, messageID: lastUser.id })

                if (step > 1 && lastFinished) {
                  for (const m of msgs) {
                    if (m.info.role !== "user" || m.info.id <= lastFinished.id) continue
                    for (const p of m.parts) {
                      if (p.type !== "text" || p.ignored || p.synthetic) continue
                      if (!p.text.trim()) continue
                      p.text = [
                        "<system-reminder>",
                        "The user sent the following message:",
                        p.text,
                        "",
                        "Please address this message and continue with your tasks.",
                        "</system-reminder>",
                      ].join("\n")
                    }
                  }
                }

                yield* plugin.trigger("experimental.chat.messages.transform", {}, { messages: msgs })

                const [skills, env, instructions, modelMsgs, sysPaths, opFacts] = yield* Effect.all([
                  Effect.promise(() => SystemPrompt.skills(agent)),
                  Effect.promise(() => SystemPrompt.environment(model)),
                  instruction.system().pipe(Effect.orDie),
                  Effect.promise(() => MessageV2.toModelMessages(msgs, model)),
                  instruction.systemPaths().pipe(Effect.orDie),
                  Effect.promise(() => SystemPrompt.operationalFacts(model)),
                ])

                // Global Intervention Handler
                if (session.interventionRequested && yolo) {
                  const hint = session.interventionHint
                  log.warn("Processing requested intervention", { sessionID, hint })

                  let continuityContext = ""
                  const continuityPath = Array.from(sysPaths).find((p) => p.endsWith(".epoch-continuity.toon"))
                  if (continuityPath) {
                    try {
                      const fsNode = yield* Effect.promise(() => import("fs/promises"))
                      const content = yield* Effect.promise(() => fsNode.readFile(continuityPath, "utf-8"))
                      continuityContext = `\n\nContext (Epoch Continuity Report):\n${content}\n`
                    } catch (e) {}
                  }

                  const sideModel = yield* Effect.promise(() => Provider.getSideModel())
                  const sideLanguage = yield* Effect.promise(() => Provider.getLanguage(sideModel!))
                  const systemPrompt =
                    "You are an AI supervisor monitoring a main agent. The main agent has stagnated or hit a terminal loop. Analyze the provided Context and the Stall Reason. Provide a concise, stern directive telling the agent EXACTLY what to do next to break the cycle. Do not output anything other than the directive."
                  const prompt = `Stall Reason: ${hint}${continuityContext}\n\nPlease provide the intervention directive:`

                  const intervention = yield* Effect.promise(() => generateText({
                    model: sideLanguage,
                    system: systemPrompt,
                    prompt,
                    abortSignal: new AbortController().signal,
                  }))

                  if (intervention.text) {
                    const newMsgId = MessageID.ascending()
                    const newUserMsg: MessageV2.User = {
                      id: newMsgId,
                      sessionID,
                      role: "user",
                      time: { created: Date.now() },
                      agent: lastUser.agent,
                      model: lastUser.model,
                    }
                    yield* sessions.updateMessage(newUserMsg)
                    const newUserPart: MessageV2.Part = {
                      type: "text",
                      id: PartID.ascending(),
                      messageID: newMsgId,
                      sessionID,
                      text: `[CRITICAL INTERVENTION]\n${intervention.text}`,
                      synthetic: true,
                    }
                    yield* sessions.updatePart(newUserPart)
                    yield* sessions.setInterventionRequested({ sessionID, requested: false })
                    yield* sessions.setInterventionHint({ sessionID, hint: "" })

                    return "continue"
                  }
                }

                const isContinue = Array.from(sysPaths).some(p => p.endsWith(".epoch-continuity.toon"))

                let currentTokensEstimate = 0
                for (const m of msgs) {
                  if (m.info.role === "assistant" && m.info.tokens && (m.info.tokens.input || m.info.tokens.output)) {
                    currentTokensEstimate += (m.info.tokens.input + (m.info.tokens.output || 0))
                  } else {
                    // Fallback: Estimate tokens based on message parts length (approx 4 chars per token)
                    for (const p of m.parts) {
                       if (p.type === "text" && p.text) currentTokensEstimate += Math.ceil(p.text.length / 4)
                       if (p.type === "reasoning" && p.text) currentTokensEstimate += Math.ceil(p.text.length / 4)
                       if (p.type === "tool" && "state" in p) currentTokensEstimate += Math.ceil(JSON.stringify(p.state.input).length / 4)
                    }
                  }
                }

                const isHardOverflow = lastFinished && lastFinished.summary !== true && (yield* compaction.isOverflow({ tokens: lastFinished.tokens, model }));
                const isInputOverflow = currentTokensEstimate > 0 && (yield* compaction.isOverflow({ 
                    tokens: {
                        input: currentTokensEstimate,
                        output: 0,
                        reasoning: 0,
                        cache: { read: 0, write: 0 }
                    }, 
                    model 
                }));

                if (isHardOverflow || isInputOverflow) {
                  log.info("Context limit reached. Initiating automatic Epoch transition.", { 
                      sessionID, 
                      reason: isInputOverflow ? "Input Overflow" : "Hard Overflow",
                      tokens: isInputOverflow ? currentTokensEstimate : (lastFinished ? lastFinished.tokens.total : 0)
                  })
                  yield* status.set(sessionID, { type: "busy" })

                  yield* PostGenerationWorker.execute({ 
                    sessionID, 
                    chatHistory: msgs, 
                    abortSignal: new AbortController().signal,
                    isTransition: true
                  })

                  const newParentId = MessageID.ascending()
                  yield* sessions.updateMessage({
                      id: newParentId,
                      sessionID,
                      role: "user",
                      time: { created: Date.now() },
                      agent: lastUser.agent,
                      model: lastUser.model,
                  })
                  yield* sessions.updatePart({
                      id: PartID.ascending(),
                      sessionID,
                      messageID: newParentId,
                      type: "compaction",
                      auto: true
                  })
                  yield* sessions.updateMessage({
                      id: MessageID.ascending(),
                      parentID: newParentId,
                      sessionID,
                      role: "assistant",
                      time: { created: Date.now() },
                      agent: "compaction",
                      modelID: model.id,
                      providerID: model.providerID,
                      mode: "compaction",
                      path: {
                        cwd: Instance.worktree,
                        root: Instance.directory
                      },
                      cost: 0,
                      variant: lastAssistantMsgObj?.variant,
                      summary: true,
                      finish: "stop",
                      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                  })
                  
                  const nextTurnId = MessageID.ascending()
                  yield* sessions.updateMessage({
                      id: nextTurnId,
                      sessionID,
                      role: "user",
                      time: { created: Date.now() },
                      agent: lastUser.agent,
                      model: lastUser.model,
                  })
                  yield* sessions.updatePart({
                      id: PartID.ascending(),
                      sessionID,
                      messageID: nextTurnId,
                      type: "text",
                      synthetic: true,
                      text: "[SYSTEM: A new Epoch has begun. The previous conversation history has been cleared to free up context space. You must use the .epoch-continuity.toon file as your sole reference for the current state and task. Continue the work from where you left off.]"
                  })

                  return "continue" as const
                }
                
                const CONTEXT_LIMIT = model.limit.context ?? 32000
                const HIGH_WATERMARK = CONTEXT_LIMIT * 0.85
                const wrapUpDirective = currentTokensEstimate >= HIGH_WATERMARK
                  ? "CRITICAL: Context limit approaching. Finalize the immediate sub-task, do not initiate new architectural changes, and output your final <|tool_call|> to commit current state."
                  : ""

                const format = lastUser.format ?? { type: "text" as const }
                
                const zone1 = [...(wrapUpDirective ? [wrapUpDirective] : []), ...env, ...(skills ? [skills] : [])]
                if (format.type === "json_schema") zone1.push(STRUCTURED_OUTPUT_SYSTEM_PROMPT)

                const system = {
                  zone1: zone1.filter(Boolean),
                  zone2: instructions.filter(Boolean),
                }

                const result = yield* handle.process({
                  user: lastUser,
                  agent,
                  permission: session.permission,
                  sessionID,
                  parentSessionID: session.parentID,
                  system,
                  operationalFacts: opFacts,
                  isContinue,
                  yolo: yolo || msgs.some(m => m.info.role === "user" && m.parts.some(p => p.type === "text" && p.text.includes("[System: YOLO mode enabled"))),
                  messages: [...modelMsgs, ...(isLastStep ? [{ role: "assistant" as const, content: MAX_STEPS }] : [])],
                  tools,
                  model,
                  toolChoice: format.type === "json_schema" ? "required" : undefined,
                })

                // Maintain Epoch Continuity report in the background
                yield* PostGenerationWorker.execute({ 
                  sessionID, 
                  chatHistory: msgs, 
                  abortSignal: new AbortController().signal 
                }).pipe(
                  Effect.ignore,
                  Effect.forkIn(scope)
                )

                if (structured !== undefined) {
                  handle.message.structured = structured
                  handle.message.finish = handle.message.finish ?? "stop"
                  yield* sessions.updateMessage(handle.message)
                  return "break" as const
                }

                const finished = handle.message.finish && !["tool-calls", "unknown"].includes(handle.message.finish)
                if (finished && !handle.message.error) {
                  if (format.type === "json_schema") {
                    handle.message.error = new MessageV2.StructuredOutputError({
                      message: "Model did not produce structured output",
                      retries: 0,
                    }).toObject()
                    yield* sessions.updateMessage(handle.message)
                    return "break" as const
                  }
                }

                if (result === "stop") return "break" as const
                if (result === "compact") {
                  yield* compaction.create({
                    sessionID,
                    agent: lastUser.agent,
                    model: lastUser.model,
                    auto: true,
                    overflow: !handle.message.finish,
                  })
                }
                return "continue" as const
              }),
              Effect.fnUntraced(function* (exit) {
                if (Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)) yield* handle.abort()
                yield* InstanceState.withALS(() => instruction.clear(handle.message.id)).pipe(Effect.flatMap((x) => x))
              }),
            )
            if (outcome === "break") break
            continue
          }

          yield* compaction.prune({ sessionID }).pipe(Effect.ignore, Effect.forkIn(scope))
          return yield* lastAssistant(sessionID)
        },
      )

      return Service.of({
        runLoop,
        shellImpl,
      })
    })
  )
}
