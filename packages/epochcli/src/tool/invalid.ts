import z from "zod"
import { Tool } from "./tool"
import { Log } from "../util/log"

export const InvalidTool = Tool.define("invalid", {
  description: "Do not use",
  parameters: z.object({
    tool: z.string(),
    error: z.string(),
  }),
  async execute(params) {
    const log = Log.create({ service: "tool.invalid" })
    log.warn("Invalid tool parameters detected", { tool: params.tool, error: params.error })
    return {
      title: "Invalid Tool",
      output: `The arguments provided to the tool are invalid: ${params.error}`,
      metadata: {},
    }
  },
})
