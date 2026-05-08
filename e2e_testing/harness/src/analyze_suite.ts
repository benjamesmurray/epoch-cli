import * as fs from "fs/promises";
import * as path from "path";
import { parseArgs } from "util";

async function analyzeSuite() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      suite: { type: "string" }
    },
    allowPositionals: true
  });

  const resultsDir = "/home/benmurray/Projects/cli/e2e_testing/results";
  let suiteDir = values.suite;

  if (!suiteDir) {
    const suites = (await fs.readdir(resultsDir))
      .filter(f => f.startsWith("suite_"))
      .sort()
      .reverse();
    if (suites.length === 0) {
      console.error("No suites found.");
      return;
    }
    suiteDir = path.join(resultsDir, suites[0]);
  } else if (!suiteDir.startsWith("/")) {
      suiteDir = path.join(resultsDir, suiteDir);
  }

  console.log(`Analyzing suite: ${suiteDir}`);

  const reportPath = path.join(suiteDir, "variance_report.md");
  if (!(await fs.stat(reportPath).catch(() => false))) {
    console.error("variance_report.md not found in suite.");
    return;
  }

  const report = await fs.readFile(reportPath, "utf-8");
  const failedRuns = extractFailedRuns(report);

  console.log(`Found ${failedRuns.length} failures to classify.`);

  const classification = [];

  for (const run of failedRuns) {
    const runDir = path.join(suiteDir, run.runId);
    const logPath = path.join(runDir, "run.log");
    const testResultsPath = path.join(runDir, "test_results.json"); // Assuming the harness might save this

    let category = "Unknown";
    let detail = "";

    if (run.status === "Killed_Timeout") {
        category = "Agent Timeout";
        detail = await getLastAction(logPath);
    } else if (run.status === "Killed_Loop") {
        category = "Infinite Loop";
        detail = "Agent repeated tool calls";
    } else if (run.status === "Failed_Tests") {
        category = "Functional Test Failure";
        detail = await getTestFailureDetail(runDir);
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

  await saveClassificationReport(suiteDir, classification);
}

function extractFailedRuns(report: string) {
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

async function getLastAction(logPath: string): Promise<string> {
    try {
        const content = await fs.readFile(logPath, "utf-8");
        const lines = content.split("\n").filter(l => l.trim() !== "");
        const lastFew = lines.slice(-5).join(" | ");
        return `Last log entries: ${lastFew}`;
    } catch {
        return "Log not accessible";
    }
}

async function getTestFailureDetail(runDir: string): Promise<string> {
    // Look for test output or logs
    try {
        const files = await fs.readdir(runDir);
        if (files.includes("test_output.log")) {
            const content = await fs.readFile(path.join(runDir, "test_output.log"), "utf-8");
            if (content.includes("FAIL")) {
                const failLine = content.split("\n").find(l => l.includes("FAIL"));
                return failLine || "Tests failed (see test_output.log)";
            }
        }
        return "Functional tests failed";
    } catch {
        return "Test detail not accessible";
    }
}

async function saveClassificationReport(suiteDir: string, classification: any[]) {
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

analyzeSuite().catch(console.error);
