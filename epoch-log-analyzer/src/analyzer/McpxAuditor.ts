import type { Turn } from "../types";

export class McpxAuditor {
  private currentTool: string | null = null;

  analyze(turn: Turn): void {
    for (const line of turn.lines) {
      // Look for mcpx tool execution start
      // INFO  ... service=mcp server=project-map-cli method=pm_query executing mcpx
      if (line.metadata?.service === "mcp" && line.metadata?.method) {
        this.currentTool = `${line.metadata.server}.${line.metadata.method}`;
      }

      // Look for mcpx tool failures
      // INFO  ... service=mcp server=project-map-cli method=pm_query exit=2 stderr="calling tool: invalid params: unknown argument \"path\""
      if (line.metadata?.service === "mcp" && line.metadata?.exit && line.metadata?.exit !== "0") {
        const exitCode = line.metadata.exit;
        const stderr = line.metadata.stderr || "";
        const tool = `${line.metadata.server}.${line.metadata.method}` || this.currentTool || "unknown";

        if (exitCode === "2" && (stderr.includes("unknown argument") || stderr.includes("invalid params") || stderr.includes("missing required argument"))) {
          turn.mcpxFailures.push(`[COMPOSITION FAILURE] ${tool}: ${stderr}`);
        } else {
          turn.mcpxFailures.push(`[TOOL ERROR] ${tool} (exit ${exitCode}): ${stderr}`);
        }
      }

      // Detect self-discovery loops (repeatedly calling help or status)
      if (line.message.includes("--help") || line.message.includes("status")) {
        const helpCount = turn.lines.filter(l => l.message.includes("--help")).length;
        if (helpCount > 2 && !turn.interventions.includes("Excessive Self-Discovery")) {
          turn.interventions.push("Excessive Self-Discovery");
        }
      }
    }
  }
}
