import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { SessionState } from "../../../src/session/prompt/state"
import { SessionStatus } from "../../../src/session/status"
import { Bus } from "../../../src/bus"
import { testEffect } from "../../lib/effect"
import { SessionID, MessageID } from "../../../src/session/schema"
import { Session } from "../../../src/session"
import { InstanceRef } from "@/effect/instance-ref"

const mockStatus = Layer.succeed(
  SessionStatus.Service,
  SessionStatus.Service.of({
    set: () => Effect.void,
    get: () => Effect.succeed({ type: "idle" } as any),
  } as any),
)

const mockBus = Layer.succeed(Bus.Service, Bus.Service.of({ publish: () => Effect.void } as any))

const mockDeps = Layer.mergeAll(mockStatus, mockBus, Session.defaultLayer)

const { effect: it } = testEffect(SessionState.layer.pipe(Layer.provideMerge(mockDeps)))

const testContext = { worktree: "/tmp", directory: "/tmp", project: { directory: "/tmp" } as any }

describe("SessionState", () => {
  it("getRunner - returns new runner and caches it", () =>
    Effect.gen(function* () {
      const state = yield* SessionState.Service
      const sessionID = SessionID.descending()

      const runner1 = yield* state.getRunner(sessionID)
      const runner2 = yield* state.getRunner(sessionID)

      expect(runner1).toBeDefined()
      expect(runner1).toBe(runner2)
    }).pipe(Effect.provideService(InstanceRef, testContext)))

  it("assertNotBusy - succeeds when idle", () =>
    Effect.gen(function* () {
      const state = yield* SessionState.Service
      const sessionID = SessionID.descending()

      yield* state.assertNotBusy(sessionID)
      // Success if no throw
    }).pipe(Effect.provideService(InstanceRef, testContext)))

  it("cancel - ignores if no runner", () =>
    Effect.gen(function* () {
      const state = yield* SessionState.Service
      const sessionID = SessionID.descending()

      yield* state.cancel(sessionID)
      // Should resolve cleanly
    }).pipe(Effect.provideService(InstanceRef, testContext)))
})
