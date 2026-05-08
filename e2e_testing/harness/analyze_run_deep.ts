import { TurnAggregator } from "./src/telemetry/TurnAggregator";
import { parseLogLine } from "./src/telemetry/ParserUtils";
import * as fs from "fs/promises";
import * as path from "path";

async function analyzeRunDeep(logPath: string) {
    console.log(`Deep Analysis of: ${logPath}`);
    const content = await fs.readFile(logPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);
    const aggregator = new TurnAggregator();
    const turns: any[] = [];

    for (const line of lines) {
        const turn = aggregator.processLine(line);
        if (turn) turns.push(turn);
    }
    const lastTurn = aggregator.flush();
    if (lastTurn) turns.push(lastTurn);

    console.log(`Total Turns: ${turns.length}`);

    // Identify Failure Modes
    let failureModes = [];

    // 1. Context Pressure Analysis
    const transitions = turns.filter(t => t.isEpochTransition);
    if (transitions.length > 0) {
        console.log(`Epoch Transitions: ${transitions.length}`);
        // Check for thrashing (multiple transitions in a short time/few lines)
        let lastTransitionTime = 0;
        let thrashingCount = 0;
        for (const line of lines) {
            if (line.includes("Epoch transition triggered")) {
                thrashingCount++;
            }
        }
        if (thrashingCount > transitions.length + 5) {
            failureModes.push(`Context Thrashing: Detected ${thrashingCount} transition triggers, possible infinite loop.`);
        }
    }

    // 5. Termination Analysis
    const hasMaxTurns = content.includes("MAX_TURNS exceeded");
    if (hasMaxTurns) {
        failureModes.push("Max Turns Exceeded: Session forced to terminate.");
    }

    const hasTimeout = content.includes("Timeout exceeded") || content.includes("Killed_Timeout");
    if (hasTimeout) {
        failureModes.push("Timeout: Run killed due to inactivity or long duration.");
    }

    // 2. Tool Efficiency Analysis
    const totalTools = turns.reduce((acc, t) => acc + t.tools.length, 0);
    const writeTools = turns.reduce((acc, t) => acc + t.tools.filter((name: string) => ["write", "edit", "replace", "bash"].includes(name)).length, 0);
    const statusRatio = (totalTools - writeTools) / totalTools;
    if (statusRatio > 0.8 && turns.length > 10) {
        failureModes.push(`Action Paralysis: ${Math.round(statusRatio * 100)}% of tools were read-only/status.`);
    }

    // 3. JSON Repair Analysis
    const jsonRepairs = turns.reduce((acc, t) => {
        const repairs = t.lines.filter((l: any) => l.message.includes('"json_repaired":true')).length;
        return acc + repairs;
    }, 0);
    if (jsonRepairs > 5) {
        failureModes.push(`JSON Repair Burnout: ${jsonRepairs} repairs detected. Possible model degradation.`);
    }

    // 4. MCPX Composition Analysis
    const mcpxFailures = turns.reduce((acc, t) => {
        const failures = t.lines.filter((l: any) => l.level === "ERROR" && l.message.includes("mcpx")).length;
        return acc + failures;
    }, 0);
    if (mcpxFailures > 0) {
        failureModes.push(`MCPX Composition Failures: ${mcpxFailures} errors detected.`);
    }

    console.log("Detected Failure Modes:", failureModes.length > 0 ? failureModes : "None");
    return {
        turns: turns.length,
        transitions: transitions.length,
        jsonRepairs,
        mcpxFailures,
        failureModes
    };
}

const logPath = process.argv[2];
if (logPath) {
    analyzeRunDeep(logPath).catch(console.error);
}
