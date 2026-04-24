import { MessageV2 } from "../session/message-v2"
import * as fs from "fs/promises"
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
            }
          }
          
          timeline.push(`Turn ${turn.id}: Tool '${tool.name}' executed (${detail}) -> Result: ${tool.status}${outputSummary}`)
        }
      }
    }
    
    return timeline.join("\n")
  }

  export async function analyze(sessionID: string, chatHistory: MessageV2.WithParts[]) {
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
                } catch(e) {}
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

    // Use turns for touched files too
    for (const turn of turns) {
        for (const tool of turn.tools) {
            const input = tool.input as any
            if (tool.name === "edit" || tool.name === "write" || tool.name === "read" || tool.name === "replace") {
                if (input?.filePath) touchedFiles.add(input.filePath)
                if (input?.file_path) touchedFiles.add(input.file_path)
            } else if (tool.name === "bash" && typeof input?.command === "string") {
                 const fileMatches = input.command.match(/[\w.\-\/]+\.(ts|js|json|md|txt|py|go|rs)/g)
                 if (fileMatches) {
                     for (const m of fileMatches) touchedFiles.add(m)
                 }
            }
        }
    }

    const recentMessages = chatHistory.slice(-10)
    for (const msg of recentMessages) {
      for (const part of msg.parts) {
        if (part.type === "reasoning" && part.text) {
          recentThoughts.push(part.text)
        }
        // Fallback to chat history for files if telemetry is sparse
        if (part.type === "tool" && "state" in part) {
           const input = part.state.input as any
           if (part.tool === "edit" || part.tool === "write" || part.tool === "read" || part.tool === "replace") {
             const filePath = input?.filePath || input?.file_path
             if (filePath) touchedFiles.add(filePath)
           }
        }
      }
    }

    return {
      telemetry: summary,
      actionTimeline,
      thoughts: recentThoughts.slice(-3),
      touchedFiles: Array.from(touchedFiles),
      lastUserMessage: chatHistory.findLast(m => m.info.role === "user"),
    }
  }
}
