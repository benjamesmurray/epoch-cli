import * as fs from "fs/promises"
import { createReadStream } from "fs"
import * as path from "path"
import * as readline from "readline"
import { Log } from "./log"

export namespace LogParserTool {
  const LOG_DIR = "/home/llm/utils/launch/logs"

  export async function getLatestLogFile(): Promise<string | null> {
    try {
      const files = await fs.readdir(LOG_DIR)
      const logFiles = files.filter(f => f.endsWith('.log') || f.includes("epochcli"))
      if (logFiles.length === 0) return null

      const stats = await Promise.all(logFiles.map(async f => {
        const fullPath = path.join(LOG_DIR, f)
        return { file: fullPath, stat: await fs.stat(fullPath) }
      }))

      stats.sort((a, b) => b.stat.mtime.getTime() - a.stat.mtime.getTime())
      return stats[0].file
    } catch (error) {
      console.error('Error reading log directory:', error)
      return null
    }
  }

  /**
   * Parses log files to verify sequential, non-overlapping execution.
   */
  export async function verifySequentialExecution(logFile?: string) {
    const targetFile = logFile || (await getLatestLogFile())
    
    if (!targetFile) {
        return { valid: false, message: `No log files found in ${LOG_DIR}` }
    }

    try {
        let overlapDetected = false
        let sequentialSuccessCount = 0
        let repairCount = 0
        
        const fileStream = createReadStream(targetFile)
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        })

        // Track active provider per epochId
        const stateMachine = new Map<string, string>() 

        for await (const line of rl) {
            try {
                // Epoch logs look like: 2026-04-08T12:00:00 +0ms service=llm {"event":"START_GENERATE", ...}
                // Extract the JSON portion
                const match = line.match(/\{.*\}/)
                if (!match) continue
                
                const event = JSON.parse(match[0]) as Log.EnhancedModelExecutionEvent
                
                if (event.json_repaired) {
                    repairCount++
                }

                if (!event.event || !event.providerId || !event.epochId) continue

                if (event.event === "START_GENERATE") {
                    const activeProvider = stateMachine.get(event.epochId)
                    if (activeProvider && activeProvider !== event.providerId) {
                        overlapDetected = true
                        return { valid: false, message: `Concurrency Violation: ${event.providerId} started while ${activeProvider} was still active in epoch ${event.epochId}` }
                    }
                    stateMachine.set(event.epochId, event.providerId)
                } else if (event.event === "END_GENERATE") {
                    const activeProvider = stateMachine.get(event.epochId)
                    if (activeProvider === event.providerId) {
                        stateMachine.delete(event.epochId)
                        sequentialSuccessCount++
                    }
                }
            } catch (err) {
                // Ignore parsing errors for non-matching lines
            }
        }
        
        if (overlapDetected) {
             return { valid: false, message: "Overlap detected between local-side and local-main execution." }
        }

        return { valid: true, message: `Sequential execution verified. No overlap detected. Total sequential handoffs: ${sequentialSuccessCount}. JSON Repairs: ${repairCount}` }

    } catch (e) {
        return { valid: false, message: `Log parsing failed: ${String(e)}` }
    }
  }
}

// If run directly
if (require.main === module) {
  const fileArg = process.argv[2]
  LogParserTool.verifySequentialExecution(fileArg).then(res => {
      console.log(res.valid ? "✅ " + res.message : "❌ " + res.message)
  }).catch(console.error)
}
