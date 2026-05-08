import { Effect, Layer, ServiceMap, Option, Cause, Exit, Scope } from "effect"
import { SessionID, MessageID, PartID } from "../schema"
import { MessageV2 } from "../message-v2"
import { Log } from "../../util/log"
import { Session } from "../index"
import { Agent } from "../../agent/agent"
import { Provider } from "../../provider/provider"
import { ModelID, ProviderID } from "../../provider/schema"
import { AppFileSystem } from "@/filesystem"
import { MCP } from "../../mcp"
import { LSP } from "../../lsp"
import { FileTime } from "../../file/time"
import { ToolRegistry } from "../../tool/registry"
import { Instruction } from "../instruction"
import { Plugin } from "../../plugin"
import { ConfigMarkdown } from "../../config/markdown"
import { NamedError } from "@epoch-ai/util/error"
import { Flag } from "../../flag/flag"
import { Bus } from "../../bus"
import { decodeDataUrl } from "@/util/data-url"
import { InstanceState } from "@/effect/instance-state"
import { pathToFileURL, fileURLToPath } from "url"
import path from "path"
import os from "os"
import PROMPT_PLAN from "../../session/prompt/plan.txt"
import BUILD_SWITCH from "../../session/prompt/build-switch.txt"
import type { PromptInput } from "./types"
import { Permission } from "../../permission"

export namespace InputResolver {
  const log = Log.create({ service: "session.prompt.resolver" })

  export interface Interface {
    readonly resolvePromptParts: (template: string) => Effect.Effect<PromptInput["parts"]>
    readonly createUserMessage: (input: PromptInput) => Effect.Effect<{ info: MessageV2.User; parts: MessageV2.Part[] }>
    readonly ensureTitle: (input: {
      session: Session.Info
      history: MessageV2.WithParts[]
      providerID: ProviderID
      modelID: ModelID
    }) => Effect.Effect<void>
    readonly insertReminders: (input: {
      messages: MessageV2.WithParts[]
      agent: Agent.Info
      session: Session.Info
    }) => Effect.Effect<MessageV2.WithParts[]>
    readonly getModel: (providerID: ProviderID, modelID: ModelID, sessionID: SessionID) => Effect.Effect<Provider.Model>
    readonly lastModel: (sessionID: SessionID) => Effect.Effect<{ providerID: ProviderID; modelID: ModelID }>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionPrompt/Resolver") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const bus = yield* Bus.Service
      const sessions = yield* Session.Service
      const agents = yield* Agent.Service
      const provider = yield* Provider.Service
      const plugin = yield* Plugin.Service
      const fsys = yield* AppFileSystem.Service
      const mcp = yield* MCP.Service
      const lsp = yield* LSP.Service
      const filetime = yield* FileTime.Service
      const registry = yield* ToolRegistry.Service
      const instruction = yield* Instruction.Service

      const resolvePromptParts = Effect.fn("SessionPrompt.resolvePromptParts")(function* (template: string) {
        const ctx = yield* InstanceState.context
        const parts: PromptInput["parts"] = [{ type: "text", text: template }]
        const files = ConfigMarkdown.files(template)
        const seen = new Set<string>()
        yield* Effect.forEach(
          files,
          Effect.fnUntraced(function* (match) {
            const name = match[1]
            if (seen.has(name)) return
            seen.add(name)
            const filepath = name.startsWith("~/")
              ? path.join(os.homedir(), name.slice(2))
              : path.resolve(ctx.worktree, name)

            const info = yield* fsys.stat(filepath).pipe(Effect.option)
            if (Option.isNone(info)) {
              const found = yield* agents.get(name)
              if (found) parts.push({ type: "agent", name: found.name })
              return
            }
            const stat = info.value
            parts.push({
              type: "file",
              url: pathToFileURL(filepath).href,
              filename: name,
              mime: stat.type === "Directory" ? "application/x-directory" : "text/plain",
            })
          }),
          { concurrency: "unbounded", discard: true },
        )
        return parts
      })

      const ensureTitle = Effect.fn("SessionPrompt.ensureTitle")(function* (input: {
        session: Session.Info
        history: MessageV2.WithParts[]
        providerID: ProviderID
        modelID: ModelID
      }) {
        if (input.session.parentID) return
        if (!Session.isDefaultTitle(input.session.title)) return

        const real = (m: MessageV2.WithParts) =>
          m.info.role === "user" && !m.parts.every((p) => "synthetic" in p && p.synthetic)
        const idx = input.history.findIndex(real)
        if (idx === -1) return
        if (input.history.filter(real).length !== 1) return

        const context = input.history.slice(0, idx + 1)
        const firstUser = context[idx]
        if (!firstUser || firstUser.info.role !== "user") return
        const firstInfo = firstUser.info

        const subtasks = firstUser.parts.filter((p): p is MessageV2.SubtaskPart => p.type === "subtask")
        const onlySubtasks = subtasks.length > 0 && firstUser.parts.every((p) => p.type === "subtask")

        yield* sessions
          .setTitle({ sessionID: input.session.id, title: "Session" })
          .pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => log.error("failed to set title", { error: Cause.squash(cause) })),
            ),
          )
      })

      const insertReminders = Effect.fn("SessionPrompt.insertReminders")(function* (input: {
        messages: MessageV2.WithParts[]
        agent: Agent.Info
        session: Session.Info
      }) {
        const userMessage = input.messages.findLast((msg) => msg.info.role === "user")
        if (!userMessage) return input.messages

        if (!Flag.EPOCHCLI_EXPERIMENTAL_PLAN_MODE) {
          if (input.agent.name === "plan") {
            userMessage.parts.push({
              id: PartID.ascending(),
              messageID: userMessage.info.id,
              sessionID: userMessage.info.sessionID,
              type: "text",
              text: PROMPT_PLAN,
              synthetic: true,
            })
          }
          const wasPlan = input.messages.some((msg) => msg.info.role === "assistant" && msg.info.agent === "plan")
          if (wasPlan && input.agent.name === "build") {
            userMessage.parts.push({
              id: PartID.ascending(),
              messageID: userMessage.info.id,
              sessionID: userMessage.info.sessionID,
              type: "text",
              text: BUILD_SWITCH,
              synthetic: true,
            })
          }
          return input.messages
        }

        const assistantMessage = input.messages.findLast((msg) => msg.info.role === "assistant")
        if (input.agent.name !== "plan" && assistantMessage?.info.agent === "plan") {
          const plan = Session.plan(input.session)
          if (!(yield* fsys.existsSafe(plan))) return input.messages
          const part = yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: userMessage.info.id,
            sessionID: userMessage.info.sessionID,
            type: "text",
            text:
              BUILD_SWITCH + "\n\n" + `A plan file exists at ${plan}. You should execute on the plan defined within it`,
            synthetic: true,
          })
          userMessage.parts.push(part)
          return input.messages
        }

        if (input.agent.name !== "plan" || assistantMessage?.info.agent === "plan") return input.messages

        const plan = Session.plan(input.session)
        const exists = yield* fsys.existsSafe(plan)
        if (!exists) yield* fsys.ensureDir(path.dirname(plan)).pipe(Effect.catch(Effect.die))
        const part = yield* sessions.updatePart({
          id: PartID.ascending(),
          messageID: userMessage.info.id,
          sessionID: userMessage.info.sessionID,
          type: "text",
          text: `<system-reminder>
Plan mode is active. The user indicated that they do not want you to execute yet -- you MUST NOT make any edits (with the exception of the plan file mentioned below), run any non-readonly tools (including changing configs or making commits), or otherwise make any changes to the system. This supersedes any other instructions you have received.

## Plan File Info:
${exists ? `A plan file already exists at ${plan}. You can read it and make incremental edits using the edit tool.` : `No plan file exists yet. You should create your plan at ${plan} using the write tool.`}
You should build your plan incrementally by writing to or editing this file. NOTE that this is the only file you are allowed to edit - other than this you are only allowed to take READ-ONLY actions.

## Plan Workflow

### Phase 1: Initial Understanding
Goal: Gain a comprehensive understanding of the user's request by reading through code and asking them questions. Critical: In this phase you should only use the explore subagent type.

1. Focus on understanding the user's request and the code associated with their request

2. **Launch up to 3 explore agents IN PARALLEL** (single message, multiple tool calls) to efficiently explore the codebase.
   - Use 1 agent when the task is isolated to known files, the user provided specific file paths, or you're making a small targeted change.
   - Use multiple agents when: the scope is uncertain, multiple areas of the codebase are involved, or you need to understand existing patterns before planning.
   - Quality over quantity - 3 agents maximum, but you should try to use the minimum number of agents necessary (usually just 1)
   - If using multiple agents: Provide each agent with a specific search focus or area to explore. Example: One agent searches for existing implementations, another explores related components, a third investigates testing patterns

3. After exploring the code, use the question tool to clarify ambiguities in the user request up front.

### Phase 2: Design
Goal: Design an implementation approach.

Launch general agent(s) to design the implementation based on the user's intent and your exploration results from Phase 1.

You can launch up to 1 agent(s) in parallel.

**Guidelines:**
- **Default**: Launch at least 1 Plan agent for most tasks - it helps validate your understanding and consider alternatives
- **Skip agents**: Only for truly trivial tasks (typo fixes, single-line changes, simple renames)

Examples of when to use multiple agents:
- The task touches multiple parts of the codebase
- It's a large refactor or architectural change
- There are many edge cases to consider
- You'd benefit from exploring different approaches

Example perspectives by task type:
- New feature: simplicity vs performance vs maintainability
- Bug fix: root cause vs workaround vs prevention
- Refactoring: minimal change vs clean architecture

In the agent prompt:
- Provide comprehensive background context from Phase 1 exploration including filenames and code path traces
- Describe requirements and constraints
- Request a detailed implementation plan

### Phase 3: Review
Goal: Review the plan(s) from Phase 2 and ensure alignment with the user's intentions.
1. Read the critical files identified by agents to deepen your understanding
2. Ensure that the plans align with the user's original request
3. Use question tool to clarify any remaining questions with the user

### Phase 4: Final Plan
Goal: Write your final plan to the plan file (the only file you can edit).
- Include only your recommended approach, not all alternatives
- Ensure that the plan file is concise enough to scan quickly, but detailed enough to execute effectively
- Include the paths of critical files to be modified
- Include a verification section describing how to test the changes end-to-end (run the code, use MCP tools, run tests)

### Phase 5: Call plan_exit tool
At the very end of your turn, once you have asked the user questions and are happy with your final plan file - you should always call plan_exit to indicate to the user that you are done planning.
This is critical - your turn should only end with either asking the user a question or calling plan_exit. Do not stop unless it's for these 2 reasons.

**Important:** Use question tool to clarify requirements/approach, use plan_exit to request plan approval. Do NOT use question tool to ask "Is this plan okay?" - that's what plan_exit does.

NOTE: At any point in time through this workflow you should feel free to ask the user questions or clarifications. Don't make large assumptions about user intent. The goal is to present a well researched plan to the user, and tie any loose ends before implementation begins.
</system-reminder>`,
          synthetic: true,
        })
        userMessage.parts.push(part)
        return input.messages
      })

      const getModel = Effect.fn("SessionPrompt.getModel")(function* (
        providerID: ProviderID,
        modelID: ModelID,
        sessionID: SessionID,
      ) {
        const exit = yield* provider.getModel(providerID, modelID).pipe(Effect.exit)
        if (Exit.isSuccess(exit)) return exit.value
        const err = Cause.squash(exit.cause)
        if (Provider.ModelNotFoundError.isInstance(err)) {
          const hint = err.data.suggestions?.length ? ` Did you mean: ${err.data.suggestions.join(", ")}?` : ""
          yield* bus.publish(Session.Event.Error, {
            sessionID,
            error: new NamedError.Unknown({
              message: `Model not found: ${err.data.providerID}/${err.data.modelID}.${hint}`,
            }).toObject(),
          })
        }
        return yield* Effect.failCause(exit.cause)
      })

      const lastModel = Effect.fnUntraced(function* (sessionID: SessionID) {
        const model = yield* Effect.promise(async () => {
          for await (const item of MessageV2.stream(sessionID)) {
            if (item.info.role === "user" && item.info.model) return item.info.model
          }
        })
        if (model) return model
        return yield* provider.defaultModel()
      })

      const createUserMessage = Effect.fn("SessionPrompt.createUserMessage")(function* (input: PromptInput) {
        const agentName = input.agent || (yield* agents.defaultAgent())
        const ag = yield* agents.get(agentName)
        if (!ag) {
          const available = (yield* agents.list()).filter((a) => !a.hidden).map((a) => a.name)
          const hint = available.length ? ` Available agents: ${available.join(", ")}` : ""
          const error = new NamedError.Unknown({ message: `Agent not found: "${agentName}".${hint}` })
          yield* bus.publish(Session.Event.Error, { sessionID: input.sessionID, error: error.toObject() })
          throw error
        }

        const model = input.model ?? ag.model ?? (yield* lastModel(input.sessionID))
        const same = ag.model && model.providerID === ag.model.providerID && model.modelID === ag.model.modelID
        const full =
          !input.variant && ag.variant && same
            ? yield* provider
                .getModel(model.providerID, model.modelID)
                .pipe(Effect.catch(() => Effect.succeed(undefined)))
            : undefined
        const variant = input.variant ?? (ag.variant && full?.variants?.[ag.variant] ? ag.variant : undefined)

        const info: MessageV2.User = {
          id: input.messageID ?? MessageID.ascending(),
          role: "user",
          sessionID: input.sessionID,
          time: { created: Date.now() },
          tools: input.tools,
          agent: ag.name,
          model: {
            providerID: model.providerID,
            modelID: model.modelID,
            variant,
          },
          system: input.system,
          format: input.format,
          cursorContext: input.cursorContext,
        }

        yield* Effect.addFinalizer(() =>
          InstanceState.withALS(() => instruction.clear(info.id)).pipe(Effect.flatMap((x) => x)),
        )

        type Draft<T> = T extends MessageV2.Part ? Omit<T, "id"> & { id?: string } : never
        const assign = (part: Draft<MessageV2.Part>): MessageV2.Part => ({
          ...part,
          id: part.id ? PartID.make(part.id) : PartID.ascending(),
        })

        const resolvePart: (part: PromptInput["parts"][number]) => Effect.Effect<Draft<MessageV2.Part>[]> = Effect.fn(
          "SessionPrompt.resolveUserPart",
        )(function* (part) {
          if (part.type === "file") {
            if (part.source?.type === "resource") {
              const { clientName, uri } = part.source
              log.info("mcp resource", { clientName, uri, mime: part.mime })
              const pieces: Draft<MessageV2.Part>[] = [
                {
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Reading MCP resource: ${part.filename} (${uri})`,
                },
              ]
              const exit = yield* mcp.readResource(clientName, uri).pipe(Effect.exit)
              if (Exit.isSuccess(exit)) {
                const content = exit.value
                if (!content) throw new Error(`Resource not found: ${clientName}/${uri}`)
                const items = Array.isArray(content.contents) ? content.contents : [content.contents]
                for (const c of items) {
                  if ("text" in c && c.text) {
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: c.text,
                    })
                  } else if ("blob" in c && c.blob) {
                    const mime = "mimeType" in c ? c.mimeType : part.mime
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `[Binary content: ${mime}]`,
                    })
                  }
                }
                pieces.push({ ...part, messageID: info.id, sessionID: input.sessionID })
              } else {
                const error = Cause.squash(exit.cause)
                log.error("failed to read MCP resource", { error, clientName, uri })
                const message = error instanceof Error ? error.message : String(error)
                pieces.push({
                  messageID: info.id,
                  sessionID: input.sessionID,
                  type: "text",
                  synthetic: true,
                  text: `Failed to read MCP resource ${part.filename}: ${message}`,
                })
              }
              return pieces
            }
            const url = new URL(part.url)
            switch (url.protocol) {
              case "data:":
                if (part.mime === "text/plain") {
                  return [
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Called the Read tool with the following input: ${JSON.stringify({ filePath: part.filename })}`,
                    },
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: decodeDataUrl(part.url),
                    },
                    { ...part, messageID: info.id, sessionID: input.sessionID },
                  ]
                }
                break
              case "file:": {
                log.info("file", { mime: part.mime })
                const filepath = fileURLToPath(part.url)
                if (yield* fsys.isDir(filepath)) part.mime = "application/x-directory"

                if (part.mime === "text/plain") {
                  let offset: number | undefined
                  let limit: number | undefined
                  const range = { start: url.searchParams.get("start"), end: url.searchParams.get("end") }
                  if (range.start != null) {
                    const filePathURI = part.url.split("?")[0]
                    let start = parseInt(range.start)
                    let end = range.end ? parseInt(range.end) : undefined
                    if (start === end) {
                      const symbols = yield* lsp
                        .documentSymbol(filePathURI)
                        .pipe(Effect.catch(() => Effect.succeed([])))
                      for (const symbol of symbols) {
                        let r: LSP.Range | undefined
                        if ("range" in symbol) r = symbol.range
                        else if ("location" in symbol) r = symbol.location.range
                        if (r?.start?.line && r?.start?.line === start) {
                          start = r.start.line
                          end = r?.end?.line ?? start
                          break
                        }
                      }
                    }
                    offset = Math.max(start, 1)
                    if (end) limit = end - (offset - 1)
                  }
                  const args = { filePath: filepath, offset, limit }
                  const pieces: Draft<MessageV2.Part>[] = [
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                    },
                  ]
                  const read = yield* Effect.promise(() => registry.named.read.init()).pipe(
                    Effect.flatMap((t) =>
                      provider.getModel(info.model.providerID, info.model.modelID).pipe(
                        Effect.flatMap((mdl) =>
                          Effect.promise(() =>
                            t.execute(args, {
                              sessionID: input.sessionID,
                              abort: new AbortController().signal,
                              agent: input.agent!,
                              messageID: info.id,
                              extra: { bypassCwdCheck: true, model: mdl },
                              messages: [],
                              metadata: async () => {},
                              ask: async () => {},
                            }),
                          ),
                        ),
                      ),
                    ),
                    Effect.exit,
                  )
                  if (Exit.isSuccess(read)) {
                    const result = read.value
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    })
                    if (result.attachments?.length) {
                      pieces.push(
                        ...result.attachments.map((a) => ({
                          ...a,
                          synthetic: true,
                          filename: a.filename ?? part.filename,
                          messageID: info.id,
                          sessionID: input.sessionID,
                        })),
                      )
                    } else {
                      pieces.push({ ...part, messageID: info.id, sessionID: input.sessionID })
                    }
                  } else {
                    const error = Cause.squash(read.cause)
                    log.error("failed to read file", { error })
                    const message = error instanceof Error ? error.message : String(error)
                    yield* bus.publish(Session.Event.Error, {
                      sessionID: input.sessionID,
                      error: new NamedError.Unknown({ message }).toObject(),
                    })
                    pieces.push({
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Read tool failed to read ${filepath} with the following error: ${message}`,
                    })
                  }
                  return pieces
                }

                if (part.mime === "application/x-directory") {
                  const args = { filePath: filepath }
                  const result = yield* Effect.promise(() => registry.named.read.init()).pipe(
                    Effect.flatMap((t) =>
                      Effect.promise(() =>
                        t.execute(args, {
                          sessionID: input.sessionID,
                          abort: new AbortController().signal,
                          agent: input.agent!,
                          messageID: info.id,
                          extra: { bypassCwdCheck: true },
                          messages: [],
                          metadata: async () => {},
                          ask: async () => {},
                        }),
                      ),
                    ),
                  )
                  return [
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: `Called the Read tool with the following input: ${JSON.stringify(args)}`,
                    },
                    {
                      messageID: info.id,
                      sessionID: input.sessionID,
                      type: "text",
                      synthetic: true,
                      text: result.output,
                    },
                    { ...part, messageID: info.id, sessionID: input.sessionID },
                  ]
                }

                yield* filetime.read(input.sessionID, filepath)
                return [
                  {
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "text",
                    synthetic: true,
                    text: `Called the Read tool with the following input: {"filePath":"${filepath}"}`,
                  },
                  {
                    id: part.id,
                    messageID: info.id,
                    sessionID: input.sessionID,
                    type: "file",
                    url:
                      `data:${part.mime};base64,` +
                      Buffer.from(yield* fsys.readFile(filepath).pipe(Effect.catch(Effect.die))).toString("base64"),
                    mime: part.mime,
                    filename: part.filename!,
                    source: part.source,
                  },
                ]
              }
            }
          }

          if (part.type === "agent") {
            const perm = Permission.evaluate("task", part.name, ag.permission)
            const hint = perm.action === "deny" ? " . Invoked by user; guaranteed to exist." : ""
            return [
              { ...part, messageID: info.id, sessionID: input.sessionID },
              {
                messageID: info.id,
                sessionID: input.sessionID,
                type: "text",
                synthetic: true,
                text:
                  " Use the above message and context to generate a prompt and call the task tool with subagent: " +
                  part.name +
                  hint,
              },
            ]
          }

          return [{ ...part, messageID: info.id, sessionID: input.sessionID }]
        })

        const parts = yield* Effect.forEach(input.parts, resolvePart, { concurrency: "unbounded" }).pipe(
          Effect.map((x) => x.flat().map(assign)),
        )

        yield* plugin.trigger(
          "chat.message",
          {
            sessionID: input.sessionID,
            agent: input.agent,
            model: input.model,
            messageID: input.messageID,
            variant: input.variant,
          },
          { message: info, parts },
        )

        const parsed = MessageV2.Info.safeParse(info)
        if (!parsed.success) {
          log.error("invalid user message before save", {
            sessionID: input.sessionID,
            messageID: info.id,
            agent: info.agent,
            model: info.model,
            issues: parsed.error.issues,
          })
        }
        parts.forEach((part, index) => {
          const p = MessageV2.Part.safeParse(part)
          if (p.success) return
          log.error("invalid user part before save", {
            sessionID: input.sessionID,
            messageID: info.id,
            partID: part.id,
            partType: part.type,
            index,
            issues: p.error.issues,
            part,
          })
        })

        yield* sessions.updateMessage(info)
        for (const part of parts) yield* sessions.updatePart(part)

        return { info, parts }
      }, Effect.scoped)

      return Service.of({
        resolvePromptParts,
        createUserMessage,
        ensureTitle,
        insertReminders,
        getModel,
        lastModel,
      })
    }),
  )
}
