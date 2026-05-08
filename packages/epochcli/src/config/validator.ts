import { Log } from "../util/log"
import { Effect } from "effect"
import type { Config } from "./config"

const log = Log.create({ service: "engine-validator" })

export namespace EngineConfigValidator {
  export const validate = Effect.fn("EngineConfigValidator.validate")(function* (config: Config.Info) {
    const mainProvider = config.provider?.["local-main"]
    const sideProvider = config.provider?.["local-side"]

    if (!mainProvider || !sideProvider) {
      log.debug("Dual-model orchestration providers not fully configured. Skipping validation.")
      return
    }

    log.info("Validating local engine configurations for dual-model setup...")

    const checkEngine = (name: string, url?: string) =>
      Effect.promise(async () => {
        if (!url) return
        try {
          const res = await fetch(`${url}/models`)
          if (!res.ok) {
            log.warn(`Engine ${name} at ${url} returned status ${res.status}.`)
          } else {
            const kvCache = res.headers.get("x-kv-cache-dtype")
            if (kvCache && kvCache !== "fp8") {
              log.warn(`Engine ${name} is not using fp8 KV cache. VRAM exhaustion risk!`)
            }

            const maxLen = res.headers.get("x-max-model-len")
            if (maxLen && parseInt(maxLen, 10) > 32768) {
              log.warn(`Engine ${name} context limit exceeds 32k. Infinite loop risk!`)
            }
          }
        } catch (e) {
          log.warn(
            `Failed to connect to engine ${name} at ${url}. Ensure it is running with --kv-cache-dtype fp8 and --max-model-len 32768.`,
          )
        }
      })

    yield* Effect.all(
      [
        checkEngine("local-main", mainProvider.options?.baseURL),
        checkEngine("local-side", sideProvider.options?.baseURL),
      ],
      { concurrency: 2 },
    )
  })
}
