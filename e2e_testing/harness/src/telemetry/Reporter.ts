import pc from "picocolors";
import type { AnalyzerResult, Turn } from "../types";

export class Reporter {
  generate(result: AnalyzerResult): string {
    const report: string[] = [];

    report.push(pc.bold(pc.cyan("=== Epoch Log Analysis Report ===")));
    report.push(`Total Turns: ${result.summary.totalTurns}`);
    report.push(`Interventions: ${pc.yellow(result.summary.interventionCount)}`);
    report.push(`Failures: ${pc.red(result.summary.failureCount)}`);
    report.push(`Max Context: ${this.formatFullness(result.summary.maxContextFullness)}`);
    report.push("");

    report.push(pc.bold("Run Timeline:"));
    for (const turn of result.turns) {
      this.formatTurn(turn, report);
    }

    const transitions = result.turns.filter(t => t.isEpochTransition);
    if (transitions.length > 0) {
      report.push("");
      report.push(pc.bold(pc.magenta("Epoch Transitions:")));
      for (const turn of transitions) {
        report.push(`  - Epoch closed after Turn ${turn.id} due to context limit`);
      }
    }

    if (result.summary.interventionCount > 0 || result.summary.failureCount > 0) {
      report.push("");
      report.push(pc.bold(pc.red("Critical Events:")));
      for (const turn of result.turns) {
        if (turn.interventions.length > 0 || turn.mcpxFailures.length > 0) {
          report.push(`Turn ${turn.id} (${turn.phase || "unknown phase"}):`);
          for (const i of turn.interventions) report.push(`  - Intervention: ${pc.yellow(i)}`);
          for (const f of turn.mcpxFailures) report.push(`  - Failure: ${pc.red(f)}`);
        }
      }
    }

    return report.join("\n");
  }

  private formatTurn(turn: Turn, report: string[]): void {
    const status = turn.mcpxFailures.length > 0 ? pc.red("✖") : 
                   turn.interventions.length > 0 ? pc.yellow("!") : 
                   pc.green("✔");
    
    const phaseStr = turn.phase ? ` [${turn.phase}]` : "";
    const agentStr = turn.activeAgent ? ` (${turn.activeAgent})` : "";
    
    const tokens = turn.totalTokens ? ` | ${turn.totalTokens} tokens` : "";
    const fullness = turn.contextFullness !== undefined ? ` (${this.formatFullness(turn.contextFullness)})` : "";
    const transition = turn.isEpochTransition ? pc.magenta(" [EPOCH RESET]") : "";
    
    report.push(`${status} Turn ${turn.id}${phaseStr}${agentStr}${tokens}${fullness}${transition} - ${turn.lines.length} lines`);
  }

  private formatFullness(fullness: number): string {
    const pct = Math.round(fullness * 100);
    const color = fullness > 0.9 ? pc.red : (fullness > 0.7 ? pc.yellow : pc.green);
    return color(`${pct}%`);
  }
}
