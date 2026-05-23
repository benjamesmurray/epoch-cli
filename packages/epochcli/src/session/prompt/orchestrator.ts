import { Effect, Layer, ServiceMap } from "effect"
import { SessionID, MessageID, PartID } from "../schema"
import { MessageV2 } from "../message-v2"
import { Log } from "../../util/log"
import { SessionTelemetry } from "../../util/session-telemetry"
import { Session } from "../index"
import { Agent } from "../../agent/agent"
import { Provider } from "../../provider/provider"
import { ModelID, ProviderID } from "../../provider/schema"
import { MCP } from "../../mcp"
import { ToolRegistry } from "../../tool/registry"
import { Plugin } from "../../plugin"
import { SessionProcessor } from "../processor"
import { Permission } from "../../permission"
import { Truncate } from "../../tool/truncate"
import { Bus } from "../../bus"
import { Tool } from "../../tool/tool"
import { type Tool as AITool, tool, jsonSchema, asSchema, type ToolExecutionOptions } from "ai"
import { ProviderTransform } from "../../provider/transform"
import { NamedError } from "@epoch-ai/util/error"
import { ulid } from "ulid"
import { InstanceState } from "@/effect/instance-state"
import { InputResolver } from "./resolver"
import { STRUCTURED_OUTPUT_DESCRIPTION } from "./utils"
import z from "zod"
import { Todo } from "../todo"

export namespace ToolOrchestrator {
  const log = Log.create({ service: "session.prompt.orchestrator" })

  export interface Interface {
    readonly resolveTools: (input: {
      agent: Agent.Info
      model: Provider.Model
      session: Session.Info
      tools?: Record<string, boolean>
      processor: Pick<SessionProcessor.Handle, "message" | "partFromToolCall">
      bypassAgentCheck: boolean
      messages: MessageV2.WithParts[]
      parentPermission?: Permission.Ruleset
    }) => Effect.Effect<Record<string, AITool>>
    readonly handleSubtask: (input: {
      task: MessageV2.SubtaskPart
      model: Provider.Model
      lastUser: MessageV2.User
      sessionID: SessionID
      session: Session.Info
      msgs: MessageV2.WithParts[]
    }) => Effect.Effect<void>
    readonly createStructuredOutputTool: (input: {
      schema: Record<string, any>
      onSuccess: (output: unknown) => void
    }) => AITool
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionPrompt/Orchestrator") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      const agents = yield* Agent.Service
      const plugin = yield* Plugin.Service
      const mcp = yield* MCP.Service
      const registry = yield* ToolRegistry.Service
      const truncate = yield* Truncate.Service
      const permission = yield* Permission.Service
      const resolver = yield* InputResolver.Service
      const todo = yield* Todo.Service

      const resolveTools = Effect.fn("SessionPrompt.resolveTools")(function* (input: {
        agent: Agent.Info
        model: Provider.Model
        session: Session.Info
        tools?: Record<string, boolean>
        processor: Pick<SessionProcessor.Handle, "message" | "partFromToolCall">
        bypassAgentCheck: boolean
        messages: MessageV2.WithParts[]
        parentPermission?: Permission.Ruleset
      }) {
        using _ = log.time("resolveTools")
        const tools: Record<string, AITool> = {}

        const context = (args: any, options: ToolExecutionOptions): Tool.Context => ({
          sessionID: input.session.id,
          abort: options.abortSignal!,
          messageID: input.processor.message.id,
          callID: options.toolCallId,
          extra: { model: input.model, bypassAgentCheck: input.bypassAgentCheck },
          agent: input.agent.name,
          messages: input.messages,
          metadata: (val) =>
            Effect.runPromise(
              Effect.gen(function* () {
                const match = input.processor.partFromToolCall(options.toolCallId)
                if (!match || !["running", "pending"].includes(match.state.status)) return
                yield* sessions.updatePart({
                  ...match,
                  state: {
                    title: val.title,
                    metadata: val.metadata,
                    status: "running",
                    input: args,
                    time: { start: Date.now() },
                  },
                })
              }),
            ),
          ask: (req) =>
            Effect.runPromise(
              permission.ask(
                {
                  ...req,
                  sessionID: input.session.id,
                  tool: { messageID: input.processor.message.id, callID: options.toolCallId },
                },
                Permission.merge(
                  input.agent.permission,
                  input.parentPermission ?? [],
                  input.session.permission ?? [],
                ),
              ),
            ),
        })

        for (const item of yield* registry.tools(
          { modelID: ModelID.make(input.model.api.id), providerID: input.model.providerID },
          input.agent,
        )) {
          const schema = ProviderTransform.schema(input.model, z.toJSONSchema(item.parameters))
          tools[item.id] = tool({
            id: item.id as any,
            description: item.description,
            inputSchema: jsonSchema(schema as any),
            execute(args, options) {
              return Effect.runPromise(
                Effect.gen(function* () {
                  const ctx = context(args, options)
                  SessionTelemetry.emitToolEvent({
                    sessionID: ctx.sessionID,
                    event: "TOOL_START",
                    tool: item.id,
                    input: args,
                  })
                  yield* plugin.trigger(
                    "tool.execute.before",
                    { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID },
                    { args },
                  )
                  try {
                    const result = yield* Effect.promise(() => item.execute(args, ctx))
                    const output = {
                      ...result,
                      attachments: result.attachments?.map((attachment) => ({
                        ...attachment,
                        id: PartID.ascending(),
                        sessionID: ctx.sessionID,
                        messageID: input.processor.message.id,
                      })),
                    }
                    SessionTelemetry.emitToolEvent({
                      sessionID: ctx.sessionID,
                      event: "TOOL_END",
                      tool: item.id,
                      status: "completed",
                      output: typeof output.output === "string" ? output.output : JSON.stringify(output.output),
                    })
                    yield* plugin.trigger(
                      "tool.execute.after",
                      { tool: item.id, sessionID: ctx.sessionID, callID: ctx.callID, args },
                      output,
                    )
                    return output
                  } catch (e) {
                    SessionTelemetry.emitToolEvent({
                      sessionID: ctx.sessionID,
                      event: "TOOL_END",
                      tool: item.id,
                      status: "failed",
                      error: String(e),
                    })
                    throw e
                  }
                }),
              )
            },
          })
        }

        const mergedPermission = Permission.merge(input.agent.permission, input.parentPermission ?? [])

        return tools
      })

      const handleSubtask = Effect.fn("SessionPrompt.handleSubtask")(function* (input: {
        task: MessageV2.SubtaskPart
        model: Provider.Model
        lastUser: MessageV2.User
        sessionID: SessionID
        session: Session.Info
        msgs: MessageV2.WithParts[]
      }) {
        const { task, model, lastUser, sessionID, session, msgs } = input
        const ctx = yield* InstanceState.context
        const taskTool = yield* Effect.promise(() => registry.named.task.init())
        const taskModel = task.model
          ? yield* resolver.getModel(task.model.providerID, task.model.modelID, sessionID)
          : model
        const assistantMessage: MessageV2.Assistant = yield* sessions.updateMessage({
          id: MessageID.ascending(),
          role: "assistant",
          parentID: lastUser.id,
          sessionID,
          mode: task.agent,
          agent: task.agent,
          variant: lastUser.model.variant,
          path: { cwd: ctx.directory, root: ctx.worktree },
          cost: 0,
          tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
          modelID: taskModel.id,
          providerID: taskModel.providerID,
          time: { created: Date.now() },
        })
        let part: MessageV2.ToolPart = yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: assistantMessage.id,
          sessionID: assistantMessage.sessionID,
          type: "tool",
          callID: ulid(),
          tool: registry.named.task.id,
          state: {
            status: "running",
            input: {
              prompt: task.prompt,
              description: task.description,
              subagent_type: task.agent,
              command: task.command,
            },
            time: { start: Date.now() },
          },
        })
        const taskArgs = {
          prompt: task.prompt,
          description: task.description,
          subagent_type: task.agent,
          command: task.command,
        }
        yield* plugin.trigger("tool.execute.before", { tool: "task", sessionID, callID: part.id }, { args: taskArgs })

        const taskAgent = yield* agents.get(task.agent)
        if (!taskAgent) {
          const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
          const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
          const error = new NamedError.Unknown({ message: `Agent not found: "${task.agent}".${hint}` })
          yield* bus.publish(Session.Event.Error, { sessionID, error: error.toObject() })
          throw error
        }

        let error: Error | undefined
        const result = yield* Effect.promise((signal) =>
          taskTool
            .execute(taskArgs, {
              agent: task.agent,
              messageID: assistantMessage.id,
              sessionID,
              abort: signal,
              callID: part.callID,
              extra: { bypassAgentCheck: true },
              messages: msgs,
              metadata(val: { title?: string; metadata?: Record<string, any> }) {
                return Effect.runPromise(
                  Effect.gen(function* () {
                    part = yield* sessions.updatePart({
                      ...part,
                      type: "tool",
                      state: { ...part.state, ...val },
                    } satisfies MessageV2.ToolPart)
                  }),
                )
              },
              ask(req: any) {
                return Effect.runPromise(
                  permission.ask(
                    {
                      ...req,
                      sessionID,
                    },
                    Permission.merge(taskAgent.permission, session.permission ?? []),
                  ),
                )
              },
            })
            .catch((e) => {
              error = e instanceof Error ? e : new Error(String(e))
              log.error("subtask execution failed", { error, agent: task.agent, description: task.description })
              return undefined
            }),
        ).pipe(
          Effect.onInterrupt(() =>
            Effect.gen(function* () {
              assistantMessage.finish = "tool-calls"
              assistantMessage.time.completed = Date.now()
              yield* sessions.updateMessage(assistantMessage)
              if (part.state.status === "running") {
                yield* sessions.updatePart({
                  ...part,
                  state: {
                    status: "error",
                    error: "Cancelled",
                    time: { start: part.state.time.start, end: Date.now() },
                    metadata: part.state.metadata,
                    input: part.state.input,
                  },
                } satisfies MessageV2.ToolPart)
              }
            }),
          ),
        )

        const attachments = result?.attachments?.map((attachment) => ({
          ...attachment,
          id: PartID.ascending(),
          sessionID,
          messageID: assistantMessage.id,
        }))

        yield* plugin.trigger(
          "tool.execute.after",
          { tool: "task", sessionID, callID: part.id, args: taskArgs },
          result,
        )

        assistantMessage.finish = "tool-calls"
        assistantMessage.time.completed = Date.now()
        yield* sessions.updateMessage(assistantMessage)

        if (result && part.state.status === "running") {
          yield* sessions.updatePart({
            ...part,
            state: {
              status: "completed",
              input: part.state.input,
              title: result.title,
              metadata: result.metadata,
              output: result.output,
              attachments,
              time: { ...part.state.time, end: Date.now() },
            },
          } satisfies MessageV2.ToolPart)
        }

        if (!result) {
          yield* sessions.updatePart({
            ...part,
            state: {
              status: "error",
              error: error ? `Tool execution failed: ${error.message}` : "Tool execution failed",
              time: {
                start: part.state.status === "running" ? part.state.time.start : Date.now(),
                end: Date.now(),
              },
              metadata: part.state.status === "pending" ? undefined : part.state.metadata,
              input: part.state.input,
            },
          } satisfies MessageV2.ToolPart)
        }

        if (!task.command) return

        const summaryUserMsg: MessageV2.User = {
          id: MessageID.ascending(),
          sessionID,
          role: "user",
          time: { created: Date.now() },
          agent: lastUser.agent,
          model: lastUser.model,
        }
        yield* sessions.updateMessage(summaryUserMsg)
        yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: summaryUserMsg.id,
          sessionID,
          type: "text",
          text: "Summarize the task tool output above and continue with your task.",
          synthetic: true,
        } satisfies MessageV2.TextPart)
      })

      const createStructuredOutputTool = (input: {
        schema: Record<string, any>
        onSuccess: (output: unknown) => void
      }): AITool => {
        // Remove $schema property if present (not needed for tool input)
        const { $schema, ...toolSchema } = input.schema

        return tool({
          id: "StructuredOutput" as any,
          description: STRUCTURED_OUTPUT_DESCRIPTION,
          inputSchema: jsonSchema(toolSchema as any),
          async execute(args) {
            // AI SDK validates args against inputSchema before calling execute()
            input.onSuccess(args)
            return {
              output: "Structured output captured successfully.",
              title: "Structured Output",
              metadata: { valid: true },
            }
          },
          toModelOutput({ output }) {
            return {
              type: "text",
              value: output.output,
            }
          },
        })
      }

      return Service.of({
        resolveTools,
        handleSubtask,
        createStructuredOutputTool,
      })
    }),
  )
}
