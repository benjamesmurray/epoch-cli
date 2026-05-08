import { Tool } from "./tool"
import { z } from "zod"
import path from "path"
import { Instance } from "../project/instance"
import { Filesystem } from "../util/filesystem"

export const RevertFileTool = Tool.define("revert_file", {
  description: "Reverts a file to its state before the last edit tool operation (restores the .bak file).",
  parameters: z.object({
    filePath: z.string().describe("The absolute path to the file to revert"),
  }),
  async execute(params, ctx) {
    if (!params.filePath) {
      throw new Error("filePath is required")
    }

    const filePath = path.isAbsolute(params.filePath) ? params.filePath : path.join(Instance.directory, params.filePath)
    const bakPath = filePath + ".bak"

    const exists = await Filesystem.exists(bakPath)
    if (!exists) {
      throw new Error(`Backup file not found. Ensure an edit was actually made previously. Path: ${bakPath}`)
    }

    const content = await Filesystem.readText(bakPath)
    await Filesystem.write(filePath, content)

    // Optional: cleanup the backup file so we don't restore it twice
    // await Filesystem.remove(bakPath)

    return {
      title: `${path.relative(Instance.worktree, filePath)} reverted`,
      output: `Successfully reverted ${filePath} to its state prior to the last edit.`,
      metadata: {},
    }
  },
})
