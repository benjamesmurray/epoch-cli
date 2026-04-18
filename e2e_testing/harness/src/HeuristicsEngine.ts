export class LoopException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoopException";
  }
}

export class HeuristicsEngine {
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

  constructor(runId: string, loopThreshold: number = 3) {
    this.loopThreshold = loopThreshold;
    this.runId = runId;
  }

  /**
   * Feed a line of output (from stdout/stderr or log file) into the engine.
   * Throws LoopException if an infinite loop is detected.
   */
  public processLine(line: string): void {
    // Check for EnhancedModelExecutionEvent JSON events
    if (line.includes('event=START_GENERATE')) {
      try {
        // Robust extraction that handles both quoted and unquoted values in Log.EnhancedModelExecutionEvent format
        // We match until the next tag (e.g. " tools=") or the end of the line message
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
            
            // Doom Loop Escape Hatch: If we reach an unreasonable number of turns, kill the process to save resources
            if (this.fullPrompts.length > 30) {
              throw new LoopException(`Agent exceeded maximum turn threshold (30 turns). Aborting to prevent doom loop.`);
            }
          } catch (parseErr: any) {
            console.log(`    [${this.runId}] ❌ Failed to parse payload JSON: ${parseErr.message}`);
          }
        } else {
           console.log(`    [${this.runId}] ❌ event=START_GENERATE found but payload regex failed`);
        }
      } catch (e) {
        // Parse failed, continue
      }
    }

    if (line.includes('event=END_GENERATE')) {
        try {
            const metricsMatch = line.match(/metrics=({.*?})(?:\s|$)/);
            if (metricsMatch) {
                const metrics = JSON.parse(metricsMatch[1]!);
                if (metrics.tps) this.tpsHistory.push(metrics.tps);
                if (metrics.ttftMs) this.ttftHistory.push(metrics.ttftMs);
                if (metrics.promptTokens) this.totalTokens += metrics.promptTokens;
                if (metrics.completionTokens) this.totalTokens += metrics.completionTokens;
                if (metrics.json_repaired) {
                    this.jsonRepairs++;
                    console.log(`    [${this.runId}] ⚠️ Model payload repaired by middleware (Total: ${this.jsonRepairs})`);
                }
            }
        } catch (e) {}
    }

    // Check for JSON repairs in legacy epochcli audit logs (fallback)
    if (line.includes('"json_repaired":true') && !line.includes('"event":')) {
      this.jsonRepairs++;
      console.log(`    [${this.runId}] ⚠️ Model payload repaired by middleware (Total: ${this.jsonRepairs})`);
    }

    // Attempt to extract tool calls.
    // In our CLI, tool calls might appear as raw JSON or specific tool markers.
    // Attempt to extract tool calls.
    // 1. Raw JSON events: {"name": "tool_name", "arguments": {...}}
    // 2. Pretty-printed logs: ⚙ tool_name {"args"}
    
    let toolName: string | undefined;
    let toolArgs: string | undefined;

    // Try Raw JSON first
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
      } else if (this.toolCallHistory.length >= 2) {
        const recent = this.toolCallHistory.slice(-2);
        const allIdentical = recent.every(sig => sig === recent[0]);
        if (allIdentical) {
           console.log(`    [${this.runId}] ⚠️ Warning: Identical tool call repeated (${toolName}). One more will trigger kill.`);
        }
      }
    }
    
    // Also explicitly track tool invocations by just the name if arguments aren't logged easily
    if (line.match(/^(DEBUG|INFO|ERROR|WARN)\s/) && !line.includes('event=START_GENERATE')) {
        const specCliMatch = line.match(/(sc_init|sc_todo_start|sc_todo_complete|sc_plan|pm_query)/);
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
      totalTokens: this.totalTokens > 0 ? this.totalTokens : undefined
    };
  }

  public getFullPrompts(): any[] {
    return this.fullPrompts;
  }

  public hasFullPayload(): boolean {
    return this.fullPrompts.length > 0;
  }
}

