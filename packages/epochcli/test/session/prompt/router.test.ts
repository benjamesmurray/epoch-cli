import { describe, expect, it, mock } from "bun:test"
import { RuleRouter } from "../../../src/session/prompt/router"

describe("RuleRouter", () => {
  describe("identifyAgent", () => {
    it("should maintain 'plan' if current agent is 'plan' and no report exists", async () => {
      const result = await RuleRouter.identifyAgent("Some input", "plan")
      expect(result).toBe("plan")
    })

    it("should maintain 'explore' if current agent is 'explore' and no report exists", async () => {
      const result = await RuleRouter.identifyAgent("Some input", "explore")
      expect(result).toBe("explore")
    })

    it("should default to 'build' if current agent is 'build' and no report exists", async () => {
      const result = await RuleRouter.identifyAgent("Some input", "build")
      expect(result).toBe("build")
    })

    it("should switch to 'plan' if continuity report indicates requirements phase", async () => {
      const report = "Current phase: 'requirements'"
      const result = await RuleRouter.identifyAgent("Some input", "build", report)
      expect(result).toBe("plan")
    })

    it("should switch to 'build' if continuity report indicates implementation phase", async () => {
      const report = "Current phase: 'implementation'"
      const result = await RuleRouter.identifyAgent("Some input", "plan", report)
      expect(result).toBe("build")
    })
  })

  describe("classify (Heuristics)", () => {
    it("should supply core_interaction_pack when intent is ambiguous", () => {
      const packs = RuleRouter.classify("Hi")
      expect(packs).toEqual(["core_interaction_pack"])
    })

    it("should supply new_feature_pack when intent indicates creation", () => {
      const packs = RuleRouter.classify("create a new user profile component")
      expect(packs).toContain("new_feature_pack")
      expect(packs).toContain("core_interaction_pack")
    })

    it("should supply context_mgmt_pack when intent indicates summarization", () => {
      const packs = RuleRouter.classify("summarize what we have done so far")
      expect(packs).toContain("context_mgmt_pack")
      expect(packs).toContain("core_interaction_pack")
    })

    it("should supply debugging_pack when intent indicates an error", () => {
      const packs = RuleRouter.classify("fix this bug and stack trace")
      expect(packs).toContain("debugging_pack")
      expect(packs).toContain("core_interaction_pack")
    })
  })

  describe("identifyRulePacks (Clerk Model)", () => {
    it("should supply core_interaction_pack when intent is ambiguous", async () => {
      const mockModel = {
        specificationVersion: "v3",
        provider: "mock",
        modelId: "mock",
        doGenerate: async () => ({
          text: "none",
          finishReason: "stop",
          usage: { promptTokens: 10, completionTokens: 10, inputTokens: { total: 10 }, outputTokens: { total: 10 } },
          content: [{ type: "text", text: "none" }],
        }),
      } as any

      const packs = await RuleRouter.identifyRulePacks("Hi", mockModel)
      expect(packs).toEqual(["core_interaction_pack"])
    })

    it("should supply new_feature_pack when the model identifies new_feature", async () => {
      const mockModel = {
        specificationVersion: "v3",
        provider: "mock",
        modelId: "mock",
        doGenerate: async () => ({
          text: "new_feature",
          finishReason: "stop",
          usage: { promptTokens: 10, completionTokens: 10, inputTokens: { total: 10 }, outputTokens: { total: 10 } },
          content: [{ type: "text", text: "new_feature" }],
        }),
      } as any

      const packs = await RuleRouter.identifyRulePacks("create a new user profile component", mockModel)
      expect(packs).toContain("new_feature_pack")
      expect(packs).toContain("core_interaction_pack")
    })

    it("should supply context_mgmt_pack when the model identifies context_mgmt", async () => {
      const mockModel = {
        specificationVersion: "v3",
        provider: "mock",
        modelId: "mock",
        doGenerate: async () => ({
          text: "context_mgmt",
          finishReason: "stop",
          usage: { promptTokens: 10, completionTokens: 10, inputTokens: { total: 10 }, outputTokens: { total: 10 } },
          content: [{ type: "text", text: "context_mgmt" }],
        }),
      } as any

      const packs = await RuleRouter.identifyRulePacks("forget previous rules and summarize", mockModel)
      expect(packs).toContain("context_mgmt_pack")
      expect(packs).toContain("core_interaction_pack")
    })
  })
})
