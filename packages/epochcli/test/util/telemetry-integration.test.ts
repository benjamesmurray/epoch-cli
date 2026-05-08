import { describe, it, expect, afterAll, beforeAll } from "bun:test"
import * as fs from "fs/promises"
import * as path from "path"
import { SessionAnalyzer } from "../../src/util/session-analyzer"
import { SessionTelemetry } from "../../src/util/session-telemetry"

describe("Telemetry Integration - End-to-End State Extraction", () => {
  const tmpDir = path.join(process.cwd(), "test-telemetry-tmp")

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true })
    // Initialize SessionTelemetry to point to our temp dir
    process.env.XDG_DATA_HOME = tmpDir
  })

  afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("successfully extracts completed tools from structured telemetry", async () => {
    // 1. Mock session ID and history
    const sessionID = "test-session-123"
    const chatHistory = [
      {
        info: { role: "assistant" },
        parts: [
          {
            type: "tool",
            tool: "bash",
            state: { status: "completed", input: { command: "spec sc_init --name eventbus" } },
          },
        ],
      },
    ] as any

    // 2. Emit telemetry via SessionTelemetry
    await SessionTelemetry.init({ dev: true })
    SessionTelemetry.emitModelEvent({
      mainEpochId: sessionID,
      event: "START_GENERATE",
      providerId: "local-main",
      phase: "Phase 1",
      activeAgent: "plan",
    } as any)

    SessionTelemetry.emitToolEvent({
      sessionID,
      callID: "call_init",
      event: "TOOL_START",
      tool: "bash",
      input: { command: "spec sc_init --name eventbus" },
    } as any)

    SessionTelemetry.emitToolEvent({
      sessionID,
      callID: "call_init",
      event: "TOOL_END",
      tool: "bash",
      status: "completed",
      output: "Successfully ran: spec sc_init --name eventbus",
    } as any)

    SessionTelemetry.emitModelEvent({
      mainEpochId: sessionID,
      event: "END_GENERATE",
      metrics: { promptTokens: 100 },
    } as any)

    await SessionTelemetry.flush()

    // 3. Analyze via SessionAnalyzer
    const analysis = await SessionAnalyzer.analyze(sessionID, chatHistory, process.cwd())

    // 4. Verify results
    // Updated expectation: The timeline uses semantically mapped tool names and Turn indexing
    expect(analysis.actionTimeline).toContain(
      'Turn 1: Tool \'sc_init\' executed (input: {"command":"spec sc_init --name eventbus"}) -> Result: completed',
    )
  })

  it("handles failed tools correctly", async () => {
    const sessionID = "test-session-456"
    const chatHistory = [] as any

    await SessionTelemetry.init({ dev: true })
    SessionTelemetry.emitModelEvent({
      mainEpochId: sessionID,
      event: "START_GENERATE",
    } as any)

    SessionTelemetry.emitToolEvent({
      sessionID,
      event: "TOOL_END",
      tool: "read",
      status: "failed",
      error: "File not found",
    })

    await SessionTelemetry.flush()

    const analysis = await SessionAnalyzer.analyze(sessionID, chatHistory, process.cwd())
    expect(analysis.telemetry.mcpxFailures).toContain("read: File not found")
  })
})
