import { describe, expect, it, mock } from "bun:test"
import { RuleRouter } from "../../../src/session/prompt/router"

describe("RuleRouter", () => {
  describe("identifyAgent", () => {
    it("should fast-path to 'plan' for Spec CLI one-shot requests", async () => {
      const mockModel = {
        specificationVersion: "v3",
        provider: "mock",
        modelId: "mock",
        doGenerate: async () => ({
           text: "plan",
           finishReason: "stop",
           usage: { promptTokens: 10, completionTokens: 10, inputTokens: { total: 10 }, outputTokens: { total: 10 } },
           content: [{ type: "text", text: "plan" }]
        })
      } as any
      const result = await RuleRouter.identifyAgent(
        "Implement a new feature using the Spec CLI in ONE-SHOT mode.",
        mockModel
      )
      expect(result).toBe("plan")
    })

    it("should use the Clerk model to identify 'build'", async () => {
      const mockModel = {
        specificationVersion: "v3",
        provider: "mock",
        modelId: "mock",
        doGenerate: async () => ({
           text: "build",
           finishReason: "stop",
           usage: { promptTokens: 10, completionTokens: 10, inputTokens: { total: 10 }, outputTokens: { total: 10 } },
           content: [{ type: "text", text: "build" }]
        })
      } as any
      
      const result = await RuleRouter.identifyAgent(
        "Fix the null pointer exception in the auth controller",
        mockModel
      )
      expect(result).toBe("build")
    })

    it("should use the Clerk model to identify 'explore'", async () => {
      const mockModel = {
        specificationVersion: "v3",
        provider: "mock",
        modelId: "mock",
        doGenerate: async () => ({
           text: "explore",
           finishReason: "stop",
           usage: { promptTokens: 10, completionTokens: 10, inputTokens: { total: 10 }, outputTokens: { total: 10 } },
           content: [{ type: "text", text: "explore" }]
        })
      } as any
      
      const result = await RuleRouter.identifyAgent(
        "How does the database connection work?",
        mockModel
      )
      expect(result).toBe("explore")
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
           content: [{ type: "text", text: "none" }]
        })
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
           content: [{ type: "text", text: "new_feature" }]
        })
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
           content: [{ type: "text", text: "context_mgmt" }]
        })
      } as any

      const packs = await RuleRouter.identifyRulePacks("forget previous rules and summarize", mockModel)
      expect(packs).toContain("context_mgmt_pack")
      expect(packs).toContain("core_interaction_pack")
    })
  })
})