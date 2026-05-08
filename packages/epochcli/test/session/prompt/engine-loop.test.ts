import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SessionEngine } from "../../../src/session/prompt/engine"
import { Session } from "../../../src/session"
import { Agent } from "../../../src/agent/agent"
import { Provider } from "../../../src/provider/provider"
import { Bus } from "../../../src/bus"
import { Plugin } from "../../../src/plugin"
import { SessionStatus } from "../../../src/session/status"
import { SessionCompaction } from "../../../src/session/compaction"
import { SessionProcessor } from "../../../src/session/processor"
import { Instruction } from "../../../src/session/instruction"
import { InputResolver } from "../../../src/session/prompt/resolver"
import { ToolOrchestrator } from "../../../src/session/prompt/orchestrator"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { InstanceRef } from "@/effect/instance-ref"
import { testEffect } from "../../lib/effect"
import { SessionID } from "../../../src/session/schema"

const mockDeps = Layer.mergeAll(
  Layer.succeed(Bus.Service, Bus.Service.of({ publish: () => Effect.void } as any)),
  Layer.succeed(
    Session.Service,
    Session.Service.of({
      get: () => Effect.succeed({} as any),
      updateMessage: () => Effect.void,
      updatePart: () => Effect.void,
    } as any),
  ),
  Layer.succeed(
    Agent.Service,
    Agent.Service.of({
      get: () => Effect.succeed(undefined),
      list: () => Effect.succeed([]),
    } as any),
  ),
  Layer.succeed(Provider.Service, Provider.Service.of({} as any)),
  Layer.succeed(
    Plugin.Service,
    Plugin.Service.of({ trigger: (name: string, payload: any, state: any) => Effect.succeed(state) } as any),
  ),
  Layer.succeed(ChildProcessSpawner, ChildProcessSpawner.of({} as any)),
  Layer.succeed(SessionStatus.Service, SessionStatus.Service.of({ set: () => Effect.void } as any)),
  Layer.succeed(SessionCompaction.Service, SessionCompaction.Service.of({} as any)),
  Layer.succeed(SessionProcessor.Service, SessionProcessor.Service.of({} as any)),
  Layer.succeed(Instruction.Service, Instruction.Service.of({} as any)),
  Layer.succeed(
    InputResolver.Service,
    InputResolver.Service.of({
      lastModel: () => Effect.succeed({ providerID: "p", modelID: "m" }),
    } as any),
  ),
  Layer.succeed(ToolOrchestrator.Service, ToolOrchestrator.Service.of({} as any)),
)

const { effect: it } = testEffect(SessionEngine.layer.pipe(Layer.provideMerge(mockDeps)))

const testContext = { worktree: "/tmp", directory: "/tmp", project: { directory: "/tmp" } as any }

describe("SessionEngine", () => {
  it("shellImpl - fails when agent not found", () =>
    Effect.gen(function* () {
      const engine = yield* SessionEngine.Service
      const sessionID = SessionID.descending()

      const task = engine.shellImpl(
        {
          sessionID,
          command: "echo 1",
          agent: "non-existent",
        },
        new AbortController().signal,
      )

      const result = yield* Effect.exit(task)
      expect(result._tag).toBe("Failure")
    }).pipe(Effect.provideService(InstanceRef, testContext)))
})
