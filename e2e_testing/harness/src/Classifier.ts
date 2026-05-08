import * as fs from "fs/promises";
import * as path from "path";

export class Classifier {
  public static async analyze(suiteDir: string): Promise<void> {
    console.log(`Analyzing suite: ${suiteDir}`);

    const reportPath = path.join(suiteDir, "variance_report.md");
    if (!(await fs.stat(reportPath).catch(() => false))) {
      console.error("variance_report.md not found in suite.");
      return;
    }

    const report = await fs.readFile(reportPath, "utf-8");
    const failedRuns = this.extractFailedRuns(report);

    console.log(`Found ${failedRuns.length} failures to classify.`);

    const classification = [];

    for (const run of failedRuns) {
      const runDir = path.join(suiteDir, run.runId);
      const logPathInRunDir = path.join(runDir, "run.log");
      // The harness seems to save it as runId.log in the suite root too
      const logPathInSuiteRoot = path.join(suiteDir, `${run.runId}.log`);
      
      let logPath = (await fs.stat(logPathInRunDir).catch(() => false)) ? logPathInRunDir : logPathInSuiteRoot;

      let category = "Unknown";
      let detail = "";

      if (run.status === "Killed_Timeout") {
          category = "Agent Timeout";
          detail = await this.getLastAction(logPath);
      } else if (run.status === "Killed_Loop") {
          category = "Infinite Loop";
          detail = "Agent repeated tool calls";
      } else if (run.status === "Failed_Tests") {
          category = "Functional Test Failure";
          detail = await this.getTestFailureDetail(runDir);
      } else if (run.status === "Error") {
          category = "Harness Error";
          detail = run.message;
      }

      classification.push({
        runId: run.runId,
        status: run.status,
        category,
        detail
      });
    }

    await this.saveClassificationReport(suiteDir, classification);
  }

  private static extractFailedRuns(report: string) {
      const runs: any[] = [];
      const lines = report.split("\n");
      let inDetails = false;
      for (const line of lines) {
          if (line.includes("## Details")) {
              inDetails = true;
              continue;
          }
          if (inDetails && line.startsWith("| ") && !line.includes("Run ID")) {
              const parts = line.split("|").map(p => p.trim());
              if (parts.length > 5) {
                  const runId = parts[1];
                  const status = parts[4].replace(/^[^\w]*/, ""); // Remove icons
                  const message = parts[11];
                  if (status !== "Success") {
                      runs.push({ runId, status, message });
                  }
              }
          }
      }
      return runs;
  }

  private static async getLastAction(logPath: string): Promise<string> {
      try {
          const content = await fs.readFile(logPath, "utf-8");
          const lines = content.split("\n").filter(l => l.trim() !== "");
          const lastFew = lines.slice(-5).join(" | ");
          return `Last log entries: ${lastFew}`;
      } catch {
          return "Log not accessible";
      }
  }

  private static async getTestFailureDetail(runDir: string): Promise<string> {
      try {
          const files = await fs.readdir(runDir, { recursive: true });
          // Search for test_output.log in the workspace
          const testLog = files.find(f => f.endsWith("test_output.log"));
          if (testLog) {
              const content = await fs.readFile(path.join(runDir, testLog), "utf-8");
              if (content.includes("FAIL") || content.includes("ERROR")) {
                  const lines = content.split("\n");
                  const failLine = lines.find(l => l.includes("FAIL")) || lines.find(l => l.includes("error:"));
                  return failLine ? failLine.trim() : "Tests failed (see test_output.log)";
              }
          }
          return "Functional tests failed";
      } catch {
          return "Test detail not accessible";
      }
  }

  private static async saveClassificationReport(suiteDir: string, classification: any[]) {
      let report = "# Failure Classification Report\n\n";
      report += "| Run ID | Status | Category | Detail |\n";
      report += "|--------|--------|----------|--------|\n";
      for (const c of classification) {
          report += `| ${c.runId} | ${c.status} | ${c.category} | ${c.detail} |\n`;
      }

      const outputPath = path.join(suiteDir, "failure_classification.md");
      await fs.writeFile(outputPath, report);
      console.log(`Classification report saved to: ${outputPath}`);
  }
}
