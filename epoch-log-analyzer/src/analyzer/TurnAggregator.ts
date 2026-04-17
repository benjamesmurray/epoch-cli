import type { LogLine, Turn } from "../types";
import { isStartGenerate, isEndGenerate } from "./ParserUtils";

export class TurnAggregator {
  private currentTurn: Turn | null = null;
  private turnId = 1;

  processLine(line: LogLine): Turn | null {
    if (isStartGenerate(line)) {
      const finishedTurn = this.currentTurn;
      this.currentTurn = {
        id: this.turnId++,
        startTime: line.timestamp,
        lines: [line],
        interventions: [],
        mcpxFailures: [],
        phase: line.metadata?.phase,
        activeAgent: line.metadata?.activeAgent,
      };
      return finishedTurn;
    }

    if (this.currentTurn) {
      this.currentTurn.lines.push(line);
      if (isEndGenerate(line)) {
        this.currentTurn.endTime = line.timestamp;
        const finishedTurn = this.currentTurn;
        this.currentTurn = null;
        return finishedTurn;
      }
    }

    return null;
  }

  flush(): Turn | null {
    const finishedTurn = this.currentTurn;
    this.currentTurn = null;
    return finishedTurn;
  }
}
