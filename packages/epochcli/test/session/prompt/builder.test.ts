import { describe, it, expect } from "bun:test";
import { PromptBuilder, type PromptPayload } from "../../../src/session/prompt/builder";

describe("PromptBuilder", () => {
  it("should correctly assemble all three zones", () => {
    const payload: PromptPayload = {
      zone1: ["Fact 1", "Fact 2"],
      zone2: ["Rule Pack A", "Tool Schemas"],
      zone3: ["Fact 1 Repeated", "Cursor at line 10"],
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
    const payload: PromptPayload = {
      zone1: ["Fact 1"],
      zone2: [],
      zone3: ["Cursor at line 10"],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toContain("=== ZONE 1: IMMEDIATE CONTEXT & PERSISTENCE ===");
    expect(result).toContain("Fact 1");
    
    expect(result).not.toContain("=== ZONE 2: BEHAVIORAL RULES & GENERAL CONTEXT ===");
    
    expect(result).toContain("=== ZONE 3: CRITICAL REITERATION & CURSOR ===");
    expect(result).toContain("Cursor at line 10");
  });

  it("should filter out empty strings within zones", () => {
    const payload: PromptPayload = {
      zone1: ["Fact 1", "", "Fact 2"],
      zone2: ["", "Rule Pack A"],
      zone3: [""],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toContain("Fact 1\n\nFact 2");
    expect(result).toContain("Rule Pack A");
    expect(result).not.toContain("=== ZONE 3: CRITICAL REITERATION & CURSOR ===");
  });

  it("should return an empty string if all zones are empty", () => {
    const payload: PromptPayload = {
      zone1: [],
      zone2: [""],
      zone3: [],
    };

    const result = PromptBuilder.build(payload);

    expect(result).toBe("");
  });
});
