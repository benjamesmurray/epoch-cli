import { afterEach, describe, expect, mock, test } from "bun:test"
import { Effect, Layer, ServiceMap } from "effect"
import * as Stream from "effect/Stream"
import path from "path"
import fs from "fs/promises"

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
import { MessageV2 } from "../../src/session/message-v2"
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
import { InstanceState } from "../../src/effect/instance-state"

Log.init({ print: false })

function createModel(opts: { context: number; output: number; input?: number }): any {
  return {
    id: "test-model",
    providerID: "test",
    name: "Test",
    limit: { context: opts.context, input: opts.input, output: opts.output },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    capabilities: {
      toolcall: true, attachment: false, reasoning: false, temperature: true, interleaved: false,
      input: { text: true, image: false, audio: false, video: false, pdf: false },
      output: { text: true, image: false, audio: false, video: false, pdf: false },
    },
    api: { id: "test-model", url: "https://example.com", npm: "@ai-sdk/openai" },
    options: {},
  }
}

class ProviderService extends ServiceMap.Service<ProviderService, any>()("@epochcli/Provider") {}

mock.module("../../src/provider/provider", () => ({
  Provider: {
    getSideModel: async () => ({ providerID: "test", modelID: "test-model" }),
    getLanguage: async () => ({
      specificationVersion: "v3",
      modelId: "test-side-model",
      doGenerate: async () => ({
        text: "NONE",
        content: [{ type: "text", text: "NONE" }],
        finishReason: "stop",
        usage: { promptTokens: 10, completionTokens: 10, inputTokens: 10, outputTokens: 10 },
      }),
    }),
    getModel: async () => createModel({ context: 16000, output: 4000 }),
    Service: ProviderService,
  },
}))

function llm() {
  const queue: any[] = []
  return {
    clear() { queue.length = 0 },
    push(stream: any) { queue.push(stream) },
    layer: Layer.succeed(
      LLM.Service,
      LLM.Service.of({
        stream: (input: any) => {
          const item = queue.shift()
          if (!item) return Stream.fail(new Error("Queue empty - stop test"))
          return item.pipe(Stream.mapEffect((event: any) => Effect.succeed(event)))
        },
      } as any),
    ),
  }
}

function liveLayer(llmLayer: Layer.Layer<LLM.Service>) {
  const bus = Bus.layer
  const status = SessionStatus.layer.pipe(Layer.provide(bus))
  const providers = Layer.mergeAll(
    status, bus, Config.defaultLayer, Session.defaultLayer, Agent.defaultLayer, Plugin.defaultLayer,
    Snapshot.defaultLayer, Instruction.defaultLayer, Permission.defaultLayer, CrossSpawnSpawner.defaultLayer,
    AppFileSystem.defaultLayer, Git.defaultLayer, Todo.defaultLayer,
    Layer.succeed(MCP.Service, { clients: () => Effect.succeed({}), tools: () => Effect.succeed({}) } as any),
    Layer.succeed(ToolRegistry.Service, { resolve: () => Effect.succeed({}), list: () => Effect.succeed([]), get: () => Effect.succeed(undefined), tools: () => Effect.succeed([]) } as any),
    Layer.succeed(Truncate.Service, { output: (text: string) => Effect.succeed({ text, truncated: false }) } as any),
    Layer.succeed(LSP.Service, {} as any),
    Layer.succeed(FileTime.Service, { get: () => Effect.succeed(0) } as any),
    Layer.succeed(ProviderService, { getSideModel: () => Effect.succeed({ providerID: "test", modelID: "test-model" }), getLanguage: () => Effect.succeed({}), getModel: () => Effect.succeed(createModel({ context: 16000, output: 4000 })) } as any),
    llmLayer, NodeFileSystem.layer, NodePath.layer,
  )
  let l: Layer.Layer<any, any, any> = providers
  l = Layer.provideMerge(InputResolver.layer, l)
  l = Layer.provideMerge(ToolOrchestrator.layer, l)
  l = Layer.provideMerge(SessionProcessor.layer, l)
  l = Layer.provideMerge(SessionCompaction.layer, l)
  l = Layer.provideMerge(SessionEngine.layer, l)
  return l
}

describe("Hard Reset Doom Loop Protection", () => {
  const l = llm()
  const layer = liveLayer(l.layer)
  const { live: it } = testEffect(layer as any)
  afterEach(() => { l.clear() })

  it("triggers a Hard Reset (transition) when stall score hits 20", () =>
    provideTmpdirInstance((tmpPath) =>
      Effect.gen(function* () {
        const session = yield* Session.Service
        const engine = yield* SessionEngine.Service

        const chat = yield* session.create({})
        const parentId = MessageID.ascending()
        yield* session.updateMessage({
          id: parentId,
          sessionID: chat.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ProviderID.make("test"), modelID: ModelID.make("test-model") },
        })

        // Create continuity file to prevent ENOENT during transition
        const fsNode = yield* Effect.promise(() => import("fs/promises"))
        yield* Effect.promise(() => fsNode.writeFile(path.join(tmpPath, ".epoch-continuity.toon"), "test"))

        // Simulate 3 loops of empty text in YOLO mode (10 points each, meaning 2 loops hits 20)
        for (let i = 0; i < 3; i++) {
          l.push(Stream.make(
            { type: "text-start" } as any,
            { type: "text-delta", text: "I am thinking..." } as any,
            { type: "text-end" } as any,
            { type: "finish-step", finishReason: "stop", usage: { totalTokens: 10 } } as any,
          ).pipe(Stream.tap(() => Effect.sync(() => console.log("Stream", i, "consumed")))))
        }

        // Push a task_complete to gracefully exit the YOLO loop after the transition
        l.push(Stream.make(
          { type: "tool-call", toolCallId: "1", toolName: "task_complete", args: {} } as any,
          { type: "finish-step", finishReason: "stop", usage: { totalTokens: 10 } } as any,
        ).pipe(Stream.tap(() => Effect.sync(() => console.log("Task Complete Stream consumed")))))

        console.log("Starting runLoop")
        const result = yield* engine.runLoop(chat.id, true) // yolo = true
        console.log("runLoop finished")

        // Read all messages to verify transition occurred
        const msgs = yield* MessageV2.filterByEpochEffect(chat.id)
        const transitionParts = msgs.flatMap(m => m.parts).filter(p => p.type === "transition")
        
        expect(transitionParts.length).toBeGreaterThan(0)
      }),
    ),
  )
})
