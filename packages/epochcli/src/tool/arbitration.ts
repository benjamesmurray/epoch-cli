import z from "zod"
import { Tool } from "./tool"
import DESCRIPTION from "./arbitration.txt"

/**
 * The object_to_supervisor tool allows the Main Agent to challenge the 
 * persona classification made by the Clerk model. 
 * 
 * NOTE: This tool is intercepted by the orchestration engine in llm.ts
 * and does not execute any filesystem operations.
 */
export const ArbitrationTool = Tool.define("object_to_supervisor", {
  description: DESCRIPTION,
  parameters: z.object({
    reason: z.string().describe("The reason why the current agent persona is incorrect."),
    requestedAgent: z.enum(["build", "plan", "explore"]).describe("The agent persona you are requesting to switch to."),
  }),
  async execute(params, ctx) {
    // This is a placeholder. The tool is intercepted in llm.ts.
    return {
      title: "Arbitration Request",
      metadata: params,
      output: `Objection recorded: ${params.reason}. Requesting switch to ${params.requestedAgent}.`,
    }
  },
})
