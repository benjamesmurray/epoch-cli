import * as Stream from "effect/Stream"
import { jsonrepair } from "jsonrepair"
import { z } from "zod"
import type { LLM } from "./llm.js"

export class SanitizerMiddleware {
  private static readonly TOOL_CALL_START_REGEX = /<\|\s*tool_call\s*>|```json\s*$/i
  private static readonly TOOL_CALL_END_REGEX = /<\/\s*tool_call\s*>|```\s*$/i

  static repair(input: string): string {
    let cleaned = input.trim()
    cleaned = cleaned.replace(/^```json\s*/i, "").replace(/\s*```$/i, "")
    cleaned = cleaned.replace(/<\|\s*tool_call\s*>/ig, "").replace(/<\/\s*tool_call\s*>/ig, "")
    cleaned = cleaned.trim()

    let openBraces = (cleaned.match(/\{/g) || []).length
    let closeBraces = (cleaned.match(/\}/g) || []).length
    if (openBraces > closeBraces) {
      cleaned += "}".repeat(openBraces - closeBraces)
    }
    
    let openBrackets = (cleaned.match(/\[/g) || []).length
    let closeBrackets = (cleaned.match(/\]/g) || []).length
    if (openBrackets > closeBrackets) {
      cleaned += "]".repeat(openBrackets - closeBrackets)
    }

    try {
      const repaired = jsonrepair(cleaned)
      return repaired
    } catch (e) {
      return cleaned
    }
  }

  static validate<T>(jsonStr: string, schema: z.ZodType<T>): any {
    try {
      const parsed = JSON.parse(jsonStr)
      return schema.safeParse(parsed)
    } catch {
      return { success: false, error: new z.ZodError([]) }
    }
  }

  static stripProviderOptions(messages: any[], targetKey: string, isAzure: boolean = false): any[] {
    for (const msg of messages) {
      if (msg.providerOptions) {
        const newOptions: Record<string, any> = {}
        if (msg.providerOptions[targetKey]) newOptions[targetKey] = msg.providerOptions[targetKey]
        if (isAzure) {
          if (msg.providerOptions["openai"]) newOptions["openai"] = msg.providerOptions["openai"]
          if (msg.providerOptions["azure"]) newOptions["azure"] = msg.providerOptions["azure"]
        }
        if (Object.keys(newOptions).length > 0) {
          msg.providerOptions = newOptions
        } else {
          delete msg.providerOptions
        }
      }
      
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.providerOptions) {
            const newPartOptions: Record<string, any> = {}
            if (part.providerOptions[targetKey]) newPartOptions[targetKey] = part.providerOptions[targetKey]
            if (isAzure) {
              if (part.providerOptions["openai"]) newPartOptions["openai"] = part.providerOptions["openai"]
              if (part.providerOptions["azure"]) newPartOptions["azure"] = part.providerOptions["azure"]
            }
            if (Object.keys(newPartOptions).length > 0) {
              part.providerOptions = newPartOptions
            } else {
              delete part.providerOptions
            }
          }
        }
      }
    }
    return messages
  }

  static transform(): <R, E>(stream: Stream.Stream<LLM.Event, E, R>) => Stream.Stream<LLM.Event, E, R> {
    return <R, E>(stream: Stream.Stream<LLM.Event, E, R>) => {
      let buffer = ""
      let inToolCall = false

      return Stream.flatMap(stream, (event) => {
        if (event.type === "text-delta") {
          const delta = (event as any).textDelta || (event as any).text
          buffer += delta

          if (!inToolCall && SanitizerMiddleware.TOOL_CALL_START_REGEX.test(buffer)) {
            inToolCall = true
            return Stream.succeed(event)
          } else if (inToolCall) {
            if (SanitizerMiddleware.TOOL_CALL_END_REGEX.test(buffer) || (buffer.includes("}") && buffer.trim().endsWith("}"))) {
              inToolCall = false
              const repaired = SanitizerMiddleware.repair(buffer)
              buffer = "" 
              return Stream.succeed({
                type: "text-delta",
                textDelta: repaired,
                  text: repaired
              } as unknown as LLM.Event)
            } else {
              // Buffer
              return Stream.empty
            }
          } else {
            buffer = ""
            return Stream.succeed(event)
          }
        } else {
          return Stream.succeed(event)
        }
      })
    }
  }
}
