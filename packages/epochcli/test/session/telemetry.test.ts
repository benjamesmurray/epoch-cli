import { describe, it, expect } from "bun:test"
import { Log } from "../../src/util/log"

describe("telemetry truncation", () => {
  it("preserves Zone 1 and Zone 3 while truncating Zone 2", () => {
    const payload = [
      { role: "system", content: "Zone 1: Task Instructions" },
      { role: "user", content: "Zone 2: Big Context 1" },
      { role: "assistant", content: "Zone 2: Big Context 2" },
      { role: "user", content: "Zone 2: Big Context 3" },
      { role: "user", content: "Zone 3: Cursor Position" }
    ]

    const truncated = Log.truncatePayload(payload)

    expect(truncated).toHaveLength(3)
    expect(truncated[0]).toEqual({ role: "system", content: "Zone 1: Task Instructions" })
    expect(truncated[1]).toEqual({ role: "system", content: "[... 3 messages truncated (Zone 2) ...]" })
    expect(truncated[2]).toEqual({ role: "user", content: "Zone 3: Cursor Position" })
  })

  it("does not truncate small payloads", () => {
    const payload = [
      { role: "system", content: "Zone 1: Task Instructions" },
      { role: "user", content: "Zone 3: Cursor Position" }
    ]

    const truncated = Log.truncatePayload(payload)

    expect(truncated).toHaveLength(2)
    expect(truncated).toEqual(payload)
  })

  it("returns non-array payloads as-is", () => {
    const payload = "Just a string"
    const truncated = Log.truncatePayload(payload)
    expect(truncated).toEqual("Just a string")
  })
})
