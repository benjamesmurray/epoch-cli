import type { LogLine, Turn } from "./types";
import { isStartGenerate, isEndGenerate, isContextLimitReached, extractMetrics, parseLogLine } from "./ParserUtils";

const DEFAULT_CONTEXT_LIMIT = 32000;

export class TurnAggregator {
  private currentTurn: Turn | null = null;
  private turnId = 1;
  private currentEpochTokens = 0;
  private lastContextLimit = DEFAULT_CONTEXT_LIMIT;

  /**
   * Process a log line (string or parsed LogLine).
   * Supports both Logfmt strings and structured JSON events.
   */
  processLine(line: string | LogLine): Turn | null {
    if (typeof line === "string") {
      const trimmed = line.trim();
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        try {
          const json = JSON.parse(trimmed);
          return this.processJSON(json);
        } catch (e) {
          // Fallback to regular log line parsing if JSON parse fails
        }
      }
      const parsed = parseLogLine(line);
      if (!parsed) return null;
      line = parsed;
    }

    // Process parsed LogLine (Logfmt)
    if (isContextLimitReached(line)) {
      if (this.currentTurn) {
        this.currentTurn.isEpochTransition = true;
      }
      this.currentEpochTokens = 0;
    }

    if (isStartGenerate(line)) {
      if (line.metadata?.contextLimit) {
        this.lastContextLimit = parseInt(line.metadata.contextLimit, 10) || DEFAULT_CONTEXT_LIMIT;
      }
      return this.startNewTurn(line.timestamp, line.metadata?.phase, line.metadata?.activeAgent, line);
    }

    if (this.currentTurn) {
      this.currentTurn.lines.push(line);
      
      if (isEndGenerate(line)) {
        const metrics = extractMetrics(line);
        return this.endCurrentTurn(line.timestamp, metrics);
      }
    }

    return null;
  }

  /**
   * Process a structured JSON event (e.g. from .jsonl telemetry stream)
   */
  processJSON(event: any): Turn | null {
    const timestamp = new Date(event.timestamp || Date.now()).toISOString();

    if (event.event === "START_GENERATE") {
        if (event.contextLimit) {
            this.lastContextLimit = event.contextLimit;
        }
        return this.startNewTurn(timestamp, event.phase, event.activeAgent);
    }

    if (this.currentTurn) {
        if (event.event === "END_GENERATE") {
            return this.endCurrentTurn(timestamp, event.metrics);
        }
        
        // Handle tool events if needed for turn aggregation
        if (event.event === "TOOL_START" || event.event === "TOOL_END") {
            // We can optionally add these to the turn's internal state
        }
    }

    return null;
  }

  private startNewTurn(timestamp: string, phase?: string, activeAgent?: string, firstLine?: LogLine): Turn | null {
    const finishedTurn = this.currentTurn;
    this.currentTurn = {
      id: this.turnId++,
      startTime: timestamp,
      lines: firstLine ? [firstLine] : [],
      interventions: [],
      mcpxFailures: [],
      phase,
      activeAgent,
      contextLimit: this.lastContextLimit,
    };
    return finishedTurn;
  }

  private endCurrentTurn(timestamp: string, metrics: any): Turn | null {
    if (!this.currentTurn) return null;

    this.currentTurn.endTime = timestamp;
    if (metrics) {
      this.currentTurn.promptTokens = metrics.promptTokens;
      this.currentTurn.completionTokens = metrics.completionTokens;
      
      if (metrics.promptTokens !== undefined) {
        this.currentEpochTokens = metrics.promptTokens + (metrics.completionTokens || 0);
      }
    }
    
    this.currentTurn.totalTokens = this.currentEpochTokens;
    this.currentTurn.contextFullness = this.currentEpochTokens / this.lastContextLimit;

    const finishedTurn = this.currentTurn;
    this.currentTurn = null;
    return finishedTurn;
  }

  flush(): Turn | null {
    const finishedTurn = this.currentTurn;
    this.currentTurn = null;
    return finishedTurn;
  }
}
