import pc from "picocolors";
import type { AnalyzerResult, Turn } from "../types";

export class Reporter {
  generate(result: AnalyzerResult): string {
    const report: string[] = [];

    report.push(pc.bold(pc.cyan("=== Epoch Log Analysis Report ===")));
    report.push(`Total Turns: ${result.summary.totalTurns}`);
    report.push(`Interventions: ${pc.yellow(result.summary.interventionCount)}`);
    report.push(`Failures: ${pc.red(result.summary.failureCount)}`);
    report.push("");

    report.push(pc.bold("Run Timeline:"));
    for (const turn of result.turns) {
      this.formatTurn(turn, report);
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
    
    report.push(`${status} Turn ${turn.id}${phaseStr}${agentStr} - ${turn.lines.length} lines`);
  }
}
