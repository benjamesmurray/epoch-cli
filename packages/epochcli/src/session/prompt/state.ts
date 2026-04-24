import { Effect, Layer, ServiceMap, Scope } from "effect"
import { InstanceState } from "@/effect/instance-state"
import { Runner } from "@/effect/runner"
import { MessageV2 } from "../message-v2"
import { SessionID } from "../schema"
import { SessionStatus } from "../status"
import { Log } from "../../util/log"
import { Session } from "../index"

export namespace SessionState {
  const log = Log.create({ service: "session.prompt.state" })

  export interface Interface {
    readonly getRunner: (sessionID: SessionID) => Effect.Effect<Runner<MessageV2.WithParts>>
    readonly assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError>
    readonly cancel: (sessionID: SessionID) => Effect.Effect<void>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionPrompt/State") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const scope = yield* Scope.Scope
      const status = yield* SessionStatus.Service

      const lastAssistant = (sessionID: SessionID) =>
        Effect.promise(async () => {
          let latest: MessageV2.WithParts | undefined
          for await (const item of MessageV2.stream(sessionID)) {
            latest ??= item
            if (item.info.role !== "user") return item
          }
          if (latest) return latest
          throw new Error("Impossible")
        })

      const state = yield* InstanceState.make(
        Effect.fn("SessionState.make")(function* () {
          const runners = new Map<string, Runner<MessageV2.WithParts>>()
          yield* Effect.addFinalizer(
            Effect.fnUntraced(function* () {
              yield* Effect.forEach(runners.values(), (r) => r.cancel, { concurrency: "unbounded", discard: true })
              runners.clear()
            }),
          )
          return { runners }
        }),
      )

      const getRunner = Effect.fn("SessionState.getRunner")(function* (sessionID: SessionID) {
        const s = yield* InstanceState.get(state)
        const existing = s.runners.get(sessionID)
        if (existing) return existing
        const runner = Runner.make<MessageV2.WithParts>(scope, {
          onIdle: Effect.gen(function* () {
            s.runners.delete(sessionID)
            yield* status.set(sessionID, { type: "idle" })
          }),
          onBusy: status.set(sessionID, { type: "busy" }),
          onInterrupt: lastAssistant(sessionID),
          busy: () => {
            throw new Session.BusyError(sessionID)
          },
        })
        s.runners.set(sessionID, runner)
        return runner
      })

      const assertNotBusy: (sessionID: SessionID) => Effect.Effect<void, Session.BusyError> = Effect.fn(
        "SessionState.assertNotBusy",
      )(function* (sessionID: SessionID) {
        const s = yield* InstanceState.get(state)
        const runner = s.runners.get(sessionID)
        if (runner?.busy) throw new Session.BusyError(sessionID)
      })

      const cancel = Effect.fn("SessionState.cancel")(function* (sessionID: SessionID) {
        log.info("cancel", { sessionID })
        const s = yield* InstanceState.get(state)
        const runner = s.runners.get(sessionID)
        if (!runner || !runner.busy) {
          yield* status.set(sessionID, { type: "idle" })
          return
        }
        yield* runner.cancel
      })

      return Service.of({
        getRunner,
        assertNotBusy,
        cancel,
      })
    })
  )
}
