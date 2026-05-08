import { describe, expect, beforeAll, afterAll } from "bun:test"
import { Effect, Layer, Scope } from "effect"
import { Session } from "../../../src/session"
import { Instance } from "../../../src/project/instance"
import { InputResolver } from "../../../src/session/prompt/resolver"
import { AppFileSystem } from "../../../src/filesystem"
import { Agent } from "../../../src/agent/agent"
import { Provider } from "../../../src/provider/provider"
import { Bus } from "../../../src/bus"
import { Plugin } from "../../../src/plugin"
import { MCP } from "../../../src/mcp"
import { LSP } from "../../../src/lsp"
import { FileTime } from "../../../src/file/time"
import { ToolRegistry } from "../../../src/tool/registry"
import { Instruction } from "../../../src/session/instruction"
import { InstanceRef } from "@/effect/instance-ref"
import { testEffect } from "../../lib/effect"
import { SessionID, MessageID } from "../../../src/session/schema"
import { ProviderID, ModelID } from "../../../src/provider/schema"
import { Flag } from "../../../src/flag/flag"
import { InstanceState } from "../../../src/effect/instance-state"

const mockFsys = Layer.succeed(
  AppFileSystem.Service,
  AppFileSystem.Service.of({
    stat: (path: string) =>
      path.includes("exists.ts")
        ? Effect.succeed({ type: "File", size: 100, mtime: 0 } as any)
        : Effect.fail(new Error("Not found")),
    existsSafe: (path: string) => Effect.succeed(path.includes("plan.md")),
    readFileString: () => Effect.succeed(""),
    writeFileString: () => Effect.succeed(undefined),
    ensureDir: () => Effect.succeed(undefined),
  } as any),
)

const mockAgents = Layer.succeed(
  Agent.Service,
  Agent.Service.of({
    get: (name: string) =>
      ["coder", "build", "plan"].includes(name) ? Effect.succeed({ name } as any) : Effect.succeed(undefined),
    list: () => Effect.succeed([]),
    defaultAgent: () => Effect.succeed("build"),
  } as any),
)

const mockSessions = Layer.succeed(
  Session.Service,
  Session.Service.of({
    get: () => Effect.succeed({ id: "session-1", title: "New Session" } as any),
    updatePart: (part: any) => Effect.succeed(part as any),
    updateMessage: () => Effect.void,
    setTitle: () => Effect.void,
    touch: () => Effect.void,
    setPermission: () => Effect.void,
  } as any),
)

const mockBus = Layer.succeed(Bus.Service, Bus.Service.of({ publish: () => Effect.void } as any))
const mockProvider = Layer.succeed(
  Provider.Service,
  Provider.Service.of({ getModel: () => Effect.succeed({} as any) } as any),
)
const mockPlugin = Layer.succeed(
  Plugin.Service,
  Plugin.Service.of({ trigger: (name: string, payload: any, state: any) => Effect.succeed(state) } as any),
)
const mockMcp = Layer.succeed(MCP.Service, MCP.Service.of({ tools: () => Effect.succeed({}) } as any))
const mockLsp = Layer.succeed(LSP.Service, LSP.Service.of({ tools: () => Effect.succeed({}) } as any))
const mockFileTime = Layer.succeed(FileTime.Service, FileTime.Service.of({} as any))
const mockRegistry = Layer.succeed(
  ToolRegistry.Service,
  ToolRegistry.Service.of({ tools: () => Effect.succeed([]) } as any),
)
const mockInstruction = Layer.succeed(
  Instruction.Service,
  Instruction.Service.of({
    clear: () => Effect.void,
  } as any),
)

const mockDeps = Layer.mergeAll(
  mockFsys,
  mockAgents,
  mockSessions,
  mockBus,
  mockProvider,
  mockPlugin,
  mockMcp,
  mockLsp,
  mockFileTime,
  mockRegistry,
  mockInstruction,
)

const testEnv = InputResolver.layer.pipe(Layer.provideMerge(mockDeps))

const { effect: it } = testEffect(testEnv)

const testContext = { worktree: "/tmp", directory: "/tmp", project: { directory: "/tmp" } as any }

describe("InputResolver", () => {
  let originalPlanMode: boolean
  let originalSessionPlan: any

  beforeAll(() => {
    originalPlanMode = Flag.EPOCHCLI_EXPERIMENTAL_PLAN_MODE
    // @ts-ignore
    Flag.EPOCHCLI_EXPERIMENTAL_PLAN_MODE = true
    originalSessionPlan = Session.plan
    // @ts-ignore
    Session.plan = () => "/tmp/plan.md"
  })

  afterAll(() => {
    // @ts-ignore
    Flag.EPOCHCLI_EXPERIMENTAL_PLAN_MODE = originalPlanMode
    // @ts-ignore
    Session.plan = originalSessionPlan
  })

  it("resolvePromptParts - resolves existing file", () =>
    Effect.gen(function* () {
      const resolver = yield* InputResolver.Service
      const parts = yield* resolver.resolvePromptParts("check @exists.ts")

      expect(parts).toHaveLength(2)
      expect(parts[0]).toEqual({ type: "text", text: "check @exists.ts" })
      expect(parts[1].type).toBe("file")
      if (parts[1].type === "file") {
        expect(parts[1].filename).toBe("exists.ts")
      }
    }).pipe(Effect.provideService(InstanceRef, testContext)))

  it("resolvePromptParts - falls back to agent if file not found", () =>
    Effect.gen(function* () {
      const resolver = yield* InputResolver.Service
      const parts = yield* resolver.resolvePromptParts("ask @coder")

      expect(parts).toHaveLength(2)
      expect(parts[0]).toEqual({ type: "text", text: "ask @coder" })
      expect(parts[1]).toEqual({ type: "agent", name: "coder" })
    }).pipe(Effect.provideService(InstanceRef, testContext)))

  it("insertReminders - injects plan reminder in plan mode", () =>
    Effect.gen(function* () {
      const resolver = yield* InputResolver.Service
      const sessionID = SessionID.descending()
      const messageID = MessageID.ascending()
      const messages = [
        {
          info: { role: "user", id: messageID, sessionID },
          parts: [{ type: "text", text: "hi" }],
        },
      ] as any

      const result = yield* resolver.insertReminders({
        messages,
        agent: { name: "plan" } as any,
        session: { id: sessionID, slug: "test", time: { created: Date.now() } } as any,
      })

      const userMsg = result.find((m: any) => m.info.role === "user")
      expect(userMsg!.parts.some((p: any) => p.synthetic && p.text.includes("Plan mode is active"))).toBe(true)
    }).pipe(Effect.provideService(InstanceRef, testContext as any)))

  it("createUserMessage - creates a user message with parts", () =>
    Effect.gen(function* () {
      const resolver = yield* InputResolver.Service
      const sessionID = SessionID.descending()

      const result = yield* resolver.createUserMessage({
        sessionID,
        parts: [{ type: "text", text: "hello" }],
        agent: "build",
        model: { providerID: ProviderID.make("openai"), modelID: ModelID.make("gpt-4") },
      })

      expect(result.info.role).toBe("user")
      expect(result.info.sessionID).toBe(sessionID)
      expect(result.parts).toHaveLength(1)
      expect(result.parts[0].type).toBe("text")
    }).pipe(Effect.provideService(InstanceRef, testContext)))
})
