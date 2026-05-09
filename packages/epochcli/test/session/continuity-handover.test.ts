import { afterEach, describe, expect, mock, test } from "bun:test"
import { Effect, Layer, ServiceMap } from "effect"
import * as Stream from "effect/Stream"
import path from "path"
import fs from "fs/promises"

// Set DB to memory to ensure foreign keys work in a clean environment for tests
process.env.EPOCHCLI_DB = ":memory:"
process.env.EPOCHCLI_DISABLE_CHANNEL_DB = "true"

import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { Agent } from "../../src/agent/agent"
import { LLM } from "../../src/session/llm"
import { SessionCompaction } from "../../src/session/compaction"
import { Log } from "../../src/util/log"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { provideTmpdirInstance } from "../fixture/fixture"
import { Session } from "../../src/session"
import { MessageID, PartID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionEngine } from "../../src/session/prompt/engine"
import { InputResolver } from "../../src/session/prompt/resolver"
import { ToolOrchestrator } from "../../src/session/prompt/orchestrator"
import { SessionProcessor } from "../../src/session/processor"
import { Instruction } from "../../src/session/instruction"
import { Snapshot } from "../../src/snapshot"
import { Todo } from "../../src/session/todo"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"
import { MCP } from "../../src/mcp"
import { ToolRegistry } from "../../src/tool/registry"
import { Truncate } from "../../src/tool/truncate"
import { AppFileSystem } from "../../src/filesystem"
import { Git } from "../../src/git"
import { testEffect } from "../lib/effect"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { LSP } from "../../src/lsp"
import { FileTime } from "../../src/file/time"
import { APICallError } from "ai"
import { isOverflow } from "../../src/session/overflow"
import { InstanceState } from "../../src/effect/instance-state"

Log.init({ print: false })

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

afterEach(() => {
  mock.restore()
})

function createModel(opts: { context: number; output: number; input?: number }): any {
  return {
    id: "test-model",
    providerID: "test",
    name: "Test",
    limit: {
      context: opts.context,
      input: opts.input,
      output: opts.output,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: {
      toolcall: true,
      attachment: false,
      reasoning: false,
      temperature: true,
      interleaved: false,
      input: { text: true, image: false, audio: false, video: false, pdf: false },
      output: { text: true, image: false, audio: false, video: false, pdf: false },
    },
    api: { id: "test-model", url: "https://example.com", npm: "@ai-sdk/openai" },
    options: {},
  }
}

const mockLanguageModel = {
  specificationVersion: "v3",
  modelId: "test-side-model",
  doGenerate: async ({ prompt }: { prompt: any }) => {
    const promptStr = JSON.stringify(prompt)
    let text =
      "NONE\n\nepoch_continuity:\n  historical_references: []\n  workflow_map: { pipeline_step: '5. Build', phase: 'Build', status: 'Ready' }\n  project_map: { status: 'Healthy', context: 'None' }\n  executive_intent: { high_level_architecture: 'None', immediate_conclusions: [] }\n  technical_progress: { completed_artifacts: [], blocked_drafts: [] }\n  function_activity: 'None'\n  next_action: { tool: 'ls', rationale: 'Test', example_input: {} }"

    if (promptStr.includes("interrupted_state:")) {
      text +=
        "\n\ninterrupted_state:\n  context_of_interruption: 'Test interruption'\n  last_mental_drafts: 'Test drafts'\n  intended_next_execution: 'Test tool'"
    }

    return {
      text,
      content: [{ type: "text", text }],
      finishReason: "stop",
      usage: {
        promptTokens: 10,
        completionTokens: 10,
        inputTokens: 10,
        outputTokens: 10,
      },
    }
  },
} as any

class ProviderService extends ServiceMap.Service<ProviderService, any>()("@epochcli/Provider") {}

mock.module("../../src/provider/provider", () => ({
  Provider: {
    getSideModel: async () => ({ providerID: "test", modelID: "test-model" }),
    getLanguage: async () => mockLanguageModel,
    getModel: async () => createModel({ context: 16000, output: 4000 }),
    Service: ProviderService,
  },
}))

function llm() {
  const queue: Array<
    Stream.Stream<LLM.Event, unknown> | ((input: LLM.StreamInput) => Stream.Stream<LLM.Event, unknown>)
  > = []

  return {
    clear() {
      queue.length = 0
    },
    push(stream: Stream.Stream<LLM.Event, unknown> | ((input: LLM.StreamInput) => Stream.Stream<LLM.Event, unknown>)) {
      queue.push(stream)
    },
    layer: Layer.succeed(
      LLM.Service,
      LLM.Service.of({
        stream: (input) => {
          const item = queue.shift() ?? Stream.empty
          const stream = typeof item === "function" ? item(input) : item
          return stream.pipe(Stream.mapEffect((event) => Effect.succeed(event)))
        },
      }),
    ),
  }
}

function liveLayer(llmLayer: Layer.Layer<LLM.Service>) {
  const bus = Bus.layer
  const status = SessionStatus.layer.pipe(Layer.provide(bus))

  const providers = Layer.mergeAll(
    status,
    bus,
    Config.defaultLayer,
    Session.defaultLayer,
    Agent.defaultLayer,
    Plugin.defaultLayer,
    Snapshot.defaultLayer,
    Instruction.defaultLayer,
    Permission.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    AppFileSystem.defaultLayer,
    Git.defaultLayer,
    Todo.defaultLayer,
    Layer.succeed(
      MCP.Service,
      MCP.Service.of({
        clients: () => Effect.succeed({}),
        tools: () => Effect.succeed({}),
      } as any),
    ),
    Layer.succeed(
      ToolRegistry.Service,
      ToolRegistry.Service.of({
        resolve: () => Effect.succeed({}),
        list: () => Effect.succeed([]),
        get: () => Effect.succeed(undefined),
        tools: () => Effect.succeed([]),
      } as any),
    ),
    Layer.succeed(
      Truncate.Service,
      Truncate.Service.of({
        output: (text: string) => Effect.succeed({ text, truncated: false }),
      } as any),
    ),
    Layer.succeed(LSP.Service, {} as any),
    Layer.succeed(FileTime.Service, {
      get: () => Effect.succeed(0),
    } as any),
    Layer.succeed(ProviderService, {
      getSideModel: () => Effect.succeed({ providerID: "test", modelID: "test-model" }),
      getLanguage: () => Effect.succeed(mockLanguageModel),
      getModel: () => Effect.succeed(createModel({ context: 16000, output: 4000 })),
    } as any),
    llmLayer,
    NodeFileSystem.layer,
    NodePath.layer,
  )

  let l: Layer.Layer<any, any, any> = providers
  l = Layer.provideMerge(InputResolver.layer, l)
  l = Layer.provideMerge(ToolOrchestrator.layer, l)
  l = Layer.provideMerge(SessionProcessor.layer, l)
  l = Layer.provideMerge(SessionCompaction.layer, l)
  l = Layer.provideMerge(SessionEngine.layer, l)

  return l
}

const usage = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  inputTokenDetails: { noCacheTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  outputTokenDetails: { textTokens: 0, reasoningTokens: 0 },
}

describe("session.prompt.engine Continuity Handover", () => {
  const l = llm()
  const layer = liveLayer(l.layer)
  const { live: it } = testEffect(layer as any)

  afterEach(() => {
    l.clear()
  })

  test("SessionCompaction.isOverflow accuracy", () => {
    const model = createModel({ context: 16000, output: 4000 })
    const cfg = { compaction: { auto: true, reserved: 2000 } } as any

    expect(isOverflow({ cfg, tokens: 10000, model })).toBe(false)
    expect(isOverflow({ cfg, tokens: 15000, model })).toBe(true)
  })

  it("Diagnostic: engine creation works", () =>
    Effect.gen(function* () {
      const engine = yield* SessionEngine.Service
      expect(engine).toBeDefined()
    }))

  it(
    "Proactive Handshake: triggers transition before overflow based on estimate",
    () =>
      provideTmpdirInstance((tmpPath) =>
        Effect.gen(function* () {
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Recovered." } as any,
              { type: "text-end" } as any,
              { type: "finish-step", finishReason: "stop", usage } as any,
            ),
          )
          yield* Effect.promise(() => fs.writeFile(path.join(tmpPath, "AGENTS.md"), "# Agents"))
          const sessions = yield* Session.Service
          const session = yield* sessions.create({})
          const sessionID = session.id

          const msg = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "build",
            model: ref,
            time: { created: Date.now() },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID,
            type: "text",
            text: "A".repeat(80000),
          })

          const engine = yield* SessionEngine.Service
          yield* engine.runLoop(sessionID)

          const msgs = yield* sessions.messages({ sessionID })
          const hasTransition = msgs.some((m) => m.parts.some((p) => p.type === "transition"))
          expect(hasTransition).toBe(true)

          const dir = yield* InstanceState.directory
          const continuityPath = path.join(dir, ".epoch-continuity.toon")
          const exists = yield* Effect.promise(() =>
            fs
              .stat(continuityPath)
              .then(() => true)
              .catch(() => false),
          )
          expect(exists).toBe(true)
        }),
      ),
    30000,
  )

  it(
    "Emergency Handshake: triggers transition when LLM throws ContextOverflowError",
    () =>
      provideTmpdirInstance((tmpPath) =>
        Effect.gen(function* () {
          l.push(() => {
            const err = new Error("prompt is too long")
            ;(err as any).statusCode = 400
            ;(err as any).responseBody = '{"error": {"message": "prompt is too long"}}'
            ;(err as any).name = "APICallError"
            throw err
          })
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Recovered." } as any,
              { type: "text-end" } as any,
              { type: "finish-step", finishReason: "stop", usage } as any,
            ),
          )

          yield* Effect.promise(() => fs.writeFile(path.join(tmpPath, "AGENTS.md"), "# Agents"))
          const sessions = yield* Session.Service
          const session = yield* sessions.create({})
          const sessionID = session.id

          const msg = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "build",
            model: ref,
            time: { created: Date.now() },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID,
            type: "text",
            text: "Try to process this.",
          })

          const engine = yield* SessionEngine.Service
          yield* engine.runLoop(sessionID)

          const msgs = yield* sessions.messages({ sessionID })
          const hasTransition = msgs.some((m) => m.parts.some((p) => p.type === "transition"))
          expect(hasTransition).toBe(true)

          const dir = yield* InstanceState.directory
          const continuityPath = path.join(dir, ".epoch-continuity.toon")
          const exists = yield* Effect.promise(() =>
            fs
              .stat(continuityPath)
              .then(() => true)
              .catch(() => false),
          )
          expect(exists).toBe(true)

          const interruptedPath = path.join(dir, ".history", "interrupted_state.toon")
          const interruptedExists = yield* Effect.promise(() =>
            fs
              .stat(interruptedPath)
              .then(() => true)
              .catch(() => false),
          )
          expect(interruptedExists).toBe(true)

          const content = yield* Effect.promise(() => fs.readFile(interruptedPath, "utf-8"))
          expect(content).toContain("interrupted_state:")
          expect(content).toContain("context_of_interruption: 'Test interruption'")
        }),
      ),
    30000,
  )

  it(
    "Emergency Handshake: triggers transition when LLM throws nested 500 Context size error (Run 6)",
    () =>
      provideTmpdirInstance((tmpPath) =>
        Effect.gen(function* () {
          l.push(() => {
            const err = new Error("Internal Server Error")
            ;(err as any).statusCode = 500
            ;(err as any).responseBody = '{"error":{"code":500,"message":"Context size has been exceeded."}}'
            ;(err as any).name = "APICallError"
            throw err
          })
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Recovered." } as any,
              { type: "text-end" } as any,
              { type: "finish-step", finishReason: "stop", usage } as any,
            ),
          )

          yield* Effect.promise(() => fs.writeFile(path.join(tmpPath, "AGENTS.md"), "# Agents"))
          const sessions = yield* Session.Service
          const session = yield* sessions.create({})
          const sessionID = session.id

          const msg = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "build",
            model: ref,
            time: { created: Date.now() },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID,
            type: "text",
            text: "Trigger nested 500 overflow.",
          })

          const engine = yield* SessionEngine.Service
          yield* engine.runLoop(sessionID)

          const msgs = yield* sessions.messages({ sessionID })
          const hasTransition = msgs.some((m) => m.parts.some((p) => p.type === "transition"))
          expect(hasTransition).toBe(true)

          const dir = yield* InstanceState.directory
          const continuityPath = path.join(dir, ".epoch-continuity.toon")
          const exists = yield* Effect.promise(() =>
            fs
              .stat(continuityPath)
              .then(() => true)
              .catch(() => false),
          )
          expect(exists).toBe(true)
        }),
      ),
    30000,
  )

  it(
    "Emergency Handshake: triggers transition when LLM throws flat JSON context overflow (Run 1)",
    () =>
      provideTmpdirInstance((tmpPath) =>
        Effect.gen(function* () {
          l.push(() => {
            const err = new Error("Bad Request")
            ;(err as any).statusCode = 400
            ;(err as any).responseBody = '{"error":"Context size has been exceeded."}'
            ;(err as any).name = "APICallError"
            throw err
          })
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Recovered." } as any,
              { type: "text-end" } as any,
              { type: "finish-step", finishReason: "stop", usage } as any,
            ),
          )

          yield* Effect.promise(() => fs.writeFile(path.join(tmpPath, "AGENTS.md"), "# Agents"))
          const sessions = yield* Session.Service
          const session = yield* sessions.create({})
          const sessionID = session.id

          const msg = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "build",
            model: ref,
            time: { created: Date.now() },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID,
            type: "text",
            text: "Trigger flat JSON overflow.",
          })

          const engine = yield* SessionEngine.Service
          yield* engine.runLoop(sessionID)

          const msgs = yield* sessions.messages({ sessionID })
          const hasTransition = msgs.some((m) => m.parts.some((p) => p.type === "transition"))
          expect(hasTransition).toBe(true)
        }),
      ),
    30000,
  )

  it(
    "Emergency Handshake: triggers transition when LLM streams flat context overflow error",
    () =>
      provideTmpdirInstance((tmpPath) =>
        Effect.gen(function* () {
          l.push(Stream.make({ type: "error", error: new Error("Context size has been exceeded.") } as any))
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Recovered." } as any,
              { type: "text-end" } as any,
              { type: "finish-step", finishReason: "stop", usage } as any,
            ),
          )

          yield* Effect.promise(() => fs.writeFile(path.join(tmpPath, "AGENTS.md"), "# Agents"))
          const sessions = yield* Session.Service
          const session = yield* sessions.create({})
          const sessionID = session.id

          const msg = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "build",
            model: ref,
            time: { created: Date.now() },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID,
            type: "text",
            text: "Try to process this.",
          })

          const engine = yield* SessionEngine.Service
          yield* engine.runLoop(sessionID)

          const msgs = yield* sessions.messages({ sessionID })
          const hasTransition = msgs.some((m) => m.parts.some((p) => p.type === "transition"))
          expect(hasTransition).toBe(true)

          const dir = yield* InstanceState.directory
          const continuityPath = path.join(dir, ".epoch-continuity.toon")
          const exists = yield* Effect.promise(() =>
            fs
              .stat(continuityPath)
              .then(() => true)
              .catch(() => false),
          )
          expect(exists).toBe(true)
        }),
      ),
    30000,
  )

  it(
    "Emergency Handshake: preserves partial tool call fragments during mid-stream overflow",
    () =>
      provideTmpdirInstance((tmpPath) =>
        Effect.gen(function* () {
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Starting write." } as any,
              { type: "text-end" } as any,
              { type: "tool-input-start", id: "call_abc", toolName: "write" } as any,
              { type: "tool-input-delta", id: "call_abc", delta: '{"file"' } as any,
              { type: "tool-input-delta", id: "call_abc", delta: ':"large' } as any,
              { type: "tool-input-delta", id: "call_abc", delta: '.json","content":' } as any,
            ).pipe(
              Stream.concat(
                Stream.fail(new Error("Context size has been exceeded."))
              )
            )
          )

          // Mock the second stream (recovery turn)
          l.push(
            Stream.make(
              { type: "text-start" } as any,
              { type: "text-delta", text: "Recovered." } as any,
              { type: "text-end" } as any,
              { type: "finish-step", finishReason: "stop", usage } as any,
            ),
          )

          yield* Effect.promise(() => fs.writeFile(path.join(tmpPath, "AGENTS.md"), "# Agents"))
          const sessions = yield* Session.Service
          const session = yield* sessions.create({})
          const sessionID = session.id

          const msg = yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "build",
            model: ref,
            time: { created: Date.now() },
          })
          yield* sessions.updatePart({
            id: PartID.ascending(),
            messageID: msg.id,
            sessionID,
            type: "text",
            text: "Try to process this.",
          })

          const engine = yield* SessionEngine.Service
          yield* engine.runLoop(sessionID)

          const msgs = yield* sessions.messages({ sessionID })
          const hasTransition = msgs.some((m) => m.parts.some((p) => p.type === "transition"))
          expect(hasTransition).toBe(true)

          const dir = yield* InstanceState.directory
          const interruptedPath = path.join(dir, ".history", "interrupted_state.toon")
          
          const content = yield* Effect.promise(() => fs.readFile(interruptedPath, "utf-8"))
          expect(content).toContain("interrupted_state:")
          
          // Check that the analyzer successfully extracted the partial fragment
          // Since we mocked the LLM sideModel directly, we just verify the handler and DB extraction worked.
          // Wait, the mock LanguageModel for test-side-model doesn't echo the prompt back. Let's verify the DB state instead.
          const msgWithError = msgs.find(m => m.info.role === "assistant" && m.parts.some(p => p.type === "tool" && p.state.status === "error"))
          expect(msgWithError).toBeDefined()
          const toolPart = msgWithError?.parts.find(p => p.type === "tool") as any
          expect(toolPart.state.status).toBe("error")
          expect((toolPart.state as any).raw).toBe('{"file":"large.json","content":')
        }),
      ),
    30000,
  )
})
