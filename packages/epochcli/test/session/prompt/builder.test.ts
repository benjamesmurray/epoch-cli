import { describe, it, expect } from "bun:test";
import { PromptBuilder, type ZoneStructuredPayload } from "../../../src/session/prompt/builder";

describe("PromptBuilder", () => {
  it("should correctly assemble all three zones", () => {
    const payload: ZoneStructuredPayload = {
      zone1_critical_rules: ["Fact 1", "Fact 2"],
      zone2_context_files: ["Rule Pack A", "Tool Schemas"],
      zone3_active_cursor: ["Fact 1 Repeated", "Cursor at line 10"],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toContain("=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===");
    expect(result).toContain("Fact 1\n\nFact 2");
    
    expect(result).toContain("=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===");
    expect(result).toContain("Rule Pack A\n\nTool Schemas");
    
    expect(result).toContain("=== ZONE 3: CRITICAL REITERATION & CURSOR ===");
    expect(result).toContain("Fact 1 Repeated\n\nCursor at line 10");
  });

  it("should handle empty zones gracefully", () => {
    const payload: ZoneStructuredPayload = {
      zone1_critical_rules: ["Fact 1"],
      zone2_context_files: [],
      zone3_active_cursor: ["Cursor at line 10"],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toContain("=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===");
    expect(result).toContain("Fact 1");
    
    expect(result).not.toContain("=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===");
    
    expect(result).toContain("=== ZONE 3: CRITICAL REITERATION & CURSOR ===");
    expect(result).toContain("Cursor at line 10");
  });

  it("should filter out empty strings within zones", () => {
    const payload: ZoneStructuredPayload = {
      zone1_critical_rules: ["Fact 1", "", "Fact 2"],
      zone2_context_files: ["", "Rule Pack A"],
      zone3_active_cursor: [""],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toContain("Fact 1\n\nFact 2");
    expect(result).toContain("Rule Pack A");
    expect(result).not.toContain("=== ZONE 3: CRITICAL REITERATION & CURSOR ===");
  });

  it("should return an empty string if all zones are empty", () => {
    const payload: ZoneStructuredPayload = {
      zone1_critical_rules: [],
      zone2_context_files: [""],
      zone3_active_cursor: [],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toBe("");
  });
});
