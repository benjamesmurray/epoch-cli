import { describe, expect, it, mock } from "bun:test"
import { RuleRouter } from "../../../src/session/prompt/router"

describe("RuleRouter", () => {
  describe("identifyAgent", () => {
    it("should fast-path to 'plan' for Spec CLI one-shot requests", async () => {
      const mockModel = {} as any
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
})