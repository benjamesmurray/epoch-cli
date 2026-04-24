import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { ToolOrchestrator } from "../../../src/session/prompt/orchestrator"
import { AppFileSystem } from "../../../src/filesystem"
import { Session } from "../../../src/session"
import { Agent } from "../../../src/agent/agent"
import { Provider } from "../../../src/provider/provider"
import { Bus } from "../../../src/bus"
import { Plugin } from "../../../src/plugin"
import { MCP } from "../../../src/mcp"
import { LSP } from "../../../src/lsp"
import { FileTime } from "../../../src/file/time"
import { ToolRegistry } from "../../../src/tool/registry"
import { Truncate } from "../../../src/tool/truncate"
import { Permission } from "../../../src/permission"
import { InputResolver } from "../../../src/session/prompt/resolver"
import { InstanceRef } from "@/effect/instance-ref"
import { testEffect } from "../../lib/effect"
import { SessionID, MessageID } from "../../../src/session/schema"

const mockFsys = Layer.succeed(AppFileSystem.Service, AppFileSystem.Service.of({} as any))
const mockBus = Layer.succeed(Bus.Service, Bus.Service.of({ publish: () => Effect.void } as any))
const mockSessions = Layer.succeed(Session.Service, Session.Service.of({ updatePart: () => Effect.void } as any))
const mockAgents = Layer.succeed(Agent.Service, Agent.Service.of({} as any))
const mockPlugin = Layer.succeed(Plugin.Service, Plugin.Service.of({ trigger: (name: string, payload: any, state: any) => Effect.succeed(state) } as any))
const mockMcp = Layer.succeed(MCP.Service, MCP.Service.of({ tools: () => Effect.succeed({}) } as any))
const mockRegistry = Layer.succeed(ToolRegistry.Service, ToolRegistry.Service.of({ tools: () => Effect.succeed([]) } as any))
const mockTruncate = Layer.succeed(Truncate.Service, Truncate.Service.of({} as any))
const mockPermission = Layer.succeed(Permission.Service, Permission.Service.of({ ask: () => Effect.succeed(true) } as any))
const mockResolver = Layer.succeed(InputResolver.Service, InputResolver.Service.of({} as any))

const mockDeps = Layer.mergeAll(
  mockFsys,
  mockBus,
  mockSessions,
  mockAgents,
  mockPlugin,
  mockMcp,
  mockRegistry,
  mockTruncate,
  mockPermission,
  mockResolver,
)

const { effect: it } = testEffect(ToolOrchestrator.layer.pipe(Layer.provideMerge(mockDeps)))

const testContext = { worktree: "/tmp", directory: "/tmp", project: { directory: "/tmp" } as any }

describe("ToolOrchestrator", () => {
  it("createStructuredOutputTool - returns a tool with correct schema", () =>
    Effect.gen(function* () {
      const orchestrator = yield* ToolOrchestrator.Service
      let success = false
      const tool = orchestrator.createStructuredOutputTool({
        schema: { type: "object", properties: { result: { type: "string" } } },
        onSuccess: (args: any) => { 
          if (args.result === "done") success = true 
        }
      })

      expect(tool.description).toContain("structured format")
      // @ts-ignore
      yield* Effect.promise(() => tool.execute({ result: "done" }, { abortSignal: new AbortController().signal, toolCallId: "1" }))
      expect(success).toBe(true)
    }),
  )

  it("resolveTools - returns tools from registry", () =>
    Effect.gen(function* () {
      const orchestrator = yield* ToolOrchestrator.Service
      const tools = yield* orchestrator.resolveTools({
        agent: { name: "build", tools: [], permission: [] } as any,
        model: { providerID: "openai", modelID: "gpt-4", api: { id: "gpt-4" } } as any,
        session: { id: SessionID.descending() } as any,
        processor: { message: { id: MessageID.ascending() }, partFromToolCall: () => undefined } as any,
        bypassAgentCheck: true,
        messages: []
      })

      expect(tools).toBeDefined()
    }).pipe(Effect.provideService(InstanceRef, testContext)),
  )
})
