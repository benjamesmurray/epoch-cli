import { readLogs } from "../packages/util/src/telemetry/LogReader";
import { TurnAggregator } from "../packages/util/src/telemetry/TurnAggregator";
import { Reporter } from "../packages/util/src/telemetry/Reporter";
import type { Turn } from "../packages/util/src/telemetry/types";

async function analyze(logPath: string) {
    const aggregator = new TurnAggregator();
    const reporter = new Reporter();
    const turns: Turn[] = [];

    console.log(`Reading log: ${logPath}`);
    for await (const line of readLogs(logPath)) {
        const turn = aggregator.processLine(line);
        if (turn) turns.push(turn);
    }
    const lastTurn = aggregator.flush();
    if (lastTurn) turns.push(lastTurn);

    const result = {
        turns,
        summary: {
            totalTurns: turns.length,
            interventionCount: turns.reduce((acc, t) => acc + t.interventions.length, 0),
            failureCount: turns.reduce((acc, t) => acc + t.mcpxFailures.length, 0),
            maxContextFullness: Math.max(...turns.map(t => t.contextFullness || 0), 0)
        }
    };

    console.log(reporter.generate(result as any));
}

const logPath = process.argv[2];
if (!logPath) {
    console.error("Usage: bun scripts/analyze-run.ts <log-path>");
    process.exit(1);
}

analyze(logPath).catch(console.error);
