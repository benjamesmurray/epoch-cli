import { describe, expect, test } from "bun:test"
import { SanitizerMiddleware } from "../../src/session/sanitizer"

describe("LLM Sanitizer Middleware Logic", () => {
  test("strips unhelpful providerOptions from prompt messages and parts", () => {
    const rawMessages = [
      {
        role: "user",
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
          openrouter: { cacheControl: { type: "ephemeral" } },
          bedrock: { cachePoint: { type: "default" } },
          openaiCompatible: { cache_control: { type: "ephemeral" } },
          copilot: { copilot_cache_control: { type: "ephemeral" } },
        },
        content: [
          {
            type: "text",
            text: "Hi",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
              openrouter: { cacheControl: { type: "ephemeral" } },
              bedrock: { cachePoint: { type: "default" } },
            },
          },
        ],
      },
    ]

    const result = SanitizerMiddleware.stripProviderOptions(rawMessages, "anthropic")

    // Message level
    expect(result[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    })

    // Part level
    expect(result[0].content[0].providerOptions).toEqual({
      anthropic: { cacheControl: { type: "ephemeral" } },
    })
  })

  test("handles azure provider by keeping both openai and azure keys", () => {
    const rawMessages = [
      {
        role: "user",
        providerOptions: {
          openai: { cache_control: { type: "ephemeral" } },
          azure: { cache_control: { type: "ephemeral" } },
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        content: "Hello",
      },
    ]

    const result = SanitizerMiddleware.stripProviderOptions(rawMessages, "azure", true)

    expect(result[0].providerOptions).toEqual({
      openai: { cache_control: { type: "ephemeral" } },
      azure: { cache_control: { type: "ephemeral" } },
    })
    expect(result[0].providerOptions.anthropic).toBeUndefined()
  })

  test("removes providerOptions entirely if empty after stripping", () => {
    const rawMessages = [
      {
        role: "user",
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
        content: [
          {
            type: "text",
            text: "Hi",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral" } },
            },
          },
        ],
      },
    ]

    // Target a key that is NOT present
    const result = SanitizerMiddleware.stripProviderOptions(rawMessages, "google")

    expect(result[0].providerOptions).toBeUndefined()
    expect(result[0].content[0].providerOptions).toBeUndefined()
  })
})
