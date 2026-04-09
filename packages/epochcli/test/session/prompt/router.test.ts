import { describe, it, expect } from "bun:test";
import { RuleRouter } from "../../../src/session/prompt/router";

describe("RuleRouter", () => {
  it("should always include the core_interaction_pack", () => {
    const packs = RuleRouter.classify("hello world");
    expect(packs).toContain("core_interaction_pack");
    expect(packs).toHaveLength(1);
  });

  it("should identify debugging intent", () => {
    const packs = RuleRouter.classify("fix this bug with the stack trace");
    expect(packs).toContain("debugging_pack");
    expect(packs).toContain("core_interaction_pack");
  });

  it("should identify refactoring intent", () => {
    const packs = RuleRouter.classify("refactor this code to optimize it");
    expect(packs).toContain("refactoring_pack");
    expect(packs).toContain("core_interaction_pack");
  });

  it("should identify new feature intent", () => {
    const packs = RuleRouter.classify("implement a new feature to add users");
    expect(packs).toContain("new_feature_pack");
    expect(packs).toContain("core_interaction_pack");
  });

  it("should identify code review intent", () => {
    const packs = RuleRouter.classify("please review this and explain how it works");
    expect(packs).toContain("code_review_pack");
    expect(packs).toContain("core_interaction_pack");
  });

  it("should identify context management intent", () => {
    const packs = RuleRouter.classify("summarize what we did and then revert the changes");
    expect(packs).toContain("context_mgmt_pack");
    expect(packs).toContain("core_interaction_pack");
  });

  it("should handle overlapping intents", () => {
    const packs = RuleRouter.classify("add a new feature to fix the bug");
    expect(packs).toContain("new_feature_pack");
    expect(packs).toContain("debugging_pack");
    expect(packs).toContain("core_interaction_pack");
  });
});
