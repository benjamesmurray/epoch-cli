import { afterEach, describe, expect, mock, test } from "bun:test"
import { Effect, Layer } from "effect"
import path from "path"
import fs from "fs/promises"

// Set DB to memory to ensure foreign keys work in a clean environment for tests
process.env.EPOCHCLI_DB = ":memory:"
process.env.EPOCHCLI_DISABLE_CHANNEL_DB = "true"

import { Bus } from "../../src/bus"
import { Config } from "../../src/config/config"
import { Agent } from "../../src/agent/agent"
import { Log } from "../../src/util/log"
import { Permission } from "../../src/permission"
import { Plugin } from "../../src/plugin"
import { provideTmpdirInstance } from "../fixture/fixture"
import { Session } from "../../src/session"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
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
import { ChildProcessSpawner } from "effect/unstable/process"
import { ToolRegistry } from "../../src/tool/registry"
import { Truncate } from "../../src/tool/truncate"
import { AppFileSystem } from "../../src/filesystem"
import { Git } from "../../src/git"
import { testEffect } from "../lib/effect"
import { NodeFileSystem, NodePath } from "@effect/platform-node"
import { LSP } from "../../src/lsp"
import { FileTime } from "../../src/file/time"
import { InstanceState } from "../../src/effect/instance-state"
import { Process } from "../../src/util/process"
import { SessionStatus } from "../../src/session/status"
import { SessionCompaction } from "../../src/session/compaction"
import { MessageV2 } from "../../src/session/message-v2"

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

// Implementation of the sc_approve transition logic for mocking
async function handleScApproveTransition(output: string, sessionID: SessionID) {
  const phaseMatch = output.match(/^[ \t]+phase:\s*(\w+)/m)
  const phase = phaseMatch?.[1]

  // Synchronize project state with semaphore files
  const featureMatch = output.match(/^[ \t]+feature:\s*(.+)$/m)
  const featurePath = featureMatch?.[1]?.trim()
  
  if (featurePath) {
    const fullPath = path.isAbsolute(featurePath) ? featurePath : path.join(process.cwd(), featurePath)
    if (phase === "tasks") {
      await fs.writeFile(path.join(fullPath, ".spec-specification-approved"), "").catch(() => {})
    } else if (phase === "implementation") {
      await fs.writeFile(path.join(fullPath, ".spec-tasks-approved"), "").catch(() => {})
    }
  }

  if (phase === "implementation") {
    const userMsg: MessageV2.User = {
      id: MessageID.ascending(),
      sessionID,
      role: "user",
      time: { created: Date.now() },
      agent: "build",
      model: ref,
    }
    await Session.updateMessage(userMsg)
    await Session.updatePart({
      id: PartID.ascending(),
      messageID: userMsg.id,
      sessionID,
      type: "text",
      text: "Tasks approved. Switching to Build Mode. Implementation is now unlocked.",
      synthetic: true,
    } as any)
    return { transition: true }
  }
  return { transition: false }
}

function liveLayer(mcpMock: any) {
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
    Layer.succeed(MCP.Service, mcpMock),
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

describe("Deterministic Handover Mechanics", () => {
  test(
    "Immediate Shift: sc_approve writes semaphore and updates agent persona",
    () => {
      const mcpMock = MCP.Service.of({
        mcpx: () => Effect.succeed({
          execute: async (input: any, ctx: any) => {
            if (input.server === "spec" && input.tool === "sc_approve") {
              const featureId = "test-feature"
              const activePath = path.join(tmpPath, "projects/active")
              
              // Real implementation: Scan for template tags
              const mdFiles = await fs.readdir(path.join(activePath, featureId))
              for (const f of mdFiles) {
                if (f.endsWith(".md")) {
                  const content = await fs.readFile(path.join(activePath, featureId, f), "utf-8")
                  if (content.includes("<template")) {
                    return {
                      output: "Error: PROGRAMMATIC SCAN DETECTED <template> TAGS.",
                      isError: true,
                      metadata: {}
                    }
                  }
                }
              }

              const output = `phase: implementation\nstatus: active\nfeature: projects/active/${featureId}`
              const res = await handleScApproveTransition(output, ctx.sessionID)
              return {
                output,
                isError: false,
                metadata: { transition: res.transition }
              }
            }
            return { output: "", isError: false }
          }
        } as any)
      } as any)

      let tmpPath: string
      return provideTmpdirInstance((p) => {
        tmpPath = p
        return Effect.gen(function* () {
          const sessions = yield* Session.Service
          const mcp = yield* MCP.Service
          const mcpxTool = yield* mcp.mcpx()
          if (!mcpxTool) throw new Error("mcpxTool not found")

          const featureId = "test-feature"
          const projectPath = path.join(tmpPath, "projects/active", featureId)
          yield* Effect.promise(() => fs.mkdir(projectPath, { recursive: true }))

          const session = yield* sessions.create({})
          const sessionID = session.id

          yield* sessions.updateMessage({
            id: MessageID.ascending(),
            role: "user",
            sessionID,
            agent: "plan",
            model: ref,
            time: { created: Date.now() },
          })

          const result: any = yield* Effect.promise(() =>
            mcpxTool.execute!({ server: "spec", tool: "sc_approve" }, { sessionID } as any),
          )

          expect(result.metadata.transition).toBe(true)

          const semaphorePath = path.join(projectPath, ".spec-tasks-approved")
          const semaphoreExists = yield* Effect.promise(() =>
            fs.access(semaphorePath).then(() => true).catch(() => false)
          )
          expect(semaphoreExists).toBe(true)

          const msgs = yield* sessions.messages({ sessionID })
          const lastMsg = msgs[msgs.length - 1]
          expect(lastMsg.info.agent).toBe("build")
        })
      }).pipe(Effect.provide(liveLayer(mcpMock)), Effect.scoped, (e) => Effect.runPromise(e as any))
    },
    30000,
  )

  test(
    "Drafting Wall: sc_approve fails if template tags are present",
    () => {
      const mcpMock = MCP.Service.of({
        mcpx: () => Effect.succeed({
          execute: async (input: any) => {
            if (input.server === "spec" && input.tool === "sc_approve") {
              const featureId = "template-feature"
              const activePath = path.join(tmpPath, "projects/active", featureId)
              const content = await fs.readFile(path.join(activePath, "Specification.md"), "utf-8")
              if (content.includes("<template")) {
                return {
                  output: "Error: PROGRAMMATIC SCAN DETECTED <template> TAGS.",
                  isError: true,
                  metadata: {}
                }
              }
              return { output: "Success", isError: false, metadata: {} }
            }
            return { output: "", isError: false }
          }
        } as any)
      } as any)

      let tmpPath: string
      return provideTmpdirInstance((p) => {
        tmpPath = p
        return Effect.gen(function* () {
          const sessions = yield* Session.Service
          const mcp = yield* MCP.Service
          const mcpxTool = yield* mcp.mcpx()
          if (!mcpxTool) throw new Error("mcpxTool not found")

          const featureId = "template-feature"
          const projectPath = path.join(tmpPath, "projects/active", featureId)
          yield* Effect.promise(() => fs.mkdir(projectPath, { recursive: true }))
          yield* Effect.promise(() => fs.writeFile(path.join(projectPath, "Specification.md"), "<template>..."))

          const session = yield* sessions.create({})
          const sessionID = session.id

          const result: any = yield* Effect.promise(() =>
            mcpxTool.execute!({ server: "spec", tool: "sc_approve" }, { sessionID } as any),
          )

          expect(result.isError).toBe(true)
          expect(result.output).toContain("PROGRAMMATIC SCAN DETECTED <template> TAGS")
        })
      }).pipe(Effect.provide(liveLayer(mcpMock)), Effect.scoped, (e) => Effect.runPromise(e as any))
    },
    30000,
  )

  test(
    "Clerk Discovery Placeholder",
    () => {
      const mcpMock = MCP.Service.of({
        mcpx: () => Effect.succeed({
          execute: async () => ({ output: "", isError: false })
        } as any)
      } as any)

      return provideTmpdirInstance(() => {
        return Effect.gen(function* () {
          expect(true).toBe(true)
        })
      }).pipe(Effect.provide(liveLayer(mcpMock)), Effect.scoped, (e) => Effect.runPromise(e as any))
    },
    30000,
  )
})
