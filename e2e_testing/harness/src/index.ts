import { ConfigLoader } from "./ConfigLoader";
import { AgentRunner } from "./AgentRunner";
import { TestEvaluator } from "./TestEvaluator";
import { Reporter } from "./Reporter";
import type { RunResult } from "./types";
import { WorkspaceBuilder } from "./WorkspaceBuilder";
import * as path from "path";
import * as fs from "fs/promises";
import { parseArgs } from "util";

const EVALUATIONS_WORKSPACE = "/home/benmurray/Projects/epochclievaluations";
const LOCAL_EPOCHCLI_CMD = path.join(EVALUATIONS_WORKSPACE, "bin/epochcli");

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      iterations: { type: "string" },
      config: { type: "string" }
    },
    allowPositionals: true
  });

  const configFile = values.config || positionals[0] || path.join(process.cwd(), "test_config.json");
  const overrideIterations = values.iterations ? parseInt(values.iterations, 10) : undefined;

  console.log(`Loading configuration from ${configFile}...`);
  const configs = await ConfigLoader.load(configFile);
  
  const allResults: RunResult[] = [];
  const suiteTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suiteDir = path.join(EVALUATIONS_WORKSPACE, `suite_${suiteTimestamp}`);
  await fs.mkdir(suiteDir, { recursive: true });

  console.log(`\nEvidence will be captured in: ${suiteDir}`);

  for (const config of configs) {
    const iters = overrideIterations || config.iterations;
    console.log(`\n==================================================`);
    console.log(`Starting Scenario: ${config.id} (${iters} iterations)`);
    console.log(`Docker Mode: ${config.docker ? "Enabled (" + config.docker.imageName + ")" : "Disabled"}`);
    console.log(`==================================================`);

    for (let i = 1; i <= iters; i++) {
      const runId = `${config.id}-run-${i}`;
      console.log(`\n[${new Date().toISOString()}] Starting ${runId}...`);

      const prompt = config.prompt.replace(/\$RUN_ID/g, runId);
      
      let cmd: string[];
      let targetWorkspace: string;

      if (config.docker) {
          // Docker execution path: Unique isolated directory per run inside the suite folder
          targetWorkspace = path.join(suiteDir, runId);
          await WorkspaceBuilder.buildDockerWorkspace(targetWorkspace);
          
          cmd = ["epochcli", "run", prompt]; // Placeholder, replaced inside AgentRunner constructor
      } else {
          // Local execution path (Fallback)
          targetWorkspace = path.join(suiteDir, runId);
          await fs.mkdir(targetWorkspace, { recursive: true });
          cmd = [LOCAL_EPOCHCLI_CMD, "run", prompt];
      }

      const runner = new AgentRunner(cmd, targetWorkspace, config.timeoutMs, config.docker, runId);
      const res = await runner.run();
      console.log(`  > Agent Execution finished: ${res.status} (${(res.durationMs / 1000).toFixed(1)}s)`);
      console.log(`  > Logs saved to: ${path.join(targetWorkspace, "run.log")}`);

      if (res.fullPrompts && res.fullPrompts.length > 0) {
          await fs.writeFile(path.join(targetWorkspace, "prompts.json"), JSON.stringify(res.fullPrompts, null, 2), "utf-8");
          console.log(`  > Full prompts saved to: ${path.join(targetWorkspace, "prompts.json")}`);
      }

      const usedExpectedTools = res.engine.detectSpecCliUsage(config.expectedTools);
      if (!usedExpectedTools) {
        console.log(`  > Warning: Missing expected tools. Used: ${res.engine.getUsedTools().join(", ")}`);
      }
      
      let finalStatus = res.status;
      let errorMessage = res.errorMessage;

      if (finalStatus === "Success") {
        const relativeTargetDir = config.runTargetDir.replace(/\$RUN_ID/g, runId);
        
        let testsPassed = false;
        
        if (config.docker) {
            console.log(`  > Evaluating tests inside Docker (${relativeTargetDir})...`);
            testsPassed = await TestEvaluator.evaluate(targetWorkspace, config.docker, relativeTargetDir);
        } else {
            const targetDir = path.resolve(targetWorkspace, relativeTargetDir);
            console.log(`  > Evaluating tests locally in ${targetDir}...`);
            testsPassed = await TestEvaluator.evaluate(targetDir);
        }
        
        if (!testsPassed) {
          finalStatus = "Failed_Tests";
          errorMessage = "Test harness 'bun test' failed or workspace not found.";
          console.log(`  > Result: Tests Failed`);
        } else {
          console.log(`  > Result: Tests Passed`);
        }
      }

      allResults.push({
        runId,
        iteration: i,
        durationMs: res.durationMs,
        status: finalStatus,
        usedExpectedTools,
        logPath: path.join(targetWorkspace, "run.log"),
        errorMessage,
        jsonRepairs: res.engine.jsonRepairs,
        avgTps: res.avgTps,
        avgTtftMs: res.avgTtftMs,
        totalTokens: res.totalTokens
      });
    }
  }

  const reportPath = path.join(suiteDir, `variance_report.md`);
  await Reporter.generateMarkdown(allResults, reportPath);
  
  console.log(`\n==================================================`);
  console.log(`All evaluations complete. Evidence and report saved to:`);
  console.log(`-> ${suiteDir}`);
}

main().catch(e => {
  console.error("Fatal Error:", e);
  process.exit(1);
});