import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import { Session } from "."
import { SessionID, MessageID, PartID } from "./schema"
import { Provider } from "../provider/provider"
import { MessageV2 } from "./message-v2"
import z from "zod"
import { Log } from "../util/log"
import { SessionProcessor } from "./processor"
import { Agent } from "@/agent/agent"
import { Plugin } from "@/plugin"
import { Config } from "@/config/config"
import { ModelID, ProviderID } from "@/provider/schema"
import { Effect, Layer, ServiceMap } from "effect"
import { makeRuntime } from "@/effect/run-service"
import { isOverflow as overflow } from "./overflow"

export namespace SessionCompaction {
  const log = Log.create({ service: "session.transition" })

  export const Event = {
    Transitioned: BusEvent.define(
      "session.transitioned",
      z.object({
        sessionID: SessionID.zod,
      }),
    ),
  }

  export interface Interface {
    readonly isOverflow: (input: {
      tokens: MessageV2.Assistant["tokens"]
      model: Provider.Model
    }) => Effect.Effect<boolean>
  }

  export class Service extends ServiceMap.Service<Service, Interface>()("@epochcli/SessionTransition") {}

  export const layer: Layer.Layer<
    Service,
    never,
    | Bus.Service
    | Config.Service
    | Session.Service
    | Agent.Service
    | Plugin.Service
    | SessionProcessor.Service
    | Provider.Service
  > = Layer.effect(
    Service,
    Effect.gen(function* () {
      const config = yield* Config.Service

      const isOverflow = Effect.fn("SessionCompaction.isOverflow")(function* (input: {
        tokens: MessageV2.Assistant["tokens"]
        model: Provider.Model
      }) {
        return overflow({ cfg: yield* config.get(), tokens: input.tokens, model: input.model })
      })

      return Service.of({
        isOverflow,
      })
    }),
  )

  export const defaultLayer = Layer.unwrap(
    Effect.sync(() =>
      layer.pipe(
        Layer.provide(Provider.defaultLayer),
        Layer.provide(Session.defaultLayer),
        Layer.provide(SessionProcessor.defaultLayer),
        Layer.provide(Agent.defaultLayer),
        Layer.provide(Plugin.defaultLayer),
        Layer.provide(Bus.layer),
        Layer.provide(Config.defaultLayer),
      ),
    ),
  )

  const { runPromise } = makeRuntime(Service, defaultLayer)

  export async function isOverflow(input: { tokens: MessageV2.Assistant["tokens"]; model: Provider.Model }) {
    return runPromise((svc) => svc.isOverflow(input))
  }
}
