export * from "./client.js"
export * from "./server.js"

import { createEpochClient } from "./client.js"
import { createEpochServer } from "./server.js"
import type { ServerOptions } from "./server.js"

export async function createEpoch(options?: ServerOptions) {
  const server = await createEpochServer({
    ...options,
  })

  const client = createEpochClient({
    baseUrl: server.url,
  })

  return {
    client,
    server,
  }
}
