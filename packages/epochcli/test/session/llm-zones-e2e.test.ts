import { describe, it, expect } from "bun:test"
import * as fs from "fs"
import * as path from "path"

describe("LLM Payload Zones E2E Verification", () => {
  it("should have correct contents in Zone 1, Zone 2, and Zone 3", () => {
    // We are verifying against the explicit e2e test output mentioned by the user
    const payloadPath = path.resolve(
      __dirname,
      "../../../../e2e_testing/results/suite_2026-04-13T23-32-46-621Z/system-prompt-hi-run-1/initial_payload.json"
    )

    // Skip if the file doesn't exist (e.g. in CI where this specific run isn't present)
    if (!fs.existsSync(payloadPath)) {
      console.warn("Skipping e2e payload test because payload file is missing.")
      return
    }

    const data = JSON.parse(fs.readFileSync(payloadPath, "utf-8"))
    const payload = data.payload

    // 1. Verify Zone 1 (System Role)
    const systemMsg = payload.find((m: any) => m.role === "system")
    expect(systemMsg).toBeDefined()
    // Verify it contains the Operational Facts and active agent context (Zone 1)
    expect(systemMsg.content).toContain("Current Phase: [PLAN]")
    expect(systemMsg.content).toContain("The environment context limit is strictly 32K tokens.")
    expect(systemMsg.content).toContain("The codebase primary language is JavaScript/TypeScript.")

    // 2. Verify Zone 2 (Assistant Role)
    const assistantMsg = payload.find((m: any) => m.role === "assistant")
    expect(assistantMsg).toBeDefined()
    // Verify it contains the Behavioral Rules (Zone 2)
    const assistantContent = assistantMsg.content[0].text
    expect(assistantContent).toContain("=== BEHAVIORAL RULES & GENERAL CONTEXT ===")
    
    // Verify core_interaction_pack rules ARE present
    expect(assistantContent).toContain("Trigger: Generating code in response to a user prompt.") // comm_01
    expect(assistantContent).toContain("Trigger: User asks a non-coding general knowledge question.") // comm_05
    expect(assistantContent).toContain("Trigger: User implies the AI can execute, compile, or host code.") // self_01

    // Verify context_mgmt_pack rules are NOT present
    expect(assistantContent).not.toContain("Token context approaches maximum limit during a long session") // mem_02
    expect(assistantContent).not.toContain("Session begins.") // pers_01

    // Verify new_feature_pack rules are NOT present
    expect(assistantContent).not.toContain("User asks to integrate a new file into the broader project") // epi_03
    expect(assistantContent).not.toContain("A major feature is completed or refactored") // pers_02

    // 3. Verify Zone 3 (User Role)
    const userMsg = payload.find((m: any) => m.role === "user")
    expect(userMsg).toBeDefined()
    // Verify it contains the appended Project-Specific Rules (Zone 3)
    const userContentText = userMsg.content.map((c: any) => c.text).join("")
    expect(userContentText).toContain("Hi") // The original user message
    expect(userContentText).toContain("ZONE 3: PROJECT-SPECIFIC RULES (Context-Aware Gaps)")
    expect(userContentText).toContain("project_specific_pack:")
    expect(userContentText).toContain("Adhere strictly to the detected stack conventions (Solid.js, Effect-ts")
    expect(userContentText).toContain("Extracted from AGENTS.md:")
  })
})
