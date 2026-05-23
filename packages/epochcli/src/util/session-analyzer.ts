import { MessageV2 } from "../session/message-v2"
import * as fs from "fs/promises"
import * as path from "path"
import { SessionTelemetry } from "./session-telemetry"
import { TurnAggregator, type Turn, type ToolExecution } from "@epoch-ai/util/telemetry"

export namespace SessionAnalyzer {
  export async function getTurns(sessionID: string): Promise<Turn[]> {
    const telemetryPath = SessionTelemetry.getPath()
    if (!telemetryPath) return []

    try {
      const content = await fs.readFile(telemetryPath, "utf-8")
      const lines = content.split("\n").filter(Boolean)
      const aggregator = new TurnAggregator()
      const turns: Turn[] = []

      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.mainEpochId !== sessionID && event.sessionID !== sessionID) continue
          const turn = aggregator.processJSON(event)
          if (turn) turns.push(turn)
        } catch (e) {}
      }

      const lastTurn = aggregator.flush()
      if (lastTurn) turns.push(lastTurn)

      return turns
    } catch (e) {
      return []
    }
  }

  export async function getGlobalTurns(): Promise<Turn[]> {
    const telemetryPath = SessionTelemetry.getPath()
    if (!telemetryPath) return []

    try {
      const content = await fs.readFile(telemetryPath, "utf-8")
      const lines = content.split("\n").filter(Boolean)
      const aggregator = new TurnAggregator()
      const turns: Turn[] = []

      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          const turn = aggregator.processJSON(event)
          if (turn) turns.push(turn)
        } catch (e) {}
      }

      const lastTurn = aggregator.flush()
      if (lastTurn) turns.push(lastTurn)

      return turns
    } catch (e) {
      return []
    }
  }

  export async function exportHistoryToToon(workspaceRoot: string) {
    const turns = await getGlobalTurns()
    if (turns.length === 0) return

    const historyDir = path.join(workspaceRoot, ".history")
    try {
      await fs.mkdir(historyDir, { recursive: true })
    } catch (e) {}

    // 1. Timeline
    const timeline = generateActionTimeline(turns)
    await fs
      .writeFile(
        path.join(historyDir, "timeline.toon"),
        `global_timeline:\n${timeline
          .split("\n")
          .map((l) => "  - " + JSON.stringify(l))
          .join("\n")}`,
      )
      .catch(() => {})

    // 2. Files
    const files = new Set<string>()
    for (const turn of turns) {
      for (const tool of turn.tools) {
        const input = tool.input as any

        // Standard file tools
        if (["edit", "write", "read", "replace", "read_file", "write_file", "view_file"].includes(tool.name)) {
          if (input?.filePath) files.add(input.filePath)
          if (input?.file_path) files.add(input.file_path)
        }
        // MCPX tools that might have a path in args
        else if (tool.name.startsWith("mcpx [") && input?.args) {
          const args = input.args as Record<string, any>
          if (args?.file_path) files.add(args.file_path)
          if (args?.path) files.add(args.path)
        }
        // Bash heuristics
        else if (tool.name === "bash" && typeof input?.command === "string") {
          const fileMatches = input.command.match(/[\w.\-\/]+\.(ts|js|json|md|txt|py|go|rs)/g)
          if (fileMatches) fileMatches.forEach((m: string) => files.add(m))
        }
      }
    }
    await fs
      .writeFile(
        path.join(historyDir, "files.toon"),
        `touched_files:\n${Array.from(files)
          .map((f) => "  - " + JSON.stringify(f))
          .join("\n")}`,
      )
      .catch(() => {})

    // 3. Errors & State Inconsistency
    const errors: string[] = []
    for (const turn of turns) {
      for (const tool of turn.tools) {
        if (tool.status === "failed") {
          errors.push(`Turn ${turn.id} - ${tool.name}: ${tool.error || "Unknown error"}`)
        }
      }
    }

    // Proactive Inconsistency Check: Look for files modified without a successful commit turn
    // (Simplified heuristic for the Global History Suite)
    if (errors.length > 0) {
      errors.unshift(
        "[STATE_INCONSISTENCY_WARNING]: Multiple tool failures detected right before transition. Verify disk integrity.",
      )
    }

    await fs
      .writeFile(
        path.join(historyDir, "errors.toon"),
        `tool_errors:\n${errors.map((e) => "  - " + JSON.stringify(e)).join("\n")}`,
      )
      .catch(() => {})

    // 4. Longitudinal Intent
    const continuityPath = path.join(workspaceRoot, ".epoch-continuity.toon")
    try {
      const continuityContent = await fs.readFile(continuityPath, "utf-8")
      const intentMatch = continuityContent.match(/executive_intent:\n([\s\S]+?)\n  technical_progress:/)
      if (intentMatch) {
        const intent = intentMatch[1]
        const timestamp = new Date().toISOString()
        const intentEntry = `\n- timestamp: ${timestamp}\n  ${intent.trim().replace(/\n/g, "\n  ")}\n`
        await fs.appendFile(path.join(historyDir, "intent.toon"), intentEntry)
      }
    } catch (e) {}
  }

  export function generateActionTimeline(turns: Turn[]) {
    const timeline: string[] = []

    for (const turn of turns) {
      if (turn.tools.length > 0) {
        for (const tool of turn.tools) {
          let detail = ""
          if (tool.name === "bash" && tool.input?.command) {
            detail = `command: '${tool.input.command}'`
          } else if (tool.input) {
            const inputStr = JSON.stringify(tool.input)
            detail = `input: ${inputStr.length > 100 ? inputStr.slice(0, 100) + "..." : inputStr}`
          }

          let outputSummary = ""
          if (tool.status === "failed") {
            outputSummary = ` -> Error: ${tool.error || "Unknown error"}`
          } else if (tool.output) {
            const outStr = typeof tool.output === "string" ? tool.output : JSON.stringify(tool.output)
            // Always include short outputs, or critical hints even in large outputs
            if (outStr.length < 500) {
              outputSummary = ` -> Output: ${outStr.replace(/\n/g, " ").trim()}`
            } else if (outStr.includes("Please finish editing")) {
              const hintMatch = outStr.match(/Please finish editing.*?\./)
              outputSummary = ` -> Hint: ${hintMatch ? hintMatch[0] : "Requirement validation failed"}`
            } else {
              // Summarize large outputs instead of omitting them
              const preview = outStr.replace(/\n/g, " ").trim().slice(0, 150)
              outputSummary = ` -> Output: [Truncated from ${outStr.length} chars] "${preview}..."`
            }
          }

          timeline.push(
            `Turn ${turn.id}: Tool '${tool.name}' executed (${detail}) -> Result: ${tool.status}${outputSummary}`,
          )
        }
      }
    }

    return timeline.join("\n")
  }

  export async function analyze(sessionID: string, chatHistory: MessageV2.WithParts[], workspaceRoot?: string) {
    const turns = await getTurns(sessionID)

    const summary = {
      tpsList: [] as number[],
      ttftMsList: [] as number[],
      jsonRepairs: 0,
      interventions: [] as string[],
      mcpxFailures: [] as string[],
    }

    for (const turn of turns) {
      // Collect metrics from lines in the turn (legacy or metadata)
      for (const line of turn.lines) {
        if (line.metadata?.event === "END_GENERATE" && line.metadata.metrics) {
          try {
            const metrics = JSON.parse(line.metadata.metrics)
            if (metrics.tps) summary.tpsList.push(metrics.tps)
            if (metrics.ttftMs) summary.ttftMsList.push(metrics.ttftMs)
            if (metrics.json_repaired) summary.jsonRepairs++
          } catch (e) {}
        }
      }

      // Collect failures and interventions
      summary.mcpxFailures.push(...turn.mcpxFailures)
      summary.interventions.push(...turn.interventions)

      // Also check tool statuses for failures
      for (const tool of turn.tools) {
        if (tool.status === "failed") {
          summary.mcpxFailures.push(`${tool.name}: ${tool.error || "Unknown error"}`)
        }
      }
    }

    const actionTimeline = generateActionTimeline(turns)

    const recentThoughts: string[] = []
    const touchedFiles = new Set<string>()
    let interruptedToolCall: { tool: string; raw: string } | undefined = undefined

    // Use turns for touched files too
    for (const turn of turns) {
      for (const tool of turn.tools) {
        const input = tool.input as any

        if (["edit", "write", "read", "replace", "read_file", "write_file", "view_file"].includes(tool.name)) {
          if (input?.filePath) touchedFiles.add(input.filePath)
          if (input?.file_path) touchedFiles.add(input.file_path)
        } else if (tool.name.startsWith("mcpx [") && input?.args) {
          const args = input.args as Record<string, any>
          if (args?.file_path) touchedFiles.add(args.file_path)
          if (args?.path) touchedFiles.add(args.path)
        } else if (tool.name === "bash" && typeof input?.command === "string") {
          const fileMatches = input.command.match(/[\w.\-\/]+\.(ts|js|json|md|txt|py|go|rs)/g)
          if (fileMatches) {
            for (const m of fileMatches) touchedFiles.add(m)
          }
        }
      }
    }

    const recentMessages = chatHistory.slice(-50)
    const lastUserIndex = recentMessages.findLastIndex((m) => m.info.role === "user")

    for (let i = 0; i < recentMessages.length; i++) {
      const msg = recentMessages[i]
      const isMostRecentTurn = i > lastUserIndex

      for (const part of msg.parts) {
        if (part.type === "reasoning" && part.text) {
          if (isMostRecentTurn || part.text.length < 500) {
            recentThoughts.push(part.text)
          } else {
            // Summarize older, large thinking blocks
            const preview = part.text.slice(0, 150).replace(/\n/g, " ").trim()
            const tail = part.text.slice(-150).replace(/\n/g, " ").trim()
            recentThoughts.push(`[Older Thought Summary: ${part.text.length} chars] ${preview}... (omitted) ...${tail}`)
          }
        }
        
        if (part.type === "tool" && "state" in part) {
          // Check for interrupted tool calls in the most recent turn
          if (isMostRecentTurn && (part.state.status === "pending" || part.state.status === "error") && "raw" in part.state && part.state.raw) {
            interruptedToolCall = { tool: part.tool, raw: part.state.raw as string }
          }
          
          // Fallback to chat history for files if telemetry is sparse
          const input = part.state.input as any
          if (["edit", "write", "read", "replace", "read_file", "write_file", "view_file"].includes(part.tool)) {
            const filePath = input?.filePath || input?.file_path
            if (filePath) touchedFiles.add(filePath)
          } else if (part.tool === "mcpx" && input?.args) {
            const args = input.args as Record<string, any>
            if (args?.file_path) touchedFiles.add(args.file_path)
            if (args?.path) touchedFiles.add(args.path)
          }
        }
      }
    }

    // GROUND TRUTH VERIFICATION: Check which files actually exist on disk to prevent artifact ghosting
    const verifiedFiles: string[] = []
    const missingFiles: string[] = []

    if (workspaceRoot) {
      const uniqueTouched = Array.from(touchedFiles)
      await Promise.all(
        uniqueTouched.map(async (file) => {
          // Robust path resolution to handle both relative and absolute paths in the container
          const normalizedFile = file.startsWith(workspaceRoot) ? file : path.join(workspaceRoot, file)
          try {
            await fs.stat(normalizedFile)
            verifiedFiles.push(file)
          } catch (e) {
            missingFiles.push(file)
          }
        }),
      )
    }

    return {
      telemetry: summary,
      actionTimeline,
      thoughts: recentThoughts,
      touchedFiles: Array.from(touchedFiles),
      verifiedFiles: verifiedFiles.length > 0 ? verifiedFiles : undefined,
      missingFiles: missingFiles.length > 0 ? missingFiles : undefined,
      interruptedToolCall,
      lastUserMessage: chatHistory.findLast((m) => m.info.role === "user"),
    }
  }
}
