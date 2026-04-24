import type { Turn } from "./types";

export class InterventionEngine {
  private patterns = [
    { pattern: /Streaming loop detected/i, label: "Streaming Loop" },
    { pattern: /stagnation nudge/i, label: "Phase Stagnation" },
    { pattern: /Schema correction hint/i, label: "Schema Correction" },
    { pattern: /INVALID_ARGUMENTS/i, label: "Invalid Tool Arguments" },
  ];

  analyze(turn: Turn): void {
    for (const line of turn.lines) {
      for (const { pattern, label } of this.patterns) {
        if (pattern.test(line.message) && !turn.interventions.includes(label)) {
          turn.interventions.push(label);
        }
      }
    }
  }
}
