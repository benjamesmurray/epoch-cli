import { describe, it, expect, afterAll, beforeAll } from "bun:test"
import * as fs from "fs/promises"
import * as path from "path"
import { LogParserTool } from "../../src/util/log-parser"

describe("LogParserTool - State Machine Overlap Detection", () => {
  const tmpDir = path.join(process.cwd(), "test-logs-tmp")
  
  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true })
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("validates successful sequential execution", async () => {
    const logPath = path.join(tmpDir, "valid.log")
    const logContent = `
2026-04-08T12:00:00 INFO {"mainEpochId":"123","event":"START_GENERATE","providerId":"local-side","phase":"Phase 1"}
2026-04-08T12:00:01 INFO {"mainEpochId":"123","event":"END_GENERATE","providerId":"local-side","phase":"Phase 1","metrics":{"json_repaired":true}}
2026-04-08T12:00:02 INFO {"mainEpochId":"123","event":"START_GENERATE","providerId":"local-main","phase":"Phase 2"}
2026-04-08T12:00:05 INFO {"mainEpochId":"123","event":"END_GENERATE","providerId":"local-main","phase":"Phase 2"}
`
    await fs.writeFile(logPath, logContent.trim())

    const result = await LogParserTool.verifySequentialExecution(logPath)
    expect(result.valid).toBe(true)
    expect(result.message).toContain("Total sequential handoffs: 2")
    expect(result.message).toContain("JSON Repairs: 1")
  })

  it("flags overlapping execution when local-main starts while local-side is active", async () => {
    const logPath = path.join(tmpDir, "overlap.log")
    const logContent = `
2026-04-08T12:00:00 INFO {"mainEpochId":"456","event":"START_GENERATE","providerId":"local-side","phase":"Phase 1"}
2026-04-08T12:00:01 INFO {"mainEpochId":"456","event":"START_GENERATE","providerId":"local-main","phase":"Phase 2"}
`
    await fs.writeFile(logPath, logContent.trim())

    const result = await LogParserTool.verifySequentialExecution(logPath)
    expect(result.valid).toBe(false)
    expect(result.message).toContain("Concurrency Violation: local-main started while local-side was still active in epoch 456")
  })

  it("ignores malformed JSON and skips gracefully", async () => {
    const logPath = path.join(tmpDir, "malformed.log")
    const logContent = `
2026-04-08T12:00:00 INFO {"mainEpochId":"789","event":"START_GENERATE","providerId":"local-side","phase":"Phase 1"}
Just a normal log line with { some invalid JSON
2026-04-08T12:00:01 INFO {"mainEpochId":"789","event":"END_GENERATE","providerId":"local-side","phase":"Phase 1"}
`
    await fs.writeFile(logPath, logContent.trim())

    const result = await LogParserTool.verifySequentialExecution(logPath)
    expect(result.valid).toBe(true)
    expect(result.message).toContain("Total sequential handoffs: 1")
  })
})
