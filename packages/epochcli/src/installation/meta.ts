declare global {
  const EPOCHCLI_VERSION: string
  const EPOCHCLI_CHANNEL: string
}

export const VERSION = typeof EPOCHCLI_VERSION === "string" ? EPOCHCLI_VERSION : "local"
export const CHANNEL = typeof EPOCHCLI_CHANNEL === "string" ? EPOCHCLI_CHANNEL : "local"
