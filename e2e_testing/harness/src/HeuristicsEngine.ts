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

  constructor(runId: string, loopThreshold: number = 3) {
    this.loopThreshold = loopThreshold;
    this.runId = runId;
  }

  /**
   * Feed a line of output (from stdout/stderr or log file) into the engine.
   * Throws LoopException if an infinite loop is detected.
   */
  public processLine(line: string): void {
    // Check for JSON repairs in epochcli audit logs
    if (line.includes('"json_repaired":true')) {
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
    if (jsonMatch) {
      toolName = jsonMatch[1];
      toolArgs = jsonMatch[2].trim();
    } else {
      // Try Pretty-printed ⚙ format
      const prettyMatch = line.match(/⚙\s+([a-zA-Z0-9_-]+)\s+({.+})/);
      if (prettyMatch) {
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
    const specCliMatch = line.match(/(sc_init|sc_todo_start|sc_todo_complete|sc_plan|pm_query)/);
    if (specCliMatch && !toolName) {
        this.usedTools.add(specCliMatch[1]);
        console.log(`    [${this.runId}] 🛠️ Spec Tool Invoked: ${specCliMatch[1]}`);
    }
  }

  public detectSpecCliUsage(expectedTools: string[]): boolean {
    return expectedTools.every(tool => this.usedTools.has(tool));
  }
  
  public getUsedTools(): string[] {
      return Array.from(this.usedTools);
  }
}

