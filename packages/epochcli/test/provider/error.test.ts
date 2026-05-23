import { expect, test, describe } from "bun:test"
import { ProviderError } from "../../src/provider/error"
import { APICallError } from "ai"

describe("ProviderError.parseStreamError", () => {
  test("correctly identifies llama.cpp 500 overflow error", () => {
    const rawError = {
      statusCode: 500,
      responseBody: JSON.stringify({
        error: {
          code: 500,
          message: "Context size has been exceeded.",
          type: "server_error"
        }
      })
    }

    const parsed = ProviderError.parseStreamError(rawError)
    
    expect(parsed).toBeDefined()
    expect(parsed?.type).toBe("context_overflow")
    expect(parsed?.message).toContain("Context size has been exceeded")
  })

  test("correctly identifies generic overflow string", () => {
    const parsed = ProviderError.parseStreamError("Context length exceeded")
    
    expect(parsed).toBeDefined()
    expect(parsed?.type).toBe("context_overflow")
  })

  test("does not false-positive on unrelated API errors", () => {
    const rawError = {
      statusCode: 429,
      responseBody: JSON.stringify({
        error: {
          code: 429,
          message: "Rate limit exceeded.",
          type: "rate_limit"
        }
      })
    }

    const parsed = ProviderError.parseStreamError(rawError)
    
    // We expect it to be classified as an API error, not an overflow
    expect(parsed?.type).not.toBe("context_overflow")
  })
})
