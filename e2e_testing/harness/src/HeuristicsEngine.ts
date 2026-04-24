import { TurnAggregator } from "./telemetry/TurnAggregator";
import { Turn } from "./telemetry/types";

export class LoopException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoopException";
  }
}

export class HeuristicsEngine {
  private aggregator: TurnAggregator;
  private toolCallHistory: string[] = [];
  private loopThreshold: number;
  private usedTools: Set<string> = new Set();
  public jsonRepairs: number = 0;
  private runId: string;
  
  // Performance metrics tracking
  private tpsHistory: number[] = [];
  private ttftHistory: number[] = [];
  private totalTokens: number = 0;
  private fullPrompts: any[] = [];
  public totalEpochs: number = 0;
  public lastContinuityWrite: number = 0;

  constructor(runId: string, loopThreshold: number = 3) {
    this.aggregator = new TurnAggregator();
    this.loopThreshold = loopThreshold;
    this.runId = runId;
  }

  /**
   * Feed a line of output (from stdout/stderr or log file) into the engine.
   * Throws LoopException if an infinite loop is detected.
   */
  public processLine(line: string): void {
    const turn = this.aggregator.processLine(line);
    
    // If a turn was just finished, update metrics
    if (turn) {
      if (turn.tps) this.tpsHistory.push(turn.tps);
      if (turn.ttftMs) this.ttftHistory.push(turn.ttftMs);
      if (turn.totalTokens) this.totalTokens = turn.totalTokens;
      if (turn.isEpochTransition) {
          this.totalEpochs++;
          console.log(`    [${this.runId}] 🔄 Epoch Transition detected (Total: ${this.totalEpochs})`);
      }
    }

    if (line.includes("Wrote .epoch-continuity.toon") || line.includes("Wrote .epoch-continuity.md")) {
        this.lastContinuityWrite++;
        console.log(`    [${this.runId}] 📝 Continuity Report updated (Total: ${this.lastContinuityWrite})`);
    }

    // Check for START_GENERATE to capture Turn Payload (prompt/tools)
    // We still use regex here because TurnAggregator doesn't store the massive payload strings to keep memory low
    if (line.includes('event=START_GENERATE')) {
      try {
        const payloadMatch = line.match(/payload=([\[{].*?[\]}])(?=\s+\w+=|\s+[\w\s]+$|$)/);
        const toolsMatch = line.match(/tools=([\[{].*?[\]}])(?=\s+\w+=|\s+[\w\s]+$|$)/);
        
        if (payloadMatch) {
          try {
            const parsedPayload = JSON.parse(payloadMatch[1]!);
            this.fullPrompts.push({
                payload: parsedPayload,
                tools: toolsMatch ? JSON.parse(toolsMatch[1]!) : []
            });
            console.log(`    [${this.runId}] ✅ Captured turn payload (${this.fullPrompts.length} turns so far, ${payloadMatch[1]!.length} bytes)`);
          } catch (parseErr: any) {
             // If it's a JSON event, we might need a different regex or just parse the line
             try {
                const json = JSON.parse(line);
                if (json.event === "START_GENERATE" && json.payload) {
                    this.fullPrompts.push({
                        payload: json.payload,
                        tools: json.tools || []
                    });
                     console.log(`    [${this.runId}] ✅ Captured turn payload from JSON (${this.fullPrompts.length} turns so far)`);
                }
             } catch (e) {}
          }
        }
      } catch (e) {}
    }

    // Capture JSON Repairs
    if (line.includes('"json_repaired":true')) {
        this.jsonRepairs++;
        console.log(`    [${this.runId}] ⚠️ Model payload repaired by middleware (Total: ${this.jsonRepairs})`);
    }

    // Tool Invocation Tracking & Loop Detection
    let toolName: string | undefined;
    let toolArgs: string | undefined;

    // Try Raw JSON first (Logfmt style)
    const jsonMatch = line.match(/name["\s:]+([a-zA-Z0-9_-]+)["\s,]+(?:arguments|args)["\s:]+({[^}]+})/i);
    if (jsonMatch && jsonMatch[1] && jsonMatch[2]) {
      toolName = jsonMatch[1];
      toolArgs = jsonMatch[2].trim();
    } else {
      // Try Pretty-printed ⚙ format
      const prettyMatch = line.match(/⚙\s+([a-zA-Z0-9_-]+)\s+({.+})/);
      if (prettyMatch && prettyMatch[1] && prettyMatch[2]) {
        toolName = prettyMatch[1];
        toolArgs = prettyMatch[2].trim();
      } else {
        // Try structured JSON event
        try {
            const json = JSON.parse(line);
            if (json.event === "TOOL_START") {
                toolName = json.tool;
                toolArgs = JSON.stringify(json.input);
            }
        } catch (e) {}
      }
    }
    
    if (toolName && toolArgs) {
      const toolSignature = `${toolName}:${toolArgs}`;

      this.usedTools.add(toolName);
      this.toolCallHistory.push(toolSignature);
      
      console.log(`    [${this.runId}] 🛠️ Tool Invoked: ${toolName}`);
      // Check loop
      if (this.toolCallHistory.length >= this.loopThreshold) {
        const recent = this.toolCallHistory.slice(-this.loopThreshold);
        const allIdentical = recent.every(sig => sig === recent[0]);
        if (allIdentical) {
          throw new LoopException(`Infinite loop detected: ${toolSignature} called ${this.loopThreshold} times in a row.`);
        }
      }
    }
    
    // Fallback for spec-cli tools if they appear in logs without full arguments
    if (line.match(/^(DEBUG|INFO|ERROR|WARN)\s/) && !line.includes('event=START_GENERATE')) {
        const specCliMatch = line.match(/(sc_init|sc_plan|sc_approve|sc_todo_start|sc_todo_complete|sc_status|sc_guidance|pm_query|pm_plan|pm_init|pm_status|gt_status|gt_exec)/);
        if (specCliMatch && specCliMatch[1] && !toolName) {
            this.usedTools.add(specCliMatch[1]);
            console.log(`    [${this.runId}] 🛠️ Spec Tool Invoked: ${specCliMatch[1]}`);
        }
    }
  }

  public detectSpecCliUsage(expectedTools: string[]): boolean {
    return expectedTools.every(tool => this.usedTools.has(tool));
  }
  
  public getUsedTools(): string[] {
      return Array.from(this.usedTools);
  }

  public getMetrics() {
    const avgTps = this.tpsHistory.length > 0 
      ? this.tpsHistory.reduce((a, b) => a + b, 0) / this.tpsHistory.length 
      : undefined;
    const avgTtftMs = this.ttftHistory.length > 0 
      ? this.ttftHistory.reduce((a, b) => a + b, 0) / this.ttftHistory.length 
      : undefined;
    
    return {
      avgTps,
      avgTtftMs,
      totalTokens: this.totalTokens > 0 ? this.totalTokens : undefined,
      totalEpochs: this.totalEpochs
    };
  }

  public getFullPrompts(): any[] {
    return this.fullPrompts;
  }

  public hasFullPayload(): boolean {
    return this.fullPrompts.length > 0;
  }
}
