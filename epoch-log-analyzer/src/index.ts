import { readLogs } from "./analyzer/LogReader";
import { TurnAggregator } from "./analyzer/TurnAggregator";
import { InterventionEngine } from "./analyzer/InterventionEngine";
import { McpxAuditor } from "./analyzer/McpxAuditor";
import { Reporter } from "./analyzer/Reporter";
import type { AnalyzerResult, Turn } from "./types";

async function main() {
  const filePath = Bun.argv[2];
  if (!filePath) {
    console.error("Usage: bun run src/index.ts <log_file>");
    process.exit(1);
  }

  const aggregator = new TurnAggregator();
  const interventionEngine = new InterventionEngine();
  const mcpxAuditor = new McpxAuditor();
  const reporter = new Reporter();

  const turns: Turn[] = [];

  try {
    for await (const line of readLogs(filePath)) {
      const turn = aggregator.processLine(line);
      if (turn) {
        interventionEngine.analyze(turn);
        mcpxAuditor.analyze(turn);
        turns.push(turn);
      }
    }

    const lastTurn = aggregator.flush();
    if (lastTurn) {
      interventionEngine.analyze(lastTurn);
      mcpxAuditor.analyze(lastTurn);
      turns.push(lastTurn);
    }

    const result: AnalyzerResult = {
      turns,
      summary: {
        totalTurns: turns.length,
        interventionCount: turns.reduce((acc, t) => acc + t.interventions.length, 0),
        failureCount: turns.reduce((acc, t) => acc + t.mcpxFailures.length, 0),
      },
    };

    console.log(reporter.generate(result));
  } catch (error) {
    console.error(`Error analyzing logs: ${error}`);
    process.exit(1);
  }
}

main();
