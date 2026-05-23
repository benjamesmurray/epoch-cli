import { APICallError } from "ai"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"
import type { ProviderID } from "./schema"

export namespace ProviderError {
  // Adapted from overflow detection patterns in:
  // https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
  const OVERFLOW_PATTERNS = [
    /prompt is too long/i, // Anthropic
    /input is too long for requested model/i, // Amazon Bedrock
    /exceeds the context window/i, // OpenAI (Completions + Responses API message text)
    /input token count.*exceeds the maximum/i, // Google (Gemini)
    /maximum prompt length is \d+/i, // xAI (Grok)
    /reduce the length of the messages/i, // Groq
    /maximum context length is \d+ tokens/i, // OpenRouter, DeepSeek, vLLM
    /exceeds the limit of \d+/i, // GitHub Copilot
    /exceeds the available context size/i, // llama.cpp server
    /context size has been exceeded/i, // llama.cpp alternative overflow error
    /greater than the context length/i, // LM Studio
    /context window exceeds limit/i, // MiniMax
    /exceeded model token limit/i, // Kimi For Coding, Moonshot
    /context[_ ]length[_ ]exceeded/i, // Generic fallback
    /request entity too large/i, // HTTP 413
    /context length is only \d+ tokens/i, // vLLM
    /input length.*exceeds.*context length/i, // vLLM
    /prompt too long; exceeded (?:max )?context length/i, // Ollama explicit overflow error
    /too large for model with \d+ maximum context length/i, // Mistral
    /model_context_window_exceeded/i, // z.ai non-standard finish_reason surfaced as error text
  ]

  function isOpenAiErrorRetryable(e: APICallError) {
    const status = e.statusCode
    if (!status) return e.isRetryable
    // openai sometimes returns 404 for models that are actually available
    return status === 404 || e.isRetryable
  }

  // Providers not reliably handled in this function:
  // - z.ai: can accept overflow silently (needs token-count/context-window checks)
  export function isOverflow(input: unknown): boolean {
    if (typeof input === "string") {
      if (OVERFLOW_PATTERNS.some((p) => p.test(input))) return true
      // Providers/status patterns handled outside of regex list:
      // - Cerebras: often returns "400 (no body)" / "413 (no body)"
      // - Mistral: often returns "400 (no body)" / "413 (no body)"
      if (/^4(00|13)\s*(status code)?\s*\(no body\)/i.test(input)) return true

      // Handle stringified JSON that might contain an overflow message
      if (input.startsWith("{") && input.endsWith("}")) {
        try {
          const body = JSON.parse(input)
          return isOverflow(body)
        } catch {
          // ignore parse errors
        }
      }

      return false
    }

    if (typeof input === "object" && input !== null) {
      const body = input as Record<string, any>
      // Check common error fields recursively
      const candidates = [
        body.message,
        body.error,
        body.error?.message,
        body.error?.code,
        body.code,
        body.responseBody,
      ]
      for (const c of candidates) {
        if (typeof c === "string" && isOverflow(c)) return true
        if (typeof c === "object" && c !== null && isOverflow(c)) return true
      }
    }

    return false
  }

  function message(providerID: ProviderID, e: APICallError) {
    return iife(() => {
      const msg = e.message
      if (msg === "") {
        if (e.responseBody) return e.responseBody
        if (e.statusCode) {
          const err = STATUS_CODES[e.statusCode]
          if (err) return err
        }
        return "Unknown error"
      }

      if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
        return msg
      }

      try {
        const body = JSON.parse(e.responseBody)
        // try to extract common error message fields
        const errMsg = body.message || body.error || body.error?.message
        if (errMsg && typeof errMsg === "string") {
          return `${msg}: ${errMsg}`
        }
      } catch {}

      // If responseBody is HTML (e.g. from a gateway or proxy error page),
      // provide a human-readable message instead of dumping raw markup
      if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
        if (e.statusCode === 401) {
          return "Unauthorized: request was blocked by a gateway or proxy. Your authentication token may be missing or expired — try running `epochcli auth login <your provider URL>` to re-authenticate."
        }
        if (e.statusCode === 403) {
          return "Forbidden: request was blocked by a gateway or proxy. You may not have permission to access this resource — check your account and provider settings."
        }
        return msg
      }

      return `${msg}: ${e.responseBody}`
    }).trim()
  }

  function json(input: unknown) {
    if (typeof input === "string") {
      try {
        const result = JSON.parse(input)
        if (result && typeof result === "object") return result
        return undefined
      } catch {
        return undefined
      }
    }
    if (typeof input === "object" && input !== null) {
      return input
    }
    return undefined
  }

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        message: string
        isRetryable: false
        responseBody: string
      }

  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const isErrorInstance = input instanceof Error
    
    // Unwrap AI_RetryError to extract the underlying cause
    if (isErrorInstance && (input as any).name === "AI_RetryError" && Array.isArray((input as any).errors) && (input as any).errors.length > 0) {
      const lastError = (input as any).errors[(input as any).errors.length - 1]
      return parseStreamError(lastError)
    }

    let body = json(input)

    // Handle case where input is an object with a responseBody string (like APICallError)
    if (typeof input === "object" && input !== null && typeof (input as any).responseBody === "string") {
      const parsedResponse = json((input as any).responseBody)
      if (parsedResponse) {
         body = { ...body, ...parsedResponse }
      }
    }

    if (isOverflow(input) || isOverflow(body) || (typeof input === "object" && input !== null && isOverflow((input as any).responseBody))) {
      const errorString =
        (body?.error?.code === "context_length_exceeded" ? "Input exceeds context window of this model" : undefined) ||
        (typeof body?.error === "string" ? body.error : undefined) ||
        (typeof body?.error?.message === "string" ? body.error.message : undefined) ||
        (typeof body?.message === "string" ? body.message : undefined) ||
        (isErrorInstance ? (input as Error).message : undefined) ||
        "Context overflow"

      let responseBody: string
      try {
        responseBody = JSON.stringify(body || { error: errorString })
      } catch {
        responseBody = String(body || errorString)
      }

      return {
        type: "context_overflow",
        message: errorString,
        responseBody,
      }
    }

    if (!body) return

    let responseBody: string
    try {
      responseBody = JSON.stringify(body)
    } catch {
      responseBody = String(body)
    }

    if (typeof body.error === "string") {
      // If it's a standard Error instance but wasn't an overflow, we should
      // return undefined so fromError can use specialized cases (like ZlibError).
      if (isErrorInstance) return undefined

      return {
        type: "api_error",
        message: body.error,
        isRetryable: false,
        responseBody,
      }
    }

    if (body.type !== "error") return

    switch (body?.error?.code) {
      case "context_length_exceeded":
        return {
          type: "context_overflow",
          message: "Input exceeds context window of this model",
          responseBody,
        }
      case "insufficient_quota":
        return {
          type: "api_error",
          message: "Quota exceeded. Check your plan and billing details.",
          isRetryable: false,
          responseBody,
        }
      case "usage_not_included":
        return {
          type: "api_error",
          message: "To use Codex with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
          isRetryable: false,
          responseBody,
        }
      case "invalid_prompt":
        return {
          type: "api_error",
          message: typeof body?.error?.message === "string" ? body?.error?.message : "Invalid prompt.",
          isRetryable: false,
          responseBody,
        }
    }
  }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        message: string
        statusCode?: number
        isRetryable: boolean
        responseHeaders?: Record<string, string>
        responseBody?: string
        metadata?: Record<string, string>
      }

  export function parseAPICallError(input: { providerID: ProviderID; error: APICallError }): ParsedAPICallError {
    const m = message(input.providerID, input.error)
    const body = json(input.error.responseBody)
    if (
      isOverflow(m) ||
      isOverflow(input.error.responseBody) ||
      isOverflow(body) ||
      input.error.statusCode === 413 ||
      body?.error?.code === "context_length_exceeded"
    ) {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    const metadata = input.error.url ? { url: input.error.url } : undefined
    const isLocal = input.providerID.startsWith("local-main") || input.providerID.startsWith("local-side")
    return {
      type: "api_error",
      message: m,
      statusCode: input.error.statusCode,
      isRetryable:
        input.providerID.startsWith("openai") || isLocal
          ? isOpenAiErrorRetryable(input.error)
          : input.error.isRetryable,
      responseHeaders: input.error.responseHeaders,
      responseBody: input.error.responseBody,
      metadata,
    }
  }
}
