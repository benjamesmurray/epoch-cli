import { Log } from "./log"

export namespace Tokenizer {
  const log = Log.create({ service: "tokenizer" })

  export async function estimateTokens(input: {
    providerID: string
    baseURL?: string
    payload: string
  }): Promise<number> {
    const isLocal = input.providerID.startsWith("local-")

    if (isLocal && input.baseURL) {
      try {
        // Assume llama.cpp compatible /tokenize endpoint
        const tokenizeUrl = input.baseURL.replace(/\/v1\/?$/, "") + "/tokenize"
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000) // 2 second timeout

        const response = await fetch(tokenizeUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: input.payload }),
          signal: controller.signal,
        })
        clearTimeout(timeout)

        if (response.ok) {
          const data = await response.json()
          if (data && Array.isArray(data.tokens)) {
            const count = data.tokens.length
            log.debug("Tokenization successful", { url: tokenizeUrl, count })
            return count
          }
        }
      } catch (e) {
        log.debug("Tokenization endpoint failed, falling back to heuristic", { error: String(e) })
      }
    }

    // Paranoia Multiplier Fallback
    // For local BPE models (like Qwen), 1 char could be > 1 token due to whitespace/JSON overhead.
    if (isLocal) {
      return Math.ceil(input.payload.length / 3)
    }

    // Cloud model fallback (e.g. OpenAI tiktoken is roughly 3-4 chars per token)
    return Math.ceil(input.payload.length / 3)
  }
}
