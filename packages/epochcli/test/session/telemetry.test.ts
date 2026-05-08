import { describe, it, expect } from "bun:test"
import { Log } from "../../src/util/log.js"

describe("telemetry truncation", () => {
  it("preserves Zone 1 and Zone 3 while truncating Zone 2", () => {
    const payload: Log.ZoneStructuredPayload = {
      zone1_critical_rules: "Zone 1: Task Instructions",
      zone2_context_files: "Zone 2: Big Context 1\nZone 2: Big Context 2\nZone 2: Big Context 3",
      zone3_active_cursor: "Zone 3: Cursor Position",
    }

    const truncated = Log.truncatePayload(payload)

    expect(truncated).toBeDefined()
    expect(truncated!.zone1_critical_rules).toEqual("Zone 1: Task Instructions")
    expect(truncated!.zone2_context_files).toEqual("...[ZONE 2 TRUNCATED FOR LOGGING]")
    expect(truncated!.zone3_active_cursor).toEqual("Zone 3: Cursor Position")
  })

  it("handles missing payload safely", () => {
    const truncated = Log.truncatePayload(undefined)
    expect(truncated).toBeUndefined()
  })

  it("preserves missing zone2", () => {
    const payload: Log.ZoneStructuredPayload = {
      zone1_critical_rules: "Zone 1",
      zone2_context_files: "",
      zone3_active_cursor: "Zone 3",
    }

    const truncated = Log.truncatePayload(payload)
    expect(truncated!.zone2_context_files).toEqual("")
  })
})
