import {
  generateText as rawGenerateText,
  streamText as rawStreamText,
  generateObject as rawGenerateObject,
  streamObject as rawStreamObject,
} from "ai"
export * from "ai"

type PromiseWithFloating<T> = Promise<T> & {
  warnings?: PromiseLike<unknown>
  request?: PromiseLike<unknown>
  response?: PromiseLike<unknown>
  steps?: PromiseLike<unknown>
}

const safeCatch = (p?: PromiseLike<unknown>) => {
  if (p) {
    Promise.resolve(p).catch(() => {})
  }
}

const catchAllGetters = (result: any) => {
  if (!result || typeof result !== "object") return
  const promiseKeys = ["text", "usage", "finishReason", "toolCalls", "toolResults", "warnings", "providerMetadata", "steps", "response", "request", "object"]
  for (const key of promiseKeys) {
    try {
      const value = result[key]
      if (value && typeof value.catch === "function") {
        value.catch(() => {})
      }
    } catch {}
  }
}

export async function generateText(params: Parameters<typeof rawGenerateText>[0]) {
  const promise = rawGenerateText(params) as PromiseWithFloating<any>
  // Catch auxiliary promises before awaiting to prevent unhandled rejections on API failure
  catchAllGetters(promise)
  return await promise
}

export async function generateObject(params: Parameters<typeof rawGenerateObject>[0]) {
  const promise = rawGenerateObject(params) as PromiseWithFloating<any>
  catchAllGetters(promise)
  return await promise
}

export function streamText(params: Parameters<typeof rawStreamText>[0]) {
  const result = rawStreamText(params)
  catchAllGetters(result)
  return result
}

export function streamObject(params: Parameters<typeof rawStreamObject>[0]) {
  const result = rawStreamObject(params)
  catchAllGetters(result)
  return result
}

