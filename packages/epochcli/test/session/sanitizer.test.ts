import { expect, test, describe } from "bun:test"
import { z } from "zod"
import { SanitizerMiddleware } from "../../src/session/sanitizer.js"
import * as Stream from "effect/Stream"
import * as Effect from "effect/Effect"

describe("SanitizerMiddleware", () => {
  test("Stage 1: Regex Cleaning strips markdown and tool_call tags", () => {
    const input = "```json\n{ \"a\": 1 }\n```"
    const result = SanitizerMiddleware.repair(input)
    expect(JSON.parse(result)).toEqual({ a: 1 })
    
    const input2 = "<|tool_call>{ \"a\": 1 }</tool_call>"
    const result2 = SanitizerMiddleware.repair(input2)
    expect(JSON.parse(result2)).toEqual({ a: 1 })
  })

  test("Stage 2: Structural Repair fixes broken JSON", () => {
    // Missing closing bracket and unquoted keys
    const input = "{ a: 1, b: 'hello'"
    const result = SanitizerMiddleware.repair(input)
    expect(JSON.parse(result)).toEqual({ a: 1, b: "hello" })
  })

  test("Stage 3: Schema Validation validates repaired JSON", () => {
    const schema = z.object({ a: z.number(), b: z.string() })
    const input = "{ a: 1, b: 'hello'"
    const result = SanitizerMiddleware.repair(input)
    const valid = SanitizerMiddleware.validate(result, schema)
    expect(valid.success).toBe(true)
    if (valid.success) {
      expect(valid.data).toEqual({ a: 1, b: "hello" })
    }
  })

  test("Transforms stream correctly", async () => {
    const mockEvents = [
      { type: "text-delta", textDelta: "Thinking...\n" },
      { type: "text-delta", textDelta: "<|tool_call>" },
      { type: "text-delta", textDelta: "{ \"broken\": \"json" }, // Missing closing quote and brace
      { type: "text-delta", textDelta: "</tool_call>" },
      { type: "finish" }
    ] as any[]

    const stream = Stream.fromIterable(mockEvents).pipe(
      SanitizerMiddleware.transform()
    )

    const result = await Effect.runPromise(Stream.runCollect(stream))
    const outputEvents = Array.from(result)
    
    expect(outputEvents[0].type).toBe("text-delta")
    expect((outputEvents[0] as any).textDelta).toBe("Thinking...\n")
    
    const repairedDelta = outputEvents.find(e => e.type === "text-delta" && (e as any).textDelta !== "Thinking...\n" && (e as any).textDelta !== "<|tool_call>")
    
    expect(repairedDelta).toBeDefined()
    expect(JSON.parse((repairedDelta as any).textDelta)).toEqual({ broken: "json" })
  })
})
