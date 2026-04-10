import { RunResult } from "./types";
import * as fs from "fs/promises";
import * as path from "path";

export class Reporter {
  public static async generateMarkdown(results: RunResult[], outputPath: string): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const totalRuns = results.length;
    
    let successes = 0;
    let failedTests = 0;
    let timeouts = 0;
    let loops = 0;
    let errors = 0;
    
    let totalDuration = 0;

    const rows: string[] = [];

    for (const res of results) {
      totalDuration += res.durationMs;
      
      switch (res.status) {
        case "Success": successes++; break;
        case "Failed_Tests": failedTests++; break;
        case "Killed_Timeout": timeouts++; break;
        case "Killed_Loop": loops++; break;
        case "Error": errors++; break;
      }

      const durSeconds = (res.durationMs / 1000).toFixed(1);
      const toolsUsed = res.usedExpectedTools ? "✅" : "❌";
      const statusIcon = res.status === "Success" ? "✅" : (res.status === "Failed_Tests" ? "❌" : "⚠️");
      
      rows.push(`| ${res.runId} | ${res.iteration} | ${toolsUsed} | ${statusIcon} ${res.status} | ${res.jsonRepairs || 0} | ${durSeconds}s | ${res.errorMessage || "-"} |`);
    }

    const avgDuration = totalRuns > 0 ? (totalDuration / totalRuns / 1000).toFixed(1) : "0";

    const content = `# E2E Variance Report
**Generated:** ${timestamp}
**Total Runs:** ${totalRuns}
**Average Duration:** ${avgDuration}s

## Summary
- **Successes:** ${successes}
- **Failed Tests:** ${failedTests}
- **Timeouts:** ${timeouts}
- **Infinite Loops:** ${loops}
- **Errors:** ${errors}

## Details
| Run ID | Iteration | Expected Tools | Status | JSON Repairs | Duration | Message |
|--------|-----------|----------------|--------|--------------|----------|---------|
${rows.join("\n")}
`;

    await fs.writeFile(outputPath, content, "utf-8");
  }
}
