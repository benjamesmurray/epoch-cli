import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { provideTmpdirServer } from "../fixture/fixture"
import { it, testEffect } from "../lib/effect"
import { reply, TestLLMServer } from "../lib/llm-server"
import { SessionID, MessageID, PartID } from "../../src/session/schema"
import { MessageV2 } from "../../src/session/message-v2"
import { Session } from "../../src/session"
import { Agent as AgentSvc } from "../../src/agent/agent"
import { Provider } from "../../src/provider/provider"
import { ModelID, ProviderID } from "../../src/provider/schema"
import { SessionProcessor } from "../../src/session/processor"
import { LLM } from "../../src/session/llm"
import { SessionStatus } from "../../src/session/status"
import { Snapshot } from "../../src/snapshot"
import { Config } from "../../src/config/config"
import { Bus } from "../../src/bus"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { Todo } from "../../src/session/todo"
import * as CrossSpawnSpawner from "../../src/effect/cross-spawn-spawner"

import { AppFileSystem } from "../../src/filesystem"
import { NodeFileSystem } from "@effect/platform-node"

const ref = {
  providerID: ProviderID.make("test"),
  modelID: ModelID.make("test-model"),
}

const cfg = {
  provider: {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100000, output: 10000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: {
        apiKey: "test-key",
        baseURL: "http://localhost:1/v1",
      },
    },
  },
}

function providerCfg(url: string) {
  return {
    ...cfg,
    provider: {
      ...cfg.provider,
      test: {
        ...cfg.provider.test,
        options: {
          ...cfg.provider.test.options,
          baseURL: url,
        },
      },
    },
  }
}

function agent(): AgentSvc.Info {
  return {
    name: "build",
    mode: "primary",
    options: {},
    permission: [{ permission: "*", pattern: "*", action: "allow" }],
  }
}

function boot() {
  return Effect.gen(function* () {
    const processors = yield* SessionProcessor.Service
    const session = yield* Session.Service
    const provider = yield* Provider.Service
    return { processors, session, provider }
  })
}

const status = SessionStatus.layer.pipe(Layer.provideMerge(Bus.layer))
const infra = Layer.mergeAll(NodeFileSystem.layer, AppFileSystem.defaultLayer, CrossSpawnSpawner.defaultLayer)
const deps = Layer.mergeAll(
  Session.defaultLayer,
  Snapshot.defaultLayer,
  AgentSvc.defaultLayer,
  Permission.defaultLayer,
  Plugin.defaultLayer,
  Config.defaultLayer,
  Todo.defaultLayer,
  LLM.defaultLayer,
  Provider.defaultLayer,
  status,
).pipe(Layer.provideMerge(infra))
const env = Layer.mergeAll(TestLLMServer.layer, SessionProcessor.layer.pipe(Layer.provideMerge(deps)))

const it = testEffect(env)

it.live("session.processor rambling protection: aborts on actionless text > 3000 chars", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        // Mock LLM to return actionless text in chunks of random data
        const randomString = (len: number) => {
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 "
          let res = ""
          for (let i = 0; i < len; i++) res += chars.charAt(Math.floor(Math.random() * chars.length))
          return res
        }

        yield* llm.push(
          reply()
            .text(randomString(1500))
            .text(randomString(1500))
            .text(randomString(500))
            .stop(),
        )

        const chat = yield* session.create({})
        const parent = yield* session.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ref.providerID, modelID: ref.modelID },
        })
        
        const assistantMsg = yield* session.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          parentID: parent.id,
          role: "assistant",
          mode: "build",
          agent: "build",
          path: { cwd: dir, root: dir },
          modelID: ref.modelID,
          providerID: ref.providerID,
          time: { created: Date.now() },
        })

        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: assistantMsg,
          sessionID: chat.id,
          model: mdl,
        })

        const result = yield* handle.process({
          user: parent,
          sessionID: chat.id,
          model: mdl,
          agent: agent(),
          system: { zone1: [], zone2: [] },
          messages: [{ role: "user", content: "hi" }],
          tools: {},
        })

        expect(result).toBe("stop")
        const updatedMsg = MessageV2.get({ sessionID: chat.id, messageID: assistantMsg.id })
        expect(updatedMsg.info.error).toBeDefined()
        expect((updatedMsg.info.error as any).data.reason).toBe("STREAM_ABORT_RAMBLING")
      }),
    { git: true, config: (url) => providerCfg(url) },
  ),
)

it.live("session.processor rambling protection: aborts on repeating sentences", () =>
  provideTmpdirServer(
    ({ dir, llm }) =>
      Effect.gen(function* () {
        const { processors, session, provider } = yield* boot()

        // Mock LLM to repeat similar sentences
        const repeatingText = [
          "Let me read the key files to understand the project state.",
          "I will now read the key files to understand the project state.",
          "Read the key files to understand the project state.",
          "Let me read the key files to understand the project state again.",
        ].join(" ")
        
        yield* llm.push(reply().text(repeatingText).stop())

        const chat = yield* session.create({})
        const parent = yield* session.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          role: "user",
          time: { created: Date.now() },
          agent: "build",
          model: { providerID: ref.providerID, modelID: ref.modelID },
        })
        
        const assistantMsg = yield* session.updateMessage({
          id: MessageID.ascending(),
          sessionID: chat.id,
          parentID: parent.id,
          role: "assistant",
          mode: "build",
          agent: "build",
          path: { cwd: dir, root: dir },
          modelID: ref.modelID,
          providerID: ref.providerID,
          time: { created: Date.now() },
        })

        const mdl = yield* provider.getModel(ref.providerID, ref.modelID)
        const handle = yield* processors.create({
          assistantMessage: assistantMsg,
          sessionID: chat.id,
          model: mdl,
        })

        const result = yield* handle.process({
          user: parent,
          sessionID: chat.id,
          model: mdl,
          agent: agent(),
          system: { zone1: [], zone2: [] },
          messages: [{ role: "user", content: "hi" }],
          tools: {},
        })

        expect(result).toBe("stop")
        const updatedMsg = MessageV2.get({ sessionID: chat.id, messageID: assistantMsg.id })
        expect(updatedMsg.info.error).toBeDefined()
        expect((updatedMsg.info.error as any).data.reason).toBe("STREAM_ABORT_LOOP")
      }),
    { git: true, config: (url) => providerCfg(url) },
  ),
)
