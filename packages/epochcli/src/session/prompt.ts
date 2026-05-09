import path from "path"
import os from "os"
import z from "zod"
import { SessionID, MessageID, PartID } from "./schema"
import { MessageV2 } from "./message-v2"
import { Log } from "../util/log"
import { SessionRevert } from "./revert"
import { Effect, Layer, ServiceMap, Scope } from "effect"
import { Session } from "./index"
import { Agent } from "../agent/agent"
import { Command } from "../command"
import { Process } from "@/util/process"
import { Shell } from "../shell/shell"
import { Bus } from "../bus"
import { ConfigMarkdown } from "../config/markdown"
import { NamedError } from "@epoch-ai/util/error"
import { Permission } from "../permission"
import { Tool } from "../tool/tool"
import { Provider } from "../provider/provider"
import { Plugin } from "../plugin"
import { MCP } from "../mcp"
import { LSP } from "../lsp"
import { FileTime } from "../file/time"
import { ToolRegistry } from "../tool/registry"
import { Truncate } from "../tool/truncate"
import { AppFileSystem } from "../filesystem"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { Instruction } from "./instruction"
import { SessionStatus } from "./status"
import { SessionCompaction } from "./compaction"
import { SessionProcessor } from "./processor"
import { LLM } from "./llm"
import { Todo } from "./todo"
import { Config } from "../config/config"
import * as CrossSpawnSpawner from "@/effect/cross-spawn-spawner"
import { tool, jsonSchema, type Tool as AITool } from "ai"

import {
  PromptInput as _PromptInput,
  LoopInput as _LoopInput,
  ShellInput as _ShellInput,
  CommandInput as _CommandInput,
} from "./prompt/types"
import { SessionState } from "./prompt/state"
import { InputResolver } from "./prompt/resolver"
import { ToolOrchestrator } from "./prompt/orchestrator"
import { SessionEngine } from "./prompt/engine"
import { makeRuntime } from "@/effect/run-service"

// @ts-ignore
globalThis.AI_SDK_LOG_WARNINGS = false

import {
  STRUCTURED_OUTPUT_DESCRIPTION,
  STRUCTURED_OUTPUT_SYSTEM_PROMPT,
  bashRegex,
  argsRegex,
  placeholderRegex,
  quoteTrimRegex,
} from "./prompt/utils"

export namespace SessionPrompt {
  const log = Log.create({ service: "session.prompt" })

  export const PromptInput = _PromptInput
  export type PromptInput = _PromptInput

  export const LoopInput = _LoopInput
  export type LoopInput = _LoopInput

  export const ShellInput = _ShellInput
  export type ShellInput = _ShellInput

  export const CommandInput = _CommandInput
  export type CommandInput = _CommandInput

  export interface Interface {
    readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError>
    readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
    readonly prompt: (input: PromptInput) => Effect.Effect<MessageV2.WithParts>
    readonly loop: (input: z.infer<typeof LoopInput>) => Effect.Effect<MessageV2.WithParts>
    readonly shell: (input: ShellInput) => Effect.Effect<MessageV2.WithParts>
    readonly command: (input: CommandInput) => Effect.Effect<MessageV2.WithParts>
    readonly resolvePromptParts: (template: string) => Effect.Effect<PromptInput["parts"]>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionPrompt") {}

  export const facadeLayer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const state = yield* SessionState.Service
      const resolver = yield* InputResolver.Service
      const engine = yield* SessionEngine.Service
      const sessions = yield* Session.Service
      const commands = yield* Command.Service
      const agents = yield* Agent.Service
      const bus = yield* Bus.Service
      const plugin = yield* Plugin.Service

      const assertNotBusy = state.assertNotBusy
      const cancel = state.cancel
      const resolvePromptParts = resolver.resolvePromptParts

      const loop = (input: z.infer<typeof LoopInput>): Effect.Effect<MessageV2.WithParts> =>
        Effect.gen(function* () {
          const runner = yield* state.getRunner(input.sessionID)
          return yield* runner.ensureRunning(engine.runLoop(input.sessionID, input.yolo))
        }).pipe(Effect.annotateLogs({ method: "SessionPrompt.loop" }))

      const promptLocal = (input: PromptInput): Effect.Effect<MessageV2.WithParts> =>
        Effect.gen(function* () {
          const session = yield* sessions.get(input.sessionID)
          yield* Effect.promise(() => SessionRevert.cleanup(session))
          const message = yield* resolver.createUserMessage(input)
          yield* sessions.touch(input.sessionID)

          const permissions: Permission.Ruleset = []
          for (const [t, enabled] of Object.entries(input.tools ?? {})) {
            permissions.push({ permission: t, action: enabled ? "allow" : "deny", pattern: "*" })
          }
          if (permissions.length > 0) {
            session.permission = permissions
            yield* sessions.setPermission({ sessionID: session.id, permission: permissions })
          }

          if (input.noReply === true) return message
          return yield* loop({ sessionID: input.sessionID, yolo: input.yolo })
        }).pipe(Effect.annotateLogs({ method: "SessionPrompt.prompt" }))

      const shell = (input: ShellInput): Effect.Effect<MessageV2.WithParts> =>
        Effect.gen(function* () {
          const runner = yield* state.getRunner(input.sessionID)
          return yield* runner.startShell((signal) => engine.shellImpl(input, signal))
        }).pipe(Effect.annotateLogs({ method: "SessionPrompt.shell" }))

      const command = (input: CommandInput): Effect.Effect<MessageV2.WithParts> =>
        Effect.gen(function* () {
          log.info("command", input)
          const cmd = yield* commands.get(input.command)
          if (!cmd) {
            const available = (yield* commands.list()).map((c) => c.name)
            const hint = available.length ? ` Available commands: ${available.join(", ")}` : ""
            const error = new NamedError.Unknown({ message: `Command not found: "${input.command}".${hint}` })
            yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
            throw error
          }
          const agentName = cmd.agent ?? input.agent ?? (yield* agents.defaultAgent())

          const raw = input.arguments.match(argsRegex) ?? []
          const args = raw.map((arg) => arg.replace(quoteTrimRegex, ""))
          const templateCommand = yield* Effect.promise(async () => cmd.template)

          const placeholders = templateCommand.match(placeholderRegex) ?? []
          let last = 0
          for (const item of placeholders) {
            const value = Number(item.slice(1))
            if (value > last) last = value
          }

          const withArgs = templateCommand.replaceAll(placeholderRegex, (_, index) => {
            const position = Number(index)
            const argIndex = position - 1
            if (argIndex >= args.length) return ""
            if (position === last) return args.slice(argIndex).join(" ")
            return args[argIndex]
          })
          const usesArgumentsPlaceholder = templateCommand.includes("$ARGUMENTS")
          let template = withArgs.replaceAll("$ARGUMENTS", input.arguments)

          if (placeholders.length === 0 && !usesArgumentsPlaceholder && input.arguments.trim()) {
            template = template + "\n\n" + input.arguments
          }

          const shellMatches = ConfigMarkdown.shell(template)
          if (shellMatches.length > 0) {
            const sh = Shell.preferred()
            const results = yield* Effect.promise(() =>
              Promise.all(
                shellMatches.map(async ([, cmd]) => (await Process.text([cmd], { shell: sh, nothrow: true })).text),
              ),
            )
            let index = 0
            template = template.replace(bashRegex, () => results[index++])
          }
          template = template.trim()

          const taskModel = yield* Effect.gen(function* () {
            if (cmd.model) return Provider.parseModel(cmd.model)
            if (cmd.agent) {
              const cmdAgent = yield* agents.get(cmd.agent)
              if (cmdAgent?.model) return cmdAgent.model
            }
            if (input.model) return Provider.parseModel(input.model)
            return yield* resolver.lastModel(input.sessionID)
          })

          yield* resolver.getModel(taskModel.providerID, taskModel.modelID, input.sessionID)

          const agent = yield* agents.get(agentName)
          if (!agent) {
            const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
            const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
            const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
            yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
            throw error
          }

          const templateParts = yield* resolvePromptParts(template)
          const isSubtask = (agent.mode === "subagent" && cmd.subtask !== false) || cmd.subtask === true
          const parts = isSubtask
            ? [
                {
                  type: "subtask" as const,
                  agent: agent.name,
                  description: cmd.description ?? "",
                  command: input.command,
                  model: { providerID: taskModel.providerID, modelID: taskModel.modelID },
                  prompt: templateParts.find((y) => y.type === "text")?.text ?? "",
                },
              ]
            : [...templateParts, ...(input.parts ?? [])]

          const userAgent = isSubtask ? (input.agent ?? (yield* agents.defaultAgent())) : agentName
          const userModel = isSubtask
            ? input.model
              ? Provider.parseModel(input.model)
              : yield* resolver.lastModel(input.sessionID)
            : taskModel

          yield* plugin.trigger(
            "command.execute.before",
            { command: input.command, sessionID: input.sessionID, arguments: input.arguments },
            { parts },
          )

          const result = yield* promptLocal({
            sessionID: input.sessionID,
            messageID: input.messageID,
            model: userModel,
            agent: userAgent,
            parts,
            variant: input.variant,
            yolo: input.yolo,
          })
          yield* bus.publish(Command.Event.Executed, {
            name: input.command,
            sessionID: input.sessionID,
            arguments: input.arguments,
            messageID: result.info.id,
          })
          return result
        }).pipe(Effect.annotateLogs({ method: "SessionPrompt.command" }))

      return Service.of({
        assertNotBusy,
        cancel,
        prompt: promptLocal,
        loop,
        shell,
        command,
        resolvePromptParts,
      })
    }),
  )

  export const layer: Layer.Layer<Service, never, any> = facadeLayer.pipe(
    Layer.provideMerge(SessionEngine.layer),
    Layer.provideMerge(ToolOrchestrator.layer),
    Layer.provideMerge(InputResolver.layer),
    Layer.provideMerge(SessionState.layer),
  )

  export const defaultLayer: Layer.Layer<Service, never, never> = Layer.unwrap(
    Effect.sync(() => {
      const l1 = layer.pipe(
        Layer.provide(SessionStatus.layer),
        Layer.provide(SessionCompaction.defaultLayer),
        Layer.provide(SessionProcessor.defaultLayer),
        Layer.provide(Command.defaultLayer),
        Layer.provide(Permission.defaultLayer),
        Layer.provide(MCP.defaultLayer),
        Layer.provide(LSP.defaultLayer),
      )
      const l2 = l1.pipe(
        Layer.provide(FileTime.defaultLayer),
        Layer.provide(ToolRegistry.defaultLayer),
        Layer.provide(Todo.defaultLayer),
        Layer.provide(Truncate.defaultLayer),
        Layer.provide(AppFileSystem.defaultLayer),
        Layer.provide(CrossSpawnSpawner.defaultLayer),
        Layer.provide(Instruction.defaultLayer),
        Layer.provide(Plugin.defaultLayer),
        Layer.provide(Bus.layer),
        Layer.provide(Config.defaultLayer),
        Layer.provide(Provider.defaultLayer),
        Layer.provide(LLM.defaultLayer),
        Layer.provide(Agent.defaultLayer),
        Layer.provide(Session.defaultLayer),
      )
      return l2
    }),
  ).pipe(Layer.orDie) as any

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function prompt(input: PromptInput) {
    return runPromise((svc) => svc.prompt(PromptInput.parse(input)))
  }

  export async function resolvePromptParts(template: string) {
    return runPromise((svc) => svc.resolvePromptParts(z.string().parse(template)))
  }

  export async function cancel(sessionID: SessionID) {
    return runPromise((svc) => svc.cancel(SessionID.zod.parse(sessionID)))
  }

  export async function loop(input: LoopInput) {
    return runPromise((svc) => svc.loop(LoopInput.parse(input)))
  }

  export async function shell(input: ShellInput) {
    return runPromise((svc) => svc.shell(ShellInput.parse(input)))
  }

  export async function command(input: CommandInput) {
    return runPromise((svc) => svc.command(CommandInput.parse(input)))
  }

  export async function assertNotBusy(sessionID: SessionID) {
    return runPromise((svc) => svc.assertNotBusy(SessionID.zod.parse(sessionID)))
  }

  export function createStructuredOutputTool(input: {
    schema: Record<string, any>
    onSuccess: (output: unknown) => void
  }): AITool {
    // Remove $schema property if present (not needed for tool input)
    const { $schema, ...toolSchema } = input.schema

    return tool({
      id: "StructuredOutput" as any,
      description: STRUCTURED_OUTPUT_DESCRIPTION,
      inputSchema: jsonSchema(toolSchema as any),
      async execute(args) {
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
}
