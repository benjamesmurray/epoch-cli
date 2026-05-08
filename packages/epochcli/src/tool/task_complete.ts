import { Tool } from "./tool"
import z from "zod"

const parameters = z.object({
  summary: z.string().describe("A summary of the work that was completed.").optional(),
})

export const TaskCompleteTool = Tool.define("task_complete", {
  description:
    "Signals that you have completely finished all requested tasks and are ready to stop execution. Call this tool ONLY when there is absolutely no more work to do.",
  parameters,
  async execute(params) {
    return {
      title: "Task Complete",
      output: "Task marked as complete. The execution loop will now exit.",
      metadata: {
        summary: params.summary,
      },
    }
  },
})
